import { isLocale, notificationText, type Notification } from '@myna/shared';
import type { Queryable } from '../db/pool';
import { userSummarySql } from './users';

export type NotificationType = Notification['type'];

/** Where a push goes. ExpoPusher in production; tests inject a recorder. */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: { url: string };
}
export interface Pusher {
  /** Returns the tokens the push service says are no longer valid (to be deleted). */
  send(messages: PushMessage[]): Promise<string[]>;
}

/** Expo Push API (https://docs.expo.dev/push-notifications/sending-notifications/). */
export class ExpoPusher implements Pusher {
  constructor(
    private accessToken?: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}
  async send(messages: PushMessage[]): Promise<string[]> {
    const dead: string[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const res = await this.fetchImpl('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}) },
        body: JSON.stringify(batch.map((m) => ({ ...m, sound: 'default' }))),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: { status: string; details?: { error?: string } }[] };
      json.data?.forEach((r, j) => {
        if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') dead.push(batch[j]!.to);
      });
    }
    return dead;
  }
}

export class NoopPusher implements Pusher {
  async send() {
    return [];
  }
}

export interface NotifyInput {
  userId: string; // recipient
  type: NotificationType;
  actorId?: string | null;
  postId?: string | null;
  commentId?: string | null;
  data?: Record<string, string | number>;
}

const SOCIAL: NotificationType[] = ['reply', 'like', 'follow'];

/** Deep link the app opens when the notification is tapped. */
export function urlFor(n: { type: NotificationType; post_id?: string | null; actor_id?: string | null }): string {
  if (n.type === 'follow' && n.actor_id) return `/user/${n.actor_id}`;
  if (n.type === 'badge') return '/achievements';
  return n.post_id ? `/post/${n.post_id}` : '/notifications';
}

/**
 * Creates a notification (unless it is about yourself, the recipient blocked the actor, or it is a
 * duplicate like/follow) and pushes it to the recipient's devices if their preferences allow.
 * Never throws: a failed notification must not fail the action that caused it.
 */
export async function notify(db: Queryable, pusher: Pusher, n: NotifyInput, log?: (e: unknown) => void): Promise<void> {
  try {
    if (n.actorId && n.actorId === n.userId) return;
    if (n.actorId) {
      const blocked = await db.query('SELECT 1 FROM blocks WHERE user_id = $1 AND blocked_user_id = $2', [n.userId, n.actorId]);
      if (blocked.rowCount) return;
    }
    const ins = await db.query<{ id: string }>(
      `INSERT INTO notifications (user_id, type, actor_id, post_id, comment_id, data) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING RETURNING id`,
      [n.userId, n.type, n.actorId ?? null, n.postId ?? null, n.commentId ?? null, n.data ?? {}],
    );
    if (!ins.rowCount) return; // duplicate like/follow
    const who = (
      await db.query<{ locale: string | null; notify_social: boolean; notify_rank: boolean; actor: string | null }>(
        `SELECT u.locale, u.notify_social, u.notify_rank, (SELECT nickname FROM users WHERE id = $2::uuid) AS actor
         FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`,
        [n.userId, n.actorId ?? null],
      )
    ).rows[0];
    if (!who) return;
    if (SOCIAL.includes(n.type) ? !who.notify_social : !who.notify_rank) return;
    const tokens = (await db.query<{ token: string }>('SELECT token FROM push_tokens WHERE user_id = $1', [n.userId])).rows.map((r) => r.token);
    if (!tokens.length) return;
    const locale = isLocale(who.locale) ? who.locale : 'en';
    const msg = notificationText(locale, n.type, who.actor, n.data ?? {});
    const url = urlFor({ type: n.type, post_id: n.postId, actor_id: n.actorId });
    const dead = await pusher.send(tokens.map((to) => ({ to, ...msg, data: { url } })));
    if (dead.length) await db.query('DELETE FROM push_tokens WHERE token = ANY($1)', [dead]);
  } catch (e) {
    log?.(e);
  }
}

export async function listNotifications(db: Queryable, userId: string): Promise<{ items: Notification[]; unread: number }> {
  const rows = (
    await db.query(
      `SELECT n.id, n.type, n.post_id, n.comment_id, n.data, n.read_at, n.created_at, n.actor_id,
              CASE WHEN a.id IS NULL THEN NULL ELSE ${userSummarySql('a')} END AS actor, p.title AS post_title
       FROM notifications n
       LEFT JOIN users a ON a.id = n.actor_id AND a.deleted_at IS NULL
       LEFT JOIN posts p ON p.id = n.post_id
       WHERE n.user_id = $1
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.user_id = $1 AND b.blocked_user_id = n.actor_id)
       ORDER BY n.created_at DESC LIMIT 100`,
      [userId],
    )
  ).rows;
  const unread = Number((await db.query('SELECT count(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId])).rows[0].n);
  return {
    unread,
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      actor: r.actor,
      postId: r.post_id,
      postTitle: r.post_title,
      data: r.data,
      read: !!r.read_at,
      url: urlFor(r),
      createdAt: r.created_at.toISOString(),
    })),
  };
}

export async function unreadCount(db: Queryable, userId: string): Promise<number> {
  return Number((await db.query('SELECT count(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId])).rows[0].n);
}

export async function markAllRead(db: Queryable, userId: string): Promise<void> {
  await db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
}

export async function registerPushToken(db: Queryable, userId: string, token: string, platform: string): Promise<void> {
  // A device token belongs to whoever signed in on that device most recently.
  await db.query(
    `INSERT INTO push_tokens (token, user_id, platform) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, created_at = now()`,
    [token, userId, platform],
  );
}

export async function removePushToken(db: Queryable, userId: string, token: string): Promise<void> {
  await db.query('DELETE FROM push_tokens WHERE token = $1 AND user_id = $2', [token, userId]);
}
