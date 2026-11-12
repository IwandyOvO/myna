import {
  containsBlockedWords, autoTags, editsLeft, isLocale, typeOfCategory, CATEGORY_EMOJI,
  type AutoTagConfig, type Category, type Comment, type CreatePostInput, type Distribution, type Locale,
  type Page, type PostCard, type Tier,
} from '@myna/shared';
import type { Queryable } from '../db/pool';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import { badRequest, notFound } from '../lib/errors';
import { userSummarySql } from './users';

const PAGE = 20;

/** Columns shared by every query that returns PostCards. $1 is always the viewer id (nullable). */
export const CARD_SELECT = `
  SELECT p.id, p.type, p.category, p.title, p.body, p.emoji, p.image_urls, p.lang, p.blind, p.place_name, p.edited_at,
         p.created_at, p.author_id, ${userSummarySql('u')} AS author,
         s.c1, s.c2, s.c3, s.c4, s.c5, s.total, s.avg,
         r.tier AS my_tier, r.reason_text AS my_reason, r.edited_count AS my_edited,
         EXISTS (SELECT 1 FROM favorites fv WHERE fv.post_id = p.id AND fv.user_id = $1::uuid) AS favorited`;
export const CARD_FROM = `
  FROM posts p
  JOIN post_stats s ON s.post_id = p.id
  JOIN users u ON u.id = p.author_id
  LEFT JOIN ratings r ON r.post_id = p.id AND r.user_id = $1::uuid`;
const NOT_BLOCKED = `NOT EXISTS (SELECT 1 FROM blocks b WHERE b.user_id = $1::uuid AND b.blocked_user_id = p.author_id)`;

/** Read-side rules every PostCard depends on. */
export interface CardRules {
  tags: AutoTagConfig;
  blindHours: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toCard(row: any, cfg: CardRules, now = new Date()): PostCard {
  const dist: Distribution = [row.c1, row.c2, row.c3, row.c4, row.c5];
  const myRating = row.my_tier
    ? { tier: row.my_tier as Tier, reason: row.my_reason as string, editedCount: row.my_edited as number, editsLeft: editsLeft(row.my_edited) }
    : null;
  // §4.4 blind posts: average and breakdown stay masked until the viewer has rated,
  // for cfg.blindHours after posting; after that the post is public (and can chart).
  const blindUntil = row.blind ? new Date(row.created_at.getTime() + cfg.blindHours * 3_600_000) : null;
  const blindActive = !!blindUntil && blindUntil > now;
  const locked = blindActive && !myRating;
  const card: PostCard = {
    id: row.id,
    type: row.type,
    category: row.category,
    title: row.title,
    body: row.body,
    emoji: row.emoji,
    imageUrls: row.image_urls,
    lang: row.lang,
    blind: blindActive,
    blindUntil: blindUntil ? blindUntil.toISOString() : null,
    placeName: row.place_name,
    author: row.author,
    createdAt: row.created_at.toISOString(),
    total: row.total,
    avg: locked ? null : row.avg,
    dist: locked ? null : dist,
    locked,
    tags: locked ? [] : autoTags(dist, row.created_at, now, cfg.tags),
    myRating,
    favorited: !!row.favorited,
    editedAt: row.edited_at ? row.edited_at.toISOString() : null,
  };
  // Whole kilometres only (coordinates are on a ~1 km grid); 0 means "under 1 km".
  if (row.distance_km !== undefined && row.distance_km !== null) card.distanceKm = Math.round(row.distance_km);
  return card;
}

export interface FeedQuery {
  viewer: string | null;
  /** hot = popularity + recent rating velocity with time decay; new = newest first (default). */
  sort?: 'hot' | 'new';
  category?: Category;
  langs?: Locale[];
  q?: string;
  cursor?: string;
}

/**
 * Hot score: (log popularity + 2 x ratings in the last 48 h + freshness bonus) / (age in hours + 2)^1.2.
 * A post keeps rising while people are actively rating it and fades with age.
 */
const HOT_SCORE = `((ln(1 + s.total) + 2 * (SELECT count(*) FROM ratings rr WHERE rr.post_id = p.id AND rr.created_at > now() - interval '48 hours') + 1.5)
  / power(extract(epoch FROM now() - p.created_at) / 3600 + 2, 1.2))`;

export async function feed(db: Queryable, cfg: CardRules, f: FeedQuery): Promise<Page<PostCard>> {
  if (f.sort === 'hot' && !f.q?.trim()) return hotFeed(db, cfg, f);
  const cur = decodeCursor(f.cursor);
  const params: unknown[] = [f.viewer];
  const where = [`p.status = 'active'`, NOT_BLOCKED];
  if (f.category) {
    params.push(f.category);
    where.push(`p.category = $${params.length}`);
  }
  if (f.langs?.length) {
    params.push(f.langs);
    where.push(`p.lang = ANY($${params.length})`);
  }
  if (f.q?.trim()) {
    params.push(`%${f.q.trim().replace(/[\\%_]/g, (m) => '\\' + m)}%`);
    where.push(`(p.title ILIKE $${params.length} OR p.body ILIKE $${params.length})`);
  }
  if (cur) {
    params.push(cur.createdAt, cur.id);
    where.push(`(p.created_at, p.id) < ($${params.length - 1}, $${params.length}::uuid)`);
  }
  const rows = (await db.query(`${CARD_SELECT} ${CARD_FROM} WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC, p.id DESC LIMIT ${PAGE + 1}`, params)).rows;
  const more = rows.length > PAGE;
  const items = rows.slice(0, PAGE).map((r) => toCard(r, cfg));
  const last = rows[PAGE - 1];
  return { items, nextCursor: more && last ? encodeCursor(last.created_at, last.id) : null };
}

async function hotFeed(db: Queryable, cfg: CardRules, f: FeedQuery): Promise<Page<PostCard>> {
  const offset = f.cursor ? Number.parseInt(f.cursor, 10) || 0 : 0;
  const params: unknown[] = [f.viewer];
  const where = [`p.status = 'active'`, NOT_BLOCKED];
  if (f.category) {
    params.push(f.category);
    where.push(`p.category = $${params.length}`);
  }
  if (f.langs?.length) {
    params.push(f.langs);
    where.push(`p.lang = ANY($${params.length})`);
  }
  params.push(offset);
  const rows = (
    await db.query(`${CARD_SELECT} ${CARD_FROM} WHERE ${where.join(' AND ')} ORDER BY ${HOT_SCORE} DESC, p.created_at DESC OFFSET $${params.length} LIMIT ${PAGE + 1}`, params)
  ).rows;
  return { items: rows.slice(0, PAGE).map((r) => toCard(r, cfg)), nextCursor: rows.length > PAGE ? String(offset + PAGE) : null };
}

const HAVERSINE = `6371 * 2 * asin(sqrt(power(sin(radians(p.lat - $2) / 2), 2) + cos(radians($2)) * cos(radians(p.lat)) * power(sin(radians(p.lng - $3) / 2), 2)))`;

/** §5.5 — nearby posts ordered by distance. radiusKm undefined = "whole city" (50 km). */
export async function nearby(db: Queryable, cfg: CardRules, viewer: string | null, lat: number, lng: number, radiusKm = 50): Promise<PostCard[]> {
  const rows = (
    await db.query(
      `SELECT * FROM (${CARD_SELECT}, ${HAVERSINE} AS distance_km ${CARD_FROM}
         WHERE p.status = 'active' AND p.lat IS NOT NULL AND ${NOT_BLOCKED}
           AND p.lat BETWEEN $2 - $4 / 111.0 AND $2 + $4 / 111.0) x
       WHERE distance_km <= $4 ORDER BY distance_km LIMIT 50`,
      [viewer, lat, lng, radiusKm],
    )
  ).rows;
  return rows.map((r) => toCard(r, cfg));
}

export async function getPost(db: Queryable, cfg: CardRules, viewer: string | null, id: string): Promise<PostCard> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('post_not_found');
  const row = (await db.query(`${CARD_SELECT} ${CARD_FROM} WHERE p.id = $2 AND p.status = 'active'`, [viewer, id])).rows[0];
  if (!row) throw notFound('post_not_found');
  return toCard(row, cfg);
}

export async function createPost(db: Queryable, authorId: string, input: CreatePostInput): Promise<string> {
  const title = input.title.trim();
  if (!title) throw badRequest('need_title');
  if (containsBlockedWords(title) || containsBlockedWords(input.body ?? '')) throw badRequest('content_blocked');
  if (!isLocale(input.lang)) throw badRequest('invalid_lang');
  const loc = input.location ?? null;
  // Privacy: snap to a ~1 km grid before storing (0.01 deg is about 1.1 km).
  const lat = loc && 'lat' in loc ? Math.round(Number(loc.lat) * 100) / 100 : null;
  const lng = loc && 'lng' in loc ? Math.round(Number(loc.lng) * 100) / 100 : null;
  const res = await db.query<{ id: string }>(
    `INSERT INTO posts (author_id, type, category, title, body, emoji, lang, blind, lat, lng, place_name, image_urls)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [authorId, typeOfCategory(input.category), input.category, title, (input.body ?? '').trim(), input.emoji || CATEGORY_EMOJI[input.category],
      input.lang, !!input.blind, lat, lng, loc?.placeName?.trim() || null, input.imageUrls ?? []],
  );
  const id = res.rows[0]!.id;
  await db.query('INSERT INTO post_stats (post_id) VALUES ($1)', [id]);
  return id;
}

const REPLY_PREVIEW = 3;
const MAX_REPLY = 500;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toComment(c: any, locked: boolean, replies: Comment[] = []): Comment {
  return {
    id: c.id,
    author: c.author,
    tier: locked || c.parent_id ? null : c.tier_snapshot,
    parentId: c.parent_id ?? null,
    replyCount: Number(c.reply_count ?? 0),
    replies,
    body: c.body,
    likeCount: c.like_count,
    likedByMe: c.liked,
    edited: c.edited,
    mine: c.mine,
    createdAt: c.created_at.toISOString(),
  };
}

/** Columns + visibility rules shared by comment and reply queries. $1 = viewer. */
const COMMENT_COLS = `c.id, c.parent_id, c.tier_snapshot, c.body, c.like_count, c.edited, c.created_at, ${userSummarySql('u')} AS author,
  (c.user_id = $1::uuid) AS mine,
  EXISTS (SELECT 1 FROM comment_likes l WHERE l.comment_id = c.id AND l.user_id = $1::uuid) AS liked`;
const COMMENT_VISIBLE = `c.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.user_id = $1::uuid AND b.blocked_user_id = c.user_id)`;
/** Visible replies (blocked authors hidden); `c` here is the parent. */
const REPLY_COUNT = `(SELECT count(*) FROM comments r WHERE r.parent_id = c.id AND r.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.user_id = $1::uuid AND b.blocked_user_id = r.user_id))`;

async function postLock(db: Queryable, viewer: string | null, postId: string, blindHours: number): Promise<boolean> {
  const post = (
    await db.query<{ blind: boolean; rated: boolean }>(
      `SELECT (p.blind AND p.created_at > now() - $3 * interval '1 hour') AS blind,
              EXISTS (SELECT 1 FROM ratings r WHERE r.post_id = p.id AND r.user_id = $2::uuid) AS rated
       FROM posts p WHERE p.id = $1 AND p.status = 'active'`,
      [postId, viewer, blindHours],
    )
  ).rows[0];
  if (!post) throw notFound('post_not_found');
  return post.blind && !post.rated;
}

export async function listComments(
  db: Queryable, viewer: string | null, postId: string, tier: Tier | undefined, cursor: string | undefined, blindHours: number,
): Promise<Page<Comment>> {
  const locked = await postLock(db, viewer, postId, blindHours);
  const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
  const rows = (
    await db.query(
      `SELECT ${COMMENT_COLS}, ${REPLY_COUNT} AS reply_count
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = $2 AND c.parent_id IS NULL AND ${COMMENT_VISIBLE} AND ($3::int IS NULL OR c.tier_snapshot = $3)
         -- §5.8 "who can see my ratings": everyone / people the author follows / only the author.
         -- Hidden ratings still count in the averages; only the comment is withheld.
         AND (c.user_id = $1::uuid OR u.visibility = 'everyone'
              OR (u.visibility = 'following' AND EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = c.user_id AND f.followee_id = $1::uuid)))
       ORDER BY mine DESC, c.like_count DESC, c.created_at DESC
       OFFSET $4 LIMIT ${PAGE + 1}`,
      // Tier filtering would reveal tiers on a locked blind post, so it is ignored there.
      [viewer, postId, locked ? null : (tier ?? null), offset],
    )
  ).rows.slice(0, PAGE + 1);
  const page = rows.slice(0, PAGE);
  // First few replies of every comment on this page, oldest first.
  const replyRows = page.length
    ? (
        await db.query(
          `SELECT * FROM (
             SELECT ${COMMENT_COLS}, row_number() OVER (PARTITION BY c.parent_id ORDER BY c.created_at) AS rn
             FROM comments c JOIN users u ON u.id = c.user_id
             WHERE c.parent_id = ANY($2::uuid[]) AND ${COMMENT_VISIBLE}) x
           WHERE rn <= ${REPLY_PREVIEW} ORDER BY created_at`,
          [viewer, page.map((c) => c.id)],
        )
      ).rows
    : [];
  return {
    items: page.map((c) => toComment(c, locked, replyRows.filter((r) => r.parent_id === c.id).map((r) => toComment(r, locked)))),
    nextCursor: rows.length > PAGE ? String(offset + PAGE) : null,
  };
}

export async function listReplies(db: Queryable, viewer: string | null, commentId: string): Promise<Comment[]> {
  const rows = (
    await db.query(
      `SELECT ${COMMENT_COLS} FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.parent_id = $2 AND ${COMMENT_VISIBLE} ORDER BY c.created_at LIMIT 500`,
      [viewer, commentId],
    )
  ).rows;
  return rows.map((r) => toComment(r, false));
}

/** §4.6 reply to a top-level comment (replies to replies attach to the same thread). */
export async function createReply(db: Queryable, userId: string, commentId: string, body: string) {
  const text = body.trim().slice(0, MAX_REPLY);
  if (!text) throw badRequest('empty_reply');
  if (containsBlockedWords(text)) throw badRequest('content_blocked');
  const target = (
    await db.query<{ id: string; parent_id: string | null; post_id: string; user_id: string }>(
      `SELECT c.id, c.parent_id, c.post_id, c.user_id FROM comments c JOIN posts p ON p.id = c.post_id AND p.status = 'active'
       WHERE c.id = $1 AND c.status = 'active'`,
      [commentId],
    )
  ).rows[0];
  if (!target) throw notFound('comment_not_found');
  const threadId = target.parent_id ?? target.id;
  const r = await db.query<{ id: string }>(
    'INSERT INTO comments (post_id, user_id, parent_id, body) VALUES ($1, $2, $3, $4) RETURNING id',
    [target.post_id, userId, threadId, text],
  );
  return { id: r.rows[0]!.id, postId: target.post_id, threadId, recipientId: target.user_id, text };
}

/** Authors can delete their own replies. Rating comments are changed through the rating itself. */
export async function deleteReply(db: Queryable, userId: string, commentId: string): Promise<void> {
  const r = await db.query("UPDATE comments SET status = 'removed' WHERE id = $1 AND user_id = $2 AND parent_id IS NOT NULL AND status = 'active'", [commentId, userId]);
  if (!r.rowCount) throw notFound('reply_not_found');
}

export async function setCommentLike(db: Queryable, userId: string, commentId: string, liked: boolean): Promise<number> {
  const exists = await db.query("SELECT 1 FROM comments WHERE id = $1 AND status = 'active'", [commentId]);
  if (!exists.rowCount) throw notFound('comment_not_found');
  const changed = liked
    ? await db.query('INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [commentId, userId])
    : await db.query('DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2', [commentId, userId]);
  const r = await db.query<{ like_count: number }>(
    'UPDATE comments SET like_count = greatest(0, like_count + $2) WHERE id = $1 RETURNING like_count',
    [commentId, changed.rowCount ? (liked ? 1 : -1) : 0],
  );
  return r.rows[0]!.like_count;
}

export async function myPosts(db: Queryable, cfg: CardRules, userId: string): Promise<PostCard[]> {
  const rows = (await db.query(`${CARD_SELECT} ${CARD_FROM} WHERE p.author_id = $1 AND p.status = 'active' ORDER BY p.created_at DESC LIMIT 100`, [userId])).rows;
  return rows.map((r) => toCard(r, cfg));
}

export async function myRatedPosts(db: Queryable, cfg: CardRules, userId: string): Promise<PostCard[]> {
  const rows = (
    await db.query(`${CARD_SELECT} ${CARD_FROM} WHERE r.user_id = $1 AND p.status = 'active' ORDER BY r.updated_at DESC LIMIT 100`, [userId])
  ).rows;
  return rows.map((r) => toCard(r, cfg));
}

/** Distinct reporters needed before content is hidden pending review (App Store 1.2). */
export const AUTO_HIDE_REPORTS = 3;

export async function report(db: Queryable, reporterId: string, target: { postId?: string; commentId?: string }, reason: string, note: string): Promise<{ hidden: boolean }> {
  if (!target.postId && !target.commentId) throw badRequest('report_target_required');
  await db.query(
    'INSERT INTO reports (reporter_id, post_id, comment_id, reason, note) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
    [reporterId, target.commentId ? null : target.postId ?? null, target.commentId ?? null, reason, note.slice(0, 500)],
  );
  const col = target.commentId ? 'comment_id' : 'post_id';
  const id = target.commentId ?? target.postId;
  const n = Number((await db.query(`SELECT count(DISTINCT reporter_id) AS n FROM reports WHERE ${col} = $1 AND status = 'open'`, [id])).rows[0].n);
  if (n < AUTO_HIDE_REPORTS) return { hidden: false };
  const table = target.commentId ? 'comments' : 'posts';
  const r = await db.query(`UPDATE ${table} SET status = 'hidden' WHERE id = $1 AND status = 'active'`, [id]);
  return { hidden: (r.rowCount ?? 0) > 0 };
}

// ---- own posts: edit & delete -------------------------------------------------------------
export async function editPost(db: Queryable, userId: string, postId: string, p: { title?: string; body?: string; emoji?: string; imageUrls?: string[] }): Promise<void> {
  const title = p.title?.trim();
  if (title !== undefined && !title) throw badRequest('need_title');
  if (containsBlockedWords(title ?? '') || containsBlockedWords(p.body ?? '')) throw badRequest('content_blocked');
  const r = await db.query(
    `UPDATE posts SET title = coalesce($3, title), body = coalesce($4, body), emoji = coalesce($5, emoji),
       image_urls = coalesce($6, image_urls), edited_at = now()
     WHERE id = $1 AND author_id = $2 AND status = 'active'`,
    [postId, userId, title ?? null, p.body?.trim() ?? null, p.emoji ?? null, p.imageUrls ?? null],
  );
  if (!r.rowCount) throw notFound('post_not_found');
}

/** Authors can delete their posts: hidden from every list; ratings stay as anonymous history. */
export async function deletePost(db: Queryable, userId: string, postId: string): Promise<void> {
  const r = await db.query("UPDATE posts SET status = 'removed' WHERE id = $1 AND author_id = $2 AND status IN ('active', 'hidden')", [postId, userId]);
  if (!r.rowCount) throw notFound('post_not_found');
}
