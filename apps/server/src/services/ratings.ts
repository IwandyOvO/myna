import { MAX_EDITS, containsBlockedWords, type RateInput, type Tier } from '@myna/shared';
import { withTx, type Db, type Tx } from '../db/pool';
import { badRequest, conflict, notFound } from '../lib/errors';
import { seasonOf } from '../lib/season';
import { addReputation } from './users';

/** Reputation reward for a first rating — matches the "Rated! Reputation +2" copy. */
export const RATE_REPUTATION = 2;
const MAX_REASON = 500;

// tier is validated to 1..5 before reaching here, so interpolating the column name is safe.
const col = (t: Tier) => `c${t}`;

async function bump(tx: Tx, postId: string, season: string, tier: Tier, by: 1 | -1) {
  const c = col(tier);
  await tx.query(`UPDATE post_stats SET ${c} = ${c} + $2 WHERE post_id = $1`, [postId, by]);
  await tx.query(
    `INSERT INTO post_season_stats (post_id, season, ${c}) VALUES ($1, $2, greatest($3, 0))
     ON CONFLICT (post_id, season) DO UPDATE SET ${c} = post_season_stats.${c} + $3`,
    [postId, season, by],
  );
}

/** §4.5 first rating: picks a tier, optional reason; mirrored into the comment stream. */
export async function rate(db: Db, userId: string, postId: string, input: RateInput): Promise<void> {
  const reason = (input.reason ?? '').trim().slice(0, MAX_REASON);
  if (containsBlockedWords(reason)) throw badRequest('content_blocked');
  await withTx(db, async (tx) => {
    const post = await tx.query("SELECT id FROM posts WHERE id = $1 AND status = 'active' FOR SHARE", [postId]);
    if (!post.rowCount) throw notFound('post_not_found');
    const season = seasonOf();
    const ins = await tx.query<{ id: string }>(
      `INSERT INTO ratings (post_id, user_id, tier, reason_text, season) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (post_id, user_id) DO NOTHING RETURNING id`,
      [postId, userId, input.tier, reason, season],
    );
    const ratingId = ins.rows[0]?.id;
    if (!ratingId) throw conflict('already_rated');
    await bump(tx, postId, season, input.tier, 1);
    await tx.query('INSERT INTO comments (post_id, user_id, rating_id, tier_snapshot, body) VALUES ($1, $2, $3, $4, $5)', [
      postId, userId, ratingId, input.tier, reason,
    ]);
    await addReputation(tx, userId, RATE_REPUTATION, 'rating');
  });
}

/**
 * §4.5 edit: at most MAX_EDITS times. An empty reason keeps the previous text
 * (prototype behaviour). The mirrored comment is flagged "edited".
 */
export async function editRating(db: Db, userId: string, postId: string, input: RateInput): Promise<{ editsLeft: number }> {
  const reason = (input.reason ?? '').trim().slice(0, MAX_REASON);
  if (containsBlockedWords(reason)) throw badRequest('content_blocked');
  return withTx(db, async (tx) => {
    const r = (
      await tx.query<{ id: string; tier: Tier; reason_text: string; edited_count: number; season: string }>(
        'SELECT id, tier, reason_text, edited_count, season FROM ratings WHERE post_id = $1 AND user_id = $2 FOR UPDATE',
        [postId, userId],
      )
    ).rows[0];
    if (!r) throw notFound('rating_not_found');
    if (r.edited_count >= MAX_EDITS) throw conflict('edit_limit_reached');
    if (r.tier !== input.tier) {
      await bump(tx, postId, r.season, r.tier, -1);
      await bump(tx, postId, r.season, input.tier, 1);
    }
    const newReason = reason || r.reason_text;
    await tx.query('UPDATE ratings SET tier = $2, reason_text = $3, edited_count = edited_count + 1, updated_at = now() WHERE id = $1', [
      r.id, input.tier, newReason,
    ]);
    await tx.query('UPDATE comments SET tier_snapshot = $2, body = $3, edited = true WHERE rating_id = $1', [r.id, input.tier, newReason]);
    return { editsLeft: MAX_EDITS - (r.edited_count + 1) };
  });
}
