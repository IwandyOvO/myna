import { tasteKey, type TasteProfile } from '@myna/shared';
import type { Queryable } from '../db/pool';

// ---- taste profile ---------------------------------------------------------------------------

/**
 * How a user's ratings compare with everyone else's. Only posts with ≥3 *other* ratings count;
 * "agreement" = you sided (low/mid/high) with the biggest group of the others.
 */
export async function tasteProfile(db: Queryable, userId: string): Promise<TasteProfile> {
  const r = (
    await db.query<{ rated: string; agreed: string; hot: string; avg_tier: string | null }>(
      `WITH mine AS (
         SELECT r.tier,
                (s.c1 + s.c2) - (r.tier <= 2)::int AS lo,
                s.c3 - (r.tier = 3)::int AS mi,
                (s.c4 + s.c5) - (r.tier >= 4)::int AS hi
         FROM ratings r JOIN post_stats s ON s.post_id = r.post_id JOIN posts p ON p.id = r.post_id AND p.status = 'active'
         WHERE r.user_id = $1
       ), scored AS (
         SELECT tier, lo + mi + hi AS n,
                CASE WHEN tier <= 2 THEN lo WHEN tier = 3 THEN mi ELSE hi END AS same,
                greatest(lo, mi, hi) AS top
         FROM mine
       )
       SELECT count(*) FILTER (WHERE n >= 3) AS rated,
              count(*) FILTER (WHERE n >= 3 AND same = top) AS agreed,
              count(*) FILTER (WHERE n >= 3 AND same::float / n < 0.25) AS hot,
              (SELECT round(avg(tier)::numeric, 1) FROM mine) AS avg_tier
       FROM scored`,
      [userId],
    )
  ).rows[0]!;
  const rated = Number(r.rated);
  const agreement = rated ? Math.round((Number(r.agreed) / rated) * 100) : null;
  const avgTier = r.avg_tier === null ? null : Number(r.avg_tier);
  return { key: tasteKey(rated, agreement, avgTier), rated, agreement, avgTier, hotTakes: Number(r.hot) };
}
