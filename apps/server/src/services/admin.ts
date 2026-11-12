import type { ReportItem } from '@myna/shared';
import type { Queryable } from '../db/pool';
import { notFound } from '../lib/errors';
import { userSummarySql } from './users';

/** Open reports grouped by target, most-reported first. */
export async function reportQueue(db: Queryable): Promise<ReportItem[]> {
  const rows = (
    await db.query(
      `SELECT CASE WHEN r.comment_id IS NULL THEN 'post' ELSE 'comment' END AS target_type,
              coalesce(r.comment_id, r.post_id) AS target_id,
              coalesce(c.post_id, p.id) AS post_id,
              coalesce(c.status, p.status) AS status,
              coalesce(c.body, p.title || CASE WHEN p.body <> '' THEN ' — ' || p.body ELSE '' END) AS text,
              ${userSummarySql('u')} AS author,
              json_object_agg(r.reason, 1) AS reasons_seen,
              array_agg(r.reason) AS reasons,
              count(DISTINCT r.reporter_id) AS reporters,
              max(r.created_at) AS last_at
       FROM reports r
       LEFT JOIN comments c ON c.id = r.comment_id
       LEFT JOIN posts p ON p.id = r.post_id AND r.comment_id IS NULL
       JOIN users u ON u.id = coalesce(c.user_id, p.author_id)
       WHERE r.status = 'open'
       GROUP BY 1, 2, 3, 4, 5, u.id
       ORDER BY count(DISTINCT r.reporter_id) DESC, max(r.created_at) DESC
       LIMIT 200`,
    )
  ).rows;
  return rows.map((r) => {
    const reasons: Record<string, number> = {};
    for (const x of r.reasons as string[]) reasons[x] = (reasons[x] ?? 0) + 1;
    return {
      targetType: r.target_type,
      targetId: r.target_id,
      postId: r.post_id,
      status: r.status,
      text: r.text,
      author: r.author,
      reasons,
      reporters: Number(r.reporters),
      lastReportedAt: r.last_at.toISOString(),
    };
  });
}

/**
 * Closes every open report on a target. remove = take the content down; restore = put hidden
 * content back; dismiss = keep it (and un-hide it if auto-hidden).
 */
export async function resolveReports(db: Queryable, adminId: string, targetType: 'post' | 'comment', targetId: string, action: 'remove' | 'restore' | 'dismiss'): Promise<void> {
  const table = targetType === 'post' ? 'posts' : 'comments';
  const col = targetType === 'post' ? 'post_id' : 'comment_id';
  const exists = await db.query(`SELECT 1 FROM ${table} WHERE id = $1`, [targetId]);
  if (!exists.rowCount) throw notFound('target_not_found');
  if (action === 'remove') await db.query(`UPDATE ${table} SET status = 'removed' WHERE id = $1`, [targetId]);
  else await db.query(`UPDATE ${table} SET status = 'active' WHERE id = $1 AND status = 'hidden'`, [targetId]);
  const resolution = action === 'remove' ? 'removed' : action === 'restore' ? 'restored' : 'dismissed';
  const scope = targetType === 'post' ? 'AND comment_id IS NULL' : '';
  await db.query(
    `UPDATE reports SET status = 'closed', resolved_at = now(), resolved_by = $2, resolution = $3 WHERE ${col} = $1 ${scope} AND status = 'open'`,
    [targetId, adminId, resolution],
  );
}

/** Ban: the account can no longer act, and its posts and comments are taken down. */
export async function setBan(db: Queryable, userId: string, banned: boolean): Promise<void> {
  const r = await db.query('UPDATE users SET banned_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE id = $1 AND deleted_at IS NULL', [userId, banned]);
  if (!r.rowCount) throw notFound('user_not_found');
  if (banned) {
    await db.query("UPDATE posts SET status = 'removed' WHERE author_id = $1 AND status <> 'removed'", [userId]);
    await db.query("UPDATE comments SET status = 'removed' WHERE user_id = $1 AND status <> 'removed'", [userId]);
    await db.query('DELETE FROM push_tokens WHERE user_id = $1', [userId]);
  }
}
