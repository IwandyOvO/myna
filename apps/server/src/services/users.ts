import { createHash, randomInt } from 'node:crypto';
import { LOCALES, isLocale, type AuthProvider, type Locale, type Me, type UserSummary, type Visibility } from '@myna/shared';
import type { Queryable } from '../db/pool';
import { HttpError, badRequest, notFound, unauthorized } from '../lib/errors';
import type { VerifiedIdentity } from '../auth/providers';

const AVATARS = ['🐦', '🦜', '🐧', '🦉', '🐤', '🦩', '🦚', '🕊️'];

export const userSummarySql = (alias: string) =>
  `json_build_object('id', ${alias}.id, 'nickname', ${alias}.nickname, 'handle', ${alias}.handle, 'avatar', ${alias}.avatar)`;

function slug(s: string): string {
  const base = s.normalize('NFKD').replace(/[^\w]/g, '').toLowerCase().slice(0, 16);
  return base || 'myna';
}

export async function findOrCreateUser(db: Queryable, provider: AuthProvider, id: VerifiedIdentity, locale: Locale | null): Promise<string> {
  const existing = await db.query<{ user_id: string }>(
    `SELECT i.user_id FROM auth_identities i JOIN users u ON u.id = i.user_id
     WHERE i.provider = $1 AND i.provider_uid = $2 AND u.deleted_at IS NULL`,
    [provider, id.providerUid],
  );
  if (existing.rows[0]) return existing.rows[0].user_id;

  const nickname = (id.name ?? id.email?.split('@')[0] ?? 'Myna friend').slice(0, 24);
  for (let attempt = 0; attempt < 5; attempt++) {
    const handle = `${slug(id.name ?? id.email?.split('@')[0] ?? '')}_${randomInt(100, 1000)}${attempt ? randomInt(10) : ''}`;
    const res = await db.query<{ id: string }>(
      `INSERT INTO users (nickname, handle, avatar, locale) VALUES ($1, $2, $3, $4) ON CONFLICT (handle) DO NOTHING RETURNING id`,
      [nickname, handle, AVATARS[randomInt(AVATARS.length)], locale],
    );
    const userId = res.rows[0]?.id;
    if (!userId) continue;
    await db.query(`INSERT INTO auth_identities (user_id, provider, provider_uid) VALUES ($1, $2, $3)`, [userId, provider, id.providerUid]);
    return userId;
  }
  throw new HttpError(500, 'handle_generation_failed');
}

// ---- e-mail one-time codes -------------------------------------------------

const CODE_TTL_MS = 10 * 60_000;
const RESEND_AFTER_MS = 30_000;
const MAX_ATTEMPTS = 5;

const hashCode = (email: string, code: string, secret: string) => createHash('sha256').update(`${email}:${code}:${secret}`).digest('hex');

export function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) throw badRequest('invalid_email');
  return e;
}

export async function issueEmailCode(db: Queryable, email: string, secret: string): Promise<string> {
  const prev = await db.query<{ expires_at: Date }>('SELECT expires_at FROM email_codes WHERE email = $1', [email]);
  const issuedAt = prev.rows[0] ? prev.rows[0].expires_at.getTime() - CODE_TTL_MS : 0;
  if (Date.now() - issuedAt < RESEND_AFTER_MS) throw new HttpError(429, 'code_recently_sent');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await db.query(
    `INSERT INTO email_codes (email, code_hash, expires_at, attempts) VALUES ($1, $2, $3, 0)
     ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`,
    [email, hashCode(email, code, secret), new Date(Date.now() + CODE_TTL_MS)],
  );
  return code;
}

export async function consumeEmailCode(db: Queryable, email: string, code: string, secret: string): Promise<void> {
  const row = (await db.query<{ code_hash: string; expires_at: Date; attempts: number }>('SELECT * FROM email_codes WHERE email = $1', [email])).rows[0];
  if (!row || row.expires_at < new Date() || row.attempts >= MAX_ATTEMPTS) throw unauthorized('code_invalid');
  if (row.code_hash !== hashCode(email, code.trim(), secret)) {
    await db.query('UPDATE email_codes SET attempts = attempts + 1 WHERE email = $1', [email]);
    throw unauthorized('code_invalid');
  }
  await db.query('DELETE FROM email_codes WHERE email = $1', [email]);
}

// ---- profile -----------------------------------------------------------------

export async function getMe(db: Queryable, userId: string): Promise<Me> {
  const row = (
    await db.query(
      `SELECT u.*,
         (SELECT count(*) FROM posts p WHERE p.author_id = u.id AND p.status = 'active') AS posts,
         (SELECT count(*) FROM ratings r WHERE r.user_id = u.id) AS ratings,
         (SELECT coalesce(sum(c.like_count), 0) FROM comments c WHERE c.user_id = u.id) AS likes
       FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId],
    )
  ).rows[0];
  if (!row) throw unauthorized('user_not_found');
  return {
    id: row.id,
    nickname: row.nickname,
    handle: row.handle,
    avatar: row.avatar,
    reputation: row.reputation,
    locale: isLocale(row.locale) ? row.locale : null,
    stats: { posts: row.posts, ratings: row.ratings, likes: Number(row.likes) },
    settings: {
      contentLangs: (row.content_langs as string[]).filter(isLocale),
      visibility: row.visibility as Visibility,
      notifySocial: row.notify_social,
      notifyRank: row.notify_rank,
    },
  };
}

export async function updateSettings(
  db: Queryable,
  userId: string,
  s: { locale?: Locale | null; contentLangs?: Locale[]; visibility?: Visibility; notifySocial?: boolean; notifyRank?: boolean },
): Promise<void> {
  if (s.contentLangs && s.contentLangs.length === 0) throw badRequest('keep_one_lang');
  await db.query(
    `UPDATE users SET
       locale = CASE WHEN $2::boolean THEN $3 ELSE locale END,
       content_langs = coalesce($4, content_langs),
       visibility = coalesce($5, visibility),
       notify_social = coalesce($6, notify_social),
       notify_rank = coalesce($7, notify_rank)
     WHERE id = $1`,
    [userId, s.locale !== undefined, s.locale ?? null, s.contentLangs ? [...new Set(s.contentLangs)].filter((l) => LOCALES.includes(l)) : null, s.visibility ?? null,
      s.notifySocial ?? null, s.notifyRank ?? null],
  );
}

/**
 * Account deletion (App Store 5.1.1(v)). Personal data and sign-in identities
 * are erased; anonymous ratings stay so post averages and boards remain valid.
 */
export async function deleteAccount(db: Queryable, userId: string): Promise<void> {
  await db.query('DELETE FROM auth_identities WHERE user_id = $1', [userId]);
  await db.query("UPDATE posts SET status = 'removed' WHERE author_id = $1", [userId]);
  await db.query("UPDATE comments SET body = '', status = 'removed' WHERE user_id = $1", [userId]);
  await db.query(`UPDATE ratings SET reason_text = '' WHERE user_id = $1`, [userId]);
  await db.query(
    `UPDATE users SET nickname = 'Deleted user', handle = 'deleted_' || replace(id::text, '-', ''), avatar = '👤',
       avatar_url = NULL, deleted_at = now() WHERE id = $1`,
    [userId],
  );
  for (const t of ['favorites', 'views', 'drafts', 'blocks', 'user_badges', 'reputation_events', 'push_tokens', 'notifications']) await db.query(`DELETE FROM ${t} WHERE user_id = $1`, [userId]);
  await db.query('DELETE FROM follows WHERE follower_id = $1 OR followee_id = $1', [userId]);
}

export async function listBlocks(db: Queryable, userId: string): Promise<UserSummary[]> {
  const r = await db.query(
    `SELECT ${userSummarySql('u')} AS u FROM blocks b JOIN users u ON u.id = b.blocked_user_id WHERE b.user_id = $1 ORDER BY b.created_at DESC`,
    [userId],
  );
  return r.rows.map((x) => x.u);
}

export async function block(db: Queryable, userId: string, target: string): Promise<void> {
  if (userId === target) throw badRequest('cannot_block_self');
  const exists = await db.query('SELECT 1 FROM users WHERE id = $1', [target]);
  if (!exists.rowCount) throw notFound('user_not_found');
  await db.query('INSERT INTO blocks (user_id, blocked_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, target]);
}

export async function unblock(db: Queryable, userId: string, target: string): Promise<void> {
  await db.query('DELETE FROM blocks WHERE user_id = $1 AND blocked_user_id = $2', [userId, target]);
}

export async function addReputation(db: Queryable, userId: string, delta: number, reason: string): Promise<void> {
  // Logs the delta actually applied (after clamping to 0..100) so weekly reports stay honest.
  await db.query(
    `WITH before AS (SELECT reputation FROM users WHERE id = $1 FOR UPDATE),
          upd AS (UPDATE users u SET reputation = least(100, greatest(0, u.reputation + $2)) FROM before
                  WHERE u.id = $1 RETURNING u.reputation - before.reputation AS applied)
     INSERT INTO reputation_events (user_id, delta, reason) SELECT $1, applied, $3 FROM upd WHERE applied <> 0`,
    [userId, delta, reason],
  );
}
