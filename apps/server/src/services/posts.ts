import {
  autoTags, editsLeft, isLocale, typeOfCategory, CATEGORY_EMOJI,
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
  SELECT p.id, p.type, p.category, p.title, p.body, p.emoji, p.image_urls, p.lang, p.blind, p.place_name,
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
  };
  if (row.distance_km !== undefined && row.distance_km !== null) card.distanceKm = Math.round(row.distance_km * 10) / 10;
  return card;
}

export interface FeedQuery {
  viewer: string | null;
  category?: Category;
  langs?: Locale[];
  q?: string;
  cursor?: string;
}

export async function feed(db: Queryable, cfg: CardRules, f: FeedQuery): Promise<Page<PostCard>> {
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
  if (!isLocale(input.lang)) throw badRequest('invalid_lang');
  const loc = input.location ?? null;
  const lat = loc && 'lat' in loc ? loc.lat : null;
  const lng = loc && 'lng' in loc ? loc.lng : null;
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

export async function listComments(
  db: Queryable, viewer: string | null, postId: string, tier: Tier | undefined, cursor: string | undefined, blindHours: number,
): Promise<Page<Comment>> {
  const post = (
    await db.query<{ blind: boolean; rated: boolean }>(
      `SELECT (p.blind AND p.created_at > now() - $3 * interval '1 hour') AS blind,
              EXISTS (SELECT 1 FROM ratings r WHERE r.post_id = p.id AND r.user_id = $2::uuid) AS rated
       FROM posts p WHERE p.id = $1 AND p.status = 'active'`,
      [postId, viewer, blindHours],
    )
  ).rows[0];
  if (!post) throw notFound('post_not_found');
  const locked = post.blind && !post.rated;
  const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
  const rows = (
    await db.query(
      `SELECT c.id, c.tier_snapshot, c.body, c.like_count, c.edited, c.created_at, ${userSummarySql('u')} AS author,
              (c.user_id = $1::uuid) AS mine,
              EXISTS (SELECT 1 FROM comment_likes l WHERE l.comment_id = c.id AND l.user_id = $1::uuid) AS liked
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = $2 AND c.status = 'active' AND ($3::int IS NULL OR c.tier_snapshot = $3)
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.user_id = $1::uuid AND b.blocked_user_id = c.user_id)
       ORDER BY mine DESC, c.like_count DESC, c.created_at DESC
       OFFSET $4 LIMIT ${PAGE + 1}`,
      // Tier filtering would reveal tiers on a locked blind post, so it is ignored there.
      [viewer, postId, locked ? null : (tier ?? null), offset],
    )
  ).rows;
  return {
    items: rows.slice(0, PAGE).map((c) => ({
      id: c.id,
      author: c.author,
      tier: locked ? null : c.tier_snapshot,
      body: c.body,
      likeCount: c.like_count,
      likedByMe: c.liked,
      edited: c.edited,
      mine: c.mine,
      createdAt: c.created_at.toISOString(),
    })),
    nextCursor: rows.length > PAGE ? String(offset + PAGE) : null,
  };
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

export async function report(db: Queryable, reporterId: string, target: { postId?: string; commentId?: string }, reason: string, note: string): Promise<void> {
  if (!target.postId && !target.commentId) throw badRequest('report_target_required');
  await db.query('INSERT INTO reports (reporter_id, post_id, comment_id, reason, note) VALUES ($1, $2, $3, $4, $5)', [
    reporterId, target.postId ?? null, target.commentId ?? null, reason, note.slice(0, 500),
  ]);
}
