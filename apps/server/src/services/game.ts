import { verdictOf, type DailyQuestion, type Distribution, type PostCard } from '@myna/shared';
import type { Queryable } from '../db/pool';
import { CARD_FROM, CARD_SELECT, toCard, type CardRules } from './posts';

const NOT_BLOCKED = `NOT EXISTS (SELECT 1 FROM blocks b WHERE b.user_id = $1::uuid AND b.blocked_user_id = p.author_id)`;

// ---- quick-rate deck ------------------------------------------------------------------------

/**
 * Posts the viewer hasn't rated (and didn't write), most active first with a little shuffle so the
 * deck feels fresh. Blind posts are included: rating them is exactly what unlocks them.
 */
export async function deck(db: Queryable, cfg: CardRules, viewer: string, limit = 20, exclude: string[] = []): Promise<PostCard[]> {
  const rows = (
    await db.query(
      `${CARD_SELECT} ${CARD_FROM}
       WHERE p.status = 'active' AND p.author_id <> $1::uuid AND r.id IS NULL AND ${NOT_BLOCKED}
         AND NOT (p.id = ANY($3::uuid[])) -- already shown this session (skipped)
       ORDER BY (ln(2 + s.total) + 3 * (SELECT count(*) FROM ratings rr WHERE rr.post_id = p.id AND rr.created_at > now() - interval '72 hours')) * (0.6 + random() * 0.8) DESC
       LIMIT $2`,
      [viewer, limit, exclude],
    )
  ).rows;
  return rows.map((r) => toCard(r, cfg));
}

// ---- daily question + streaks ----------------------------------------------------------------

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/** Picks (once) the featured post for `day`: lively, not featured in the last 30 days, not still blind. */
async function ensurePick(db: Queryable, day: string, blindHours: number): Promise<string | null> {
  const existing = (await db.query<{ post_id: string }>('SELECT post_id FROM daily_picks WHERE day = $1', [day])).rows[0];
  if (existing) return existing.post_id;
  const candidate = (
    await db.query<{ id: string }>(
      `SELECT p.id FROM posts p JOIN post_stats s ON s.post_id = p.id
       WHERE p.status = 'active'
         AND NOT (p.blind AND p.created_at > now() - $2 * interval '1 hour')
         AND NOT EXISTS (SELECT 1 FROM daily_picks d WHERE d.post_id = p.id AND d.day > $1::date - 30)
       ORDER BY (SELECT count(*) FROM ratings rr WHERE rr.post_id = p.id AND rr.created_at > now() - interval '7 days') DESC,
                least((s.c1 + s.c2), (s.c4 + s.c5)) DESC, random()
       LIMIT 1`,
      [day, blindHours],
    )
  ).rows[0];
  if (!candidate) return null;
  await db.query('INSERT INTO daily_picks (day, post_id) VALUES ($1, $2) ON CONFLICT (day) DO NOTHING', [day, candidate.id]);
  return (await db.query<{ post_id: string }>('SELECT post_id FROM daily_picks WHERE day = $1', [day])).rows[0]!.post_id;
}

/** Consecutive days with at least one rating, ending today (or yesterday, if nothing rated yet today). */
async function streak(db: Queryable, userId: string, today: string): Promise<number> {
  const days = (
    await db.query<{ day: string }>(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day FROM daily_answers WHERE user_id = $1 AND day <= $2::date ORDER BY day DESC LIMIT 400`,
      [userId, today],
    )
  ).rows.map((r) => r.day);
  let n = 0;
  let expect = new Date(`${today}T00:00:00Z`);
  if (days[0] !== today) expect = new Date(expect.getTime() - 86_400_000);
  for (const d of days) {
    if (d !== utcDay(expect)) break;
    n++;
    expect = new Date(expect.getTime() - 86_400_000);
  }
  return n;
}

/** Any rating today keeps the streak alive (called after every new rating). */
export async function recordDailyAnswer(db: Queryable, userId: string, now = new Date()): Promise<void> {
  await db.query('INSERT INTO daily_answers (user_id, day) VALUES ($1, $2::date) ON CONFLICT DO NOTHING', [userId, utcDay(now)]);
}

export async function dailyQuestion(db: Queryable, cfg: CardRules, viewer: string | null, now = new Date()): Promise<DailyQuestion> {
  const day = utcDay(now);
  const yesterdayDay = utcDay(new Date(now.getTime() - 86_400_000));
  const endsAt = new Date(`${day}T00:00:00Z`).getTime() + 86_400_000;
  const postId = await ensurePick(db, day, cfg.blindHours);
  const card = async (id: string | null) => {
    if (!id) return null;
    const row = (await db.query(`${CARD_SELECT} ${CARD_FROM} WHERE p.id = $2 AND p.status = 'active'`, [viewer, id])).rows[0];
    return row ? toCard(row, cfg, now) : null;
  };
  const post = await card(postId);
  const yPick = (await db.query<{ post_id: string }>('SELECT post_id FROM daily_picks WHERE day = $1', [yesterdayDay])).rows[0];
  return {
    day,
    post,
    answered: !!post?.myRating,
    streak: viewer ? await streak(db, viewer, day) : 0,
    endsAt: new Date(endsAt).toISOString(),
    yesterday: await card(yPick?.post_id ?? null),
  };
}

// ---- milestones -----------------------------------------------------------------------------

export const MILESTONES = [5, 10, 25, 50, 100, 250, 500, 1000];

/**
 * After a new rating: if the post just reached a milestone, claim it (once per post) and return what
 * to tell the author. Blind posts announce no verdict until their window ends.
 */
export async function claimMilestone(
  db: Queryable, postId: string, blindHours: number,
): Promise<{ authorId: string; n: number; verdict: string; title: string } | null> {
  const row = (
    await db.query<{ author_id: string; title: string; total: number; c1: number; c2: number; c3: number; c4: number; c5: number; blind_active: boolean }>(
      `SELECT p.author_id, p.title, s.total, s.c1, s.c2, s.c3, s.c4, s.c5,
              (p.blind AND p.created_at > now() - $2 * interval '1 hour') AS blind_active
       FROM posts p JOIN post_stats s ON s.post_id = p.id WHERE p.id = $1`,
      [postId, blindHours],
    )
  ).rows[0];
  if (!row || !MILESTONES.includes(row.total)) return null;
  const claimed = await db.query('INSERT INTO post_milestones (post_id, n) VALUES ($1, $2) ON CONFLICT DO NOTHING', [postId, row.total]);
  if (!claimed.rowCount) return null;
  const dist: Distribution = [row.c1, row.c2, row.c3, row.c4, row.c5];
  return { authorId: row.author_id, n: row.total, verdict: row.blind_active ? '' : verdictOf(dist), title: row.title };
}
