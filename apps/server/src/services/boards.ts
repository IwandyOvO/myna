import { BOARD_MEMBERS, type Board, type BoardCategory, type BoardDirection, type BoardPeriod } from '@myna/shared';
import type { Queryable } from '../db/pool';
import { daysToSeasonEnd, seasonOf } from '../lib/season';

const TOP_N = 20;
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; board: Board }>();

/**
 * §6 boards: rank by average (unrounded, so 4.65 beats 4.61) with total as the
 * tie-breaker, among posts with at least `minRatings` ratings. Posts still inside
 * their blind window are excluded — charting them would reveal the average they hide.
 * Cached in-process for a minute; move to Redis when running more than one instance.
 */
export async function getBoard(
  db: Queryable,
  q: { period: BoardPeriod; category: BoardCategory; direction: BoardDirection; minRatings: number; blindHours: number; now?: Date; noCache?: boolean },
): Promise<Board> {
  const now = q.now ?? new Date();
  const season = q.period === 'monthly' ? seasonOf(now) : null;
  const key = `${q.period}|${q.category}|${q.direction}|${season}|${q.minRatings}|${q.blindHours}`;
  const hit = cache.get(key);
  if (!q.noCache && hit && Date.now() - hit.at < CACHE_MS) return hit.board;

  // $4 is the season (null for all-time); both branches reference it so Postgres can type it.
  const stats = season ? `(SELECT * FROM post_season_stats WHERE season = $4::text)` : `(SELECT * FROM post_stats WHERE $4::text IS NULL)`;
  const params: unknown[] = [BOARD_MEMBERS[q.category], q.minRatings, q.blindHours];
  params.push(season, now);
  const precise = '(s.c1 + 2*s.c2 + 3*s.c3 + 4*s.c4 + 5*s.c5)::float8 / s.total';
  const rows = (
    await db.query(
      `SELECT p.id, p.title, p.emoji, p.category, s.avg, s.total
       FROM posts p JOIN ${stats} s ON s.post_id = p.id
       WHERE p.status = 'active' AND NOT (p.blind AND p.created_at > $5::timestamptz - $3 * interval '1 hour')
         AND p.category = ANY($1) AND s.total >= $2
       ORDER BY ${precise} ${q.direction === 'best' ? 'DESC' : 'ASC'}, s.total DESC, p.id
       LIMIT ${TOP_N}`,
      params,
    )
  ).rows;
  const board: Board = {
    period: q.period,
    category: q.category,
    direction: q.direction,
    season,
    minRatings: q.minRatings,
    daysToSettle: season ? daysToSeasonEnd(now) : null,
    entries: rows.map((r, i) => ({ rank: i + 1, post: { id: r.id, title: r.title, emoji: r.emoji, category: r.category }, avg: r.avg, total: r.total })),
  };
  cache.set(key, { at: Date.now(), board });
  return board;
}

export function clearBoardCache() {
  cache.clear();
}
