/**
 * Dev/demo seed (spec §12): the prototype's posts, comments, 3×2×20 board
 * items and the 11 badges. Wipes all data first — refuses to run in production.
 */
import { CATEGORY_EMOJI, categoryFromZh, type Category, type Distribution, type Locale } from '@myna/shared';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadDotEnv } from '../config';
import { seasonOf } from '../lib/season';
import { migrate } from './migrate';
import { createPool, withTx, type Db, type Tx } from './pool';
import data from './seed-data.json' with { type: 'json' };
import { rate } from '../services/ratings';

type ProtoComment = { avatar: string; name: string; tier: number; text: string; likes: number };
type ProtoPost = {
  type: string; cat: string; lang: string; title: string; desc: string; avatar: string; author: string; time: string;
  emoji: string; blind: boolean; dist: number[]; loc: string | null; comments: ProtoComment[];
};

const CITY_COORDS: Record<string, [number, number]> = {
  'New York': [40.7128, -74.006], 'Los Angeles': [34.0522, -118.2437], 'San Francisco': [37.7749, -122.4194],
  Toronto: [43.6532, -79.3832], Vancouver: [49.2827, -123.1207], Beijing: [39.9042, 116.4074], Shanghai: [31.2304, 121.4737],
};
/** Spec §12 nearby samples: taco truck 2.1 km, yoga 0.5 km from the city centre (offset due north). */
const NEARBY_OFFSET_KM: Record<string, number> = { '街角新开的塔可车，排队值吗？': 2.1, '社区免费瑜伽课，有人去过吗？': 0.5 };

const BADGE_RULES: { metric: string; target: number }[] = [
  { metric: 'streak_days', target: 30 }, { metric: 'first_rates', target: 10 }, { metric: 'early_warnings', target: 10 },
  { metric: 'posts', target: 1 }, { metric: 'text_ratings', target: 10 }, { metric: 'prophet', target: 10 },
  { metric: 'night_ratings', target: 5 }, { metric: 'monthly_top20', target: 1 }, { metric: 'reputation', target: 95 },
  { metric: 'long_reviews', target: 5 }, { metric: 'monthly_top1', target: 1 },
];
const BADGE_KEYS = ['golden_tongue', 'early_taster', 'flop_spotter', 'first_steps', 'critic', 'prophet', 'night_owl', 'chart_maker', 'diamond_judge', 'long_critic', 'monthly_champion'];

function hoursAgo(s: string): number {
  const n = Number(s.match(/\d+/)?.[0] ?? 1);
  if (/分钟|min/.test(s)) return n / 60;
  if (/天|day|日|일|giorn|jour|día/.test(s)) return n * 24;
  return n;
}

/** Deterministic five-tier distribution with `n` votes whose one-decimal mean equals `target`. */
export function synthDistribution(target: number, n: number): Distribution {
  const shape = (m: number) => [1, 2, 3, 4, 5].map((k) => Math.exp(-((k - m) ** 2) / 2));
  const mean = (w: number[]) => w.reduce((a, x, i) => a + x * (i + 1), 0) / w.reduce((a, x) => a + x, 0);
  let lo = -3, hi = 9;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (mean(shape(mid)) < target) lo = mid; else hi = mid; }
  const w = shape((lo + hi) / 2);
  const sum = w.reduce((a, x) => a + x, 0);
  const d = w.map((x) => Math.floor((x / sum) * n)) as Distribution;
  d[d.indexOf(Math.max(...d))] += n - d.reduce((a, x) => a + x, 0);
  const avg1 = () => Math.round((d.reduce((a, x, i) => a + x * (i + 1), 0) / n) * 10) / 10;
  for (let guard = 0; guard < n && avg1() !== target; guard++) {
    const up = avg1() < target;
    // move one vote one tier up (or down) from the most populated movable tier
    const order = [0, 1, 2, 3, 4].filter((i) => (up ? i < 4 : i > 0) && d[i] > 0).sort((a, b) => d[b] - d[a]);
    const from = order[0]!;
    d[from]--; d[from + (up ? 1 : -1)]++;
  }
  return d;
}

function eventCategory(name: string): Category {
  if (/部门|加班|会议|年会|团建|周报/.test(name)) return 'work';
  if (/高数|早八|驾校|课/.test(name)) return 'education';
  if (/相亲/.test(name)) return 'love';
  if (/同学|婚礼|搬家/.test(name)) return 'family';
  return 'life';
}

async function insertUser(tx: Tx, nickname: string, handle: string, avatar: string, reputation = 80): Promise<string> {
  const r = await tx.query<{ id: string }>(
    `INSERT INTO users (nickname, handle, avatar, reputation) VALUES ($1, $2, $3, $4)
     ON CONFLICT (handle) DO UPDATE SET nickname = EXCLUDED.nickname RETURNING id`,
    [nickname, handle, avatar, reputation],
  );
  return r.rows[0]!.id;
}

async function insertPost(
  tx: Tx,
  p: { author: string; category: Category; title: string; body: string; emoji: string; lang: string; blind: boolean; createdAt: Date; lat?: number; lng?: number; place?: string | null },
  all: Distribution,
  season: Distribution | null,
): Promise<string> {
  const type = ['drinks', 'snacks', 'electronics', 'beauty', 'food', 'household'].includes(p.category) ? 'product' : 'event';
  const id = (
    await tx.query<{ id: string }>(
      `INSERT INTO posts (author_id, type, category, title, body, emoji, lang, blind, lat, lng, place_name, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [p.author, type, p.category, p.title, p.body, p.emoji, p.lang, p.blind, p.lat ?? null, p.lng ?? null, p.place ?? null, p.createdAt],
    )
  ).rows[0]!.id;
  await tx.query('INSERT INTO post_stats (post_id, c1, c2, c3, c4, c5) VALUES ($1,$2,$3,$4,$5,$6)', [id, ...all]);
  if (season) await tx.query('INSERT INTO post_season_stats (post_id, season, c1, c2, c3, c4, c5) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, seasonOf(), ...season]);
  return id;
}

export async function seed(db: Db): Promise<{ demoUserId: string }> {
  await migrate(db);
  const tables = (await db.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'")).rows;
  await db.query(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);

  const demoUserId = await withTx(db, async (tx) => {
    const userIds = new Map<string, string>();
    let n = 0;
    const userFor = async (name: string, avatar: string) => {
      if (!userIds.has(name)) userIds.set(name, await insertUser(tx, name, `myna_${1000 + ++n}`, avatar));
      return userIds.get(name)!;
    };
    // §8 demo account
    const demo = await insertUser(tx, '干饭鉴黄师', 'foodjudge_007', '🍚', 92);
    await tx.query("INSERT INTO auth_identities (user_id, provider, provider_uid) VALUES ($1, 'email', 'demo@myna.app')", [demo]);

    // badges (§5.7)
    for (const [i, b] of (data.badges as { icon: string; unlocked: boolean; time?: string; name: object; desc: object; cond: object }[]).entries()) {
      const id = (
        await tx.query<{ id: number }>(
          'INSERT INTO badges (key, icon, name_i18n, desc_i18n, cond_i18n, rule, sort) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [BADGE_KEYS[i], b.icon, b.name, b.desc, b.cond, BADGE_RULES[i], i],
        )
      ).rows[0]!.id;
      if (b.unlocked && b.time) await tx.query('INSERT INTO user_badges (user_id, badge_id, unlocked_at) VALUES ($1,$2,$3)', [demo, id, new Date(b.time)]);
    }

    // prototype feed posts
    const cityByZh = new Map((data.cities as Record<string, string>[]).map((c) => [c.zh, c]));
    for (const p of data.posts as ProtoPost[]) {
      const category = categoryFromZh(p.cat)!;
      const city = p.loc ? cityByZh.get(p.loc) : undefined;
      let lat: number | undefined, lng: number | undefined;
      if (city) {
        [lat, lng] = CITY_COORDS[city.en]!;
        lat += (NEARBY_OFFSET_KM[p.title] ?? 3) / 111;
      }
      const dist = p.dist as Distribution;
      const id = await insertPost(
        tx,
        { author: await userFor(p.author, p.avatar), category, title: p.title, body: p.desc, emoji: p.emoji, lang: p.lang, blind: p.blind,
          createdAt: new Date(Date.now() - hoursAgo(p.time) * 3_600_000), lat, lng, place: city ? (city[p.lang] ?? city.en) : null },
        dist, dist,
      );
      for (const c of p.comments) {
        await tx.query('INSERT INTO comments (post_id, user_id, tier_snapshot, body, like_count) VALUES ($1,$2,$3,$4,$5)', [
          id, await userFor(c.name, c.avatar), c.tier + 1, c.text, c.likes,
        ]);
      }
    }

    // board items (§12: 3 categories × best/worst × 20; all-time ≈ 5× monthly)
    const pool = (data.commentPools as Record<string, { good: string[]; bad: string[]; mid: string[]; names: string[]; avatars: string[] }>).zh!;
    const poolUsers: string[] = [];
    for (const [i, nm] of pool.names.entries()) poolUsers.push(await userFor(nm, pool.avatars[i]!));
    const boardAuthor = await userFor('Myna 榜单君', '🏆');
    const boards = data.boards as unknown as Record<string, Record<'best' | 'worst', [string, number][]>>;
    for (const [zhCat, dirs] of Object.entries(boards)) {
      for (const dir of ['best', 'worst'] as const) {
        for (const [i, [name, avg]] of dirs[dir].entries()) {
          const category: Category = zhCat === '饮料' ? 'drinks' : zhCat === '食品' ? 'food' : eventCategory(name);
          const monthly = 2860 - i * 97 + ((i * 53) % 180);
          const id = await insertPost(
            tx,
            { author: boardAuthor, category, title: name, body: '', emoji: CATEGORY_EMOJI[category], lang: 'zh', blind: false,
              createdAt: new Date(Date.now() - (40 + i * 9) * 86_400_000) },
            synthDistribution(avg, monthly * 5), synthDistribution(avg, monthly),
          );
          const texts = dir === 'best' ? pool.good : pool.bad;
          for (const [j, text] of texts.entries()) {
            const tier = dir === 'best' ? (j === 0 ? 5 : 4) : j === 0 ? 1 : 2;
            await tx.query('INSERT INTO comments (post_id, user_id, tier_snapshot, body, like_count) VALUES ($1,$2,$3,$4,$5)', [
              id, poolUsers[(i + j) % poolUsers.length], tier, text, 80 - j * 23 - i,
            ]);
          }
        }
      }
    }
    return demo;
  });

  // Give the demo account a rating history through the real code path (not the blind post, so it stays locked).
  const pick = async (title: string) => (await db.query<{ id: string }>('SELECT id FROM posts WHERE title = $1', [title])).rows[0]!.id;
  const history: [string, 1 | 2 | 3 | 4 | 5, string][] = [
    ['螺蛳粉味薯片', 1, '酸笋味太上头了，一包都没吃完'],
    ['0糖乌龙茶气泡水', 5, '0 糖还这么好喝，冰箱常备'],
    ['食堂新出的黄焖鸡', 3, ''],
    ['周五早八的课，教授点名，到底去不去？', 4, '平时分要紧，爬也要爬过去'],
  ];
  for (const [title, tier, reason] of history) await rate(db, demoUserId, await pick(title), { tier, reason });
  await db.query('UPDATE users SET reputation = 92 WHERE id = $1', [demoUserId]);
  await db.query('DELETE FROM reputation_events');
  return { demoUserId };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  loadDotEnv();
  const cfg = loadConfig();
  if (process.env.NODE_ENV === 'production') throw new Error('refusing to seed a production database');
  const db = createPool(cfg.databaseUrl);
  seed(db)
    .then(async () => {
      const c = (await db.query('SELECT (SELECT count(*) FROM posts) p, (SELECT count(*) FROM comments) c, (SELECT count(*) FROM users) u')).rows[0];
      console.log(`seeded: ${c.p} posts, ${c.c} comments, ${c.u} users · demo login handle: foodjudge_007`);
    })
    .finally(() => db.end());
}
