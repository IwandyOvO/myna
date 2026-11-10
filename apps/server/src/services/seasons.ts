import { BOARD_CATEGORIES } from '@myna/shared';
import type { Db } from '../db/pool';
import { withTx } from '../db/pool';
import { seasonOf } from '../lib/season';
import { getBoard } from './boards';

export interface SeasonAward {
  category: (typeof BOARD_CATEGORIES)[number];
  rank: number;
  postId: string;
  authorId: string;
  title: string;
}

/** The season before `now` ("2026-11" → "2026-10"). */
export function previousSeason(now = new Date()): string {
  return seasonOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)));
}

/**
 * §6 season settlement: freezes the final Top 20 of each "best" board for `season` into
 * season_awards. Idempotent — returns null if the season was already settled.
 */
export async function settleSeason(db: Db, season: string, minRatings: number, blindHours: number): Promise<SeasonAward[] | null> {
  const [y, m] = season.split('-').map(Number) as [number, number];
  const inSeason = new Date(Date.UTC(y, m, 1) - 1); // last instant of the season: selects its stats and judges blind windows at season end
  return withTx(db, async (tx) => {
    const claimed = await tx.query('INSERT INTO season_settlements (season) VALUES ($1) ON CONFLICT DO NOTHING', [season]);
    if (!claimed.rowCount) return null;
    const awards: SeasonAward[] = [];
    for (const category of BOARD_CATEGORIES) {
      const board = await getBoard(tx, { period: 'monthly', category, direction: 'best', minRatings, blindHours, now: inSeason, noCache: true });
      for (const e of board.entries) {
        const author = (await tx.query<{ author_id: string }>('SELECT author_id FROM posts WHERE id = $1', [e.post.id])).rows[0]!.author_id;
        await tx.query(
          'INSERT INTO season_awards (season, category, rank, post_id, author_id, avg, total) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [season, category, e.rank, e.post.id, author, e.avg, e.total],
        );
        awards.push({ category, rank: e.rank, postId: e.post.id, authorId: author, title: e.post.title });
      }
    }
    return awards;
  });
}

export async function seasonAwards(db: Db, season: string) {
  return (
    await db.query(
      `SELECT a.category, a.rank, a.avg, a.total, p.id AS post_id, p.title, p.emoji FROM season_awards a JOIN posts p ON p.id = a.post_id
       WHERE a.season = $1 ORDER BY a.category, a.rank`,
      [season],
    )
  ).rows;
}
