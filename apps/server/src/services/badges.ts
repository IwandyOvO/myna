import { BOARD_CATEGORIES, type Badge, type Locale, type Weekly } from '@myna/shared';
import type { Queryable } from '../db/pool';
import { getBoard } from './boards';

/** Metrics a badge rule can reference: {"metric": <Metric>, "target": n}. */
export type Metric =
  | 'streak_days' | 'first_rates' | 'early_warnings' | 'posts' | 'text_ratings' | 'prophet'
  | 'night_ratings' | 'monthly_top20' | 'reputation' | 'long_reviews' | 'monthly_top1';

/**
 * Computes the metric values for one user. All time-of-day logic uses UTC
 * until users carry a time zone (open question, see docs/IMPLEMENTATION.md).
 */
export async function computeMetrics(db: Queryable, userId: string, boardMinRatings: number): Promise<Record<Metric, number>> {
  const one = async (sql: string) => Number((await db.query(sql, [userId])).rows[0]?.n ?? 0);

  const days = (
    await db.query<{ d: string }>(
      `SELECT DISTINCT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d FROM ratings
       WHERE user_id = $1 AND created_at > now() - interval '400 days' ORDER BY d DESC`,
      [userId],
    )
  ).rows.map((r) => r.d);
  let streak = 0;
  const cursor = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (days[0] !== fmt(cursor)) cursor.setUTCDate(cursor.getUTCDate() - 1); // a streak survives until today ends
  for (const d of days) {
    if (d !== fmt(cursor)) break;
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let top20 = 0;
  let top1 = 0;
  const mine = new Set((await db.query<{ id: string }>('SELECT id FROM posts WHERE author_id = $1', [userId])).rows.map((r) => r.id));
  for (const category of BOARD_CATEGORIES) {
    const b = await getBoard(db, { period: 'monthly', category, direction: 'best', minRatings: boardMinRatings });
    for (const e of b.entries) if (mine.has(e.post.id)) { top20++; if (e.rank === 1) top1++; }
  }

  return {
    streak_days: streak,
    first_rates: await one(
      `SELECT count(*) AS n FROM ratings r WHERE r.user_id = $1
       AND NOT EXISTS (SELECT 1 FROM ratings e WHERE e.post_id = r.post_id AND e.created_at < r.created_at)`,
    ),
    early_warnings: await one(
      `WITH ranked AS (
         SELECT r.user_id, r.tier, r.post_id, row_number() OVER (PARTITION BY r.post_id ORDER BY r.created_at) AS rn
         FROM ratings r WHERE r.post_id IN (SELECT post_id FROM ratings WHERE user_id = $1))
       SELECT count(*) AS n FROM ranked k JOIN post_stats s ON s.post_id = k.post_id
       WHERE k.user_id = $1 AND k.rn <= 10 AND k.tier <= 2 AND s.avg < 2.5`,
    ),
    posts: await one(`SELECT count(*) AS n FROM posts WHERE author_id = $1 AND status = 'active'`),
    text_ratings: await one(`SELECT count(*) AS n FROM ratings WHERE user_id = $1 AND length(trim(reason_text)) > 0`),
    prophet: await one(
      `SELECT count(*) AS n FROM ratings r JOIN post_stats s ON s.post_id = r.post_id
       WHERE r.user_id = $1 AND s.total >= 20 AND abs(r.tier - s.avg) < 0.3`,
    ),
    night_ratings: await one(`SELECT count(*) AS n FROM ratings WHERE user_id = $1 AND extract(hour FROM created_at AT TIME ZONE 'UTC') < 5`),
    monthly_top20: top20,
    reputation: await one(`SELECT reputation AS n FROM users WHERE id = $1`),
    long_reviews: await one(`SELECT count(*) AS n FROM ratings WHERE user_id = $1 AND char_length(reason_text) >= 50`),
    monthly_top1: top1,
  };
}

const pickLang = (m: Record<string, string>, l: Locale) => m[l] ?? m.en ?? m.zh ?? '';

/** Badge wall for a user; unlocks any badge whose target is now met (idempotent). */
export async function badgeWall(db: Queryable, userId: string, locale: Locale, boardMinRatings: number): Promise<Badge[]> {
  const metrics = await computeMetrics(db, userId, boardMinRatings);
  const defs = (await db.query('SELECT * FROM badges ORDER BY sort, id')).rows;
  for (const b of defs) {
    if ((metrics[b.rule.metric as Metric] ?? 0) >= b.rule.target) {
      await db.query('INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, b.id]);
    }
  }
  const unlocked = new Map(
    (await db.query<{ badge_id: number; unlocked_at: Date }>('SELECT badge_id, unlocked_at FROM user_badges WHERE user_id = $1', [userId])).rows.map((r) => [
      r.badge_id,
      r.unlocked_at,
    ]),
  );
  return defs.map((b) => {
    const at = unlocked.get(b.id);
    const target = b.rule.target as number;
    return {
      key: b.key,
      icon: b.icon,
      name: pickLang(b.name_i18n, locale),
      desc: pickLang(b.desc_i18n, locale),
      cond: pickLang(b.cond_i18n, locale),
      unlockedAt: at ? at.toISOString() : null,
      progress: { current: at ? target : Math.min(target, metrics[b.rule.metric as Metric] ?? 0), target },
    };
  });
}

export async function weekly(db: Queryable, userId: string): Promise<Weekly> {
  const r = (
    await db.query(
      `SELECT
         (SELECT count(*) FROM ratings WHERE user_id = $1 AND created_at > now() - interval '7 days') AS ratings,
         (SELECT count(*) FROM user_badges WHERE user_id = $1 AND unlocked_at > now() - interval '7 days') AS badges,
         (SELECT coalesce(sum(delta), 0) FROM reputation_events WHERE user_id = $1 AND created_at > now() - interval '7 days') AS rep`,
      [userId],
    )
  ).rows[0];
  return { ratings: r.ratings, newBadges: r.badges, reputationDelta: Number(r.rep) };
}
