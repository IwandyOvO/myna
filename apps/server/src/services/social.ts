import type { Page, PostCard, UserProfile, LikeReceived, Draft } from '@myna/shared';
import type { Queryable } from '../db/pool';
import { badRequest, notFound } from '../lib/errors';
import { CARD_FROM, CARD_SELECT, toCard, type CardRules } from './posts';
import { userSummarySql } from './users';

const UUID = /^[0-9a-f-]{36}$/i;
const ensurePost = async (db: Queryable, postId: string) => {
  if (!UUID.test(postId) || !(await db.query("SELECT 1 FROM posts WHERE id = $1 AND status = 'active'", [postId])).rowCount) throw notFound('post_not_found');
};

// ---- favourites (§5.6 收藏) ---------------------------------------------------------
export async function setFavorite(db: Queryable, userId: string, postId: string, on: boolean): Promise<void> {
  await ensurePost(db, postId);
  if (on) await db.query('INSERT INTO favorites (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, postId]);
  else await db.query('DELETE FROM favorites WHERE user_id = $1 AND post_id = $2', [userId, postId]);
}

export async function favorites(db: Queryable, cfg: CardRules, userId: string): Promise<PostCard[]> {
  const rows = (
    await db.query(
      `${CARD_SELECT} ${CARD_FROM} JOIN favorites f ON f.post_id = p.id AND f.user_id = $1
       WHERE p.status = 'active' ORDER BY f.created_at DESC LIMIT 200`,
      [userId],
    )
  ).rows;
  return rows.map((r) => toCard(r, cfg));
}

// ---- browsing history (§5.6 浏览历史) -----------------------------------------------
export async function recordView(db: Queryable, userId: string, postId: string): Promise<void> {
  await db.query(
    `INSERT INTO views (user_id, post_id, ts) VALUES ($1, $2, now())
     ON CONFLICT (user_id, post_id) DO UPDATE SET ts = now()`,
    [userId, postId],
  );
}

export async function history(db: Queryable, cfg: CardRules, userId: string): Promise<PostCard[]> {
  const rows = (
    await db.query(
      `${CARD_SELECT} ${CARD_FROM} JOIN views v ON v.post_id = p.id AND v.user_id = $1
       WHERE p.status = 'active' ORDER BY v.ts DESC LIMIT 200`,
      [userId],
    )
  ).rows;
  return rows.map((r) => toCard(r, cfg));
}

export async function clearHistory(db: Queryable, userId: string): Promise<void> {
  await db.query('DELETE FROM views WHERE user_id = $1', [userId]);
}

// ---- drafts (§5.6 草稿箱: open a draft to keep editing the publish page) --------------
const MAX_DRAFTS = 50;
const MAX_DRAFT_BYTES = 20_000;

export async function listDrafts(db: Queryable, userId: string): Promise<Draft[]> {
  const rows = (await db.query('SELECT id, payload_json, updated_at FROM drafts WHERE user_id = $1 ORDER BY updated_at DESC', [userId])).rows;
  return rows.map((r) => ({ id: r.id, payload: r.payload_json, updatedAt: r.updated_at.toISOString() }));
}

export async function saveDraft(db: Queryable, userId: string, id: string | undefined, payload: Draft['payload']): Promise<Draft> {
  if (JSON.stringify(payload).length > MAX_DRAFT_BYTES) throw badRequest('draft_too_large');
  if (id) {
    const r = await db.query('UPDATE drafts SET payload_json = $3, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING id, payload_json, updated_at', [id, userId, payload]);
    if (!r.rows[0]) throw notFound('draft_not_found');
    return { id: r.rows[0].id, payload: r.rows[0].payload_json, updatedAt: r.rows[0].updated_at.toISOString() };
  }
  const count = (await db.query<{ n: number }>('SELECT count(*) AS n FROM drafts WHERE user_id = $1', [userId])).rows[0]!.n;
  if (count >= MAX_DRAFTS) throw badRequest('too_many_drafts');
  const r = await db.query('INSERT INTO drafts (user_id, payload_json) VALUES ($1, $2) RETURNING id, payload_json, updated_at', [userId, payload]);
  return { id: r.rows[0].id, payload: r.rows[0].payload_json, updatedAt: r.rows[0].updated_at.toISOString() };
}

export async function deleteDraft(db: Queryable, userId: string, id: string): Promise<void> {
  await db.query('DELETE FROM drafts WHERE id = $1 AND user_id = $2', [id, userId]);
}

// ---- likes received (§5.6 获赞记录) --------------------------------------------------
export async function likesReceived(db: Queryable, userId: string): Promise<LikeReceived[]> {
  const rows = (
    await db.query(
      `SELECT l.created_at, ${userSummarySql('u')} AS liker, c.body, c.tier_snapshot, p.id AS post_id, p.title, p.category
       FROM comment_likes l
       JOIN comments c ON c.id = l.comment_id AND c.user_id = $1
       JOIN posts p ON p.id = c.post_id AND p.status = 'active'
       JOIN users u ON u.id = l.user_id AND u.deleted_at IS NULL
       WHERE l.user_id <> $1
       ORDER BY l.created_at DESC LIMIT 200`,
      [userId],
    )
  ).rows;
  return rows.map((r) => ({
    liker: r.liker,
    commentBody: r.body,
    tier: r.tier_snapshot,
    post: { id: r.post_id, title: r.title, category: r.category },
    createdAt: r.created_at.toISOString(),
  }));
}

// ---- user profiles & follows (§5.6 关注) ---------------------------------------------
export async function profile(db: Queryable, cfg: CardRules, viewer: string | null, userId: string): Promise<UserProfile> {
  if (!UUID.test(userId)) throw notFound('user_not_found');
  const u = (
    await db.query(
      `SELECT u.id, u.nickname, u.handle, u.avatar, u.reputation, u.visibility,
         (SELECT count(*) FROM posts p WHERE p.author_id = u.id AND p.status = 'active') AS posts,
         (SELECT count(*) FROM ratings r WHERE r.user_id = u.id) AS ratings,
         (SELECT count(*) FROM follows f WHERE f.followee_id = u.id) AS followers,
         (SELECT count(*) FROM follows f WHERE f.follower_id = u.id) AS following,
         EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $2::uuid AND f.followee_id = u.id) AS followed_by_me,
         EXISTS (SELECT 1 FROM blocks b WHERE b.user_id = $2::uuid AND b.blocked_user_id = u.id) AS blocked_by_me
       FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId, viewer],
    )
  ).rows[0];
  if (!u) throw notFound('user_not_found');
  const posts = u.blocked_by_me
    ? []
    : (await db.query(`${CARD_SELECT} ${CARD_FROM} WHERE p.author_id = $2 AND p.status = 'active' ORDER BY p.created_at DESC LIMIT 50`, [viewer, userId])).rows.map(
        (r) => toCard(r, cfg),
      );
  return {
    user: { id: u.id, nickname: u.nickname, handle: u.handle, avatar: u.avatar },
    reputation: u.reputation,
    stats: { posts: u.posts, ratings: u.ratings, followers: u.followers, following: u.following },
    followedByMe: u.followed_by_me,
    blockedByMe: u.blocked_by_me,
    isMe: viewer === u.id,
    posts,
  };
}

export async function setFollow(db: Queryable, me: string, target: string, on: boolean): Promise<void> {
  if (!UUID.test(target)) throw notFound('user_not_found');
  if (me === target) throw badRequest('cannot_follow_self');
  if (on) {
    const exists = await db.query('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL', [target]);
    if (!exists.rowCount) throw notFound('user_not_found');
    await db.query('INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [me, target]);
  } else await db.query('DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2', [me, target]);
}

export async function following(db: Queryable, me: string): Promise<Page<import('@myna/shared').UserSummary>['items']> {
  const r = await db.query(
    `SELECT ${userSummarySql('u')} AS u FROM follows f JOIN users u ON u.id = f.followee_id AND u.deleted_at IS NULL
     WHERE f.follower_id = $1 ORDER BY f.created_at DESC`,
    [me],
  );
  return r.rows.map((x) => x.u);
}
