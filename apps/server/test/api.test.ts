/**
 * End-to-end API tests against a real Postgres (TEST_DATABASE_URL, default
 * postgres://myna:myna@localhost:5432/myna_test). The DB is reseeded first.
 */
import type { Board, Comment, PostCard } from '@myna/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { SocialVerifier } from '../src/auth/providers';
import { loadConfig } from '../src/config';
import { createPool, type Db } from '../src/db/pool';
import { seed, synthDistribution } from '../src/db/seed';
import { HttpError } from '../src/lib/errors';
import { clearBoardCache } from '../src/services/boards';
import { LocalDiskStorage } from '../src/lib/storage';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://myna:myna@localhost:5432/myna_test';
let db: Db;
let app: FastifyInstance;
let demoToken: string;

const social: SocialVerifier = {
  google: async (t) => {
    if (t !== 'valid-google-token') throw new HttpError(401, 'invalid_provider_token');
    return { providerUid: 'g-123', email: 'ann@example.com', name: 'Ann Lee' };
  },
  apple: async () => ({ providerUid: 'a-1' }),
  facebook: async () => ({ providerUid: 'f-1', name: 'Fb User' }),
};

async function call<T = any>(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await app.inject({
    method: method as 'GET',
    url: path,
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
    payload: opts.body as object | undefined,
  });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
}

async function postByTitle(title: string, token?: string): Promise<PostCard> {
  const r = await call<{ items: PostCard[] }>('GET', `/search?q=${encodeURIComponent(title)}`, { token });
  const p = r.body.items.find((x) => x.title === title);
  if (!p) throw new Error(`post not found: ${title}`);
  return p;
}

async function newUserToken(email: string): Promise<string> {
  const start = await call<{ devCode: string }>('POST', '/auth/email/start', { body: { email } });
  const login = await call<{ token: string }>('POST', '/auth/email', { body: { email, code: start.body.devCode } });
  return login.body.token;
}

beforeAll(async () => {
  db = createPool(url);
  await seed(db);
  const config = { ...loadConfig({ NODE_ENV: 'test', ALLOW_DEV_LOGIN: '1', DEV_EXPOSE_EMAIL_CODES: '1' } as NodeJS.ProcessEnv), databaseUrl: url };
  app = buildApp({ db, config, social, mailer: { sendLoginCode: async () => {} }, storage: new LocalDiskStorage(mkdtempSync(join(tmpdir(), 'myna-uploads-'))) });
  await app.ready();
  demoToken = (await call('POST', '/auth/dev', { body: { handle: 'foodjudge_007' } })).body.token;
});
afterAll(async () => {
  await app?.close();
  await db?.end();
});

describe('auth', () => {
  it('email code login creates a user once and rejects bad codes', async () => {
    const start = await call('POST', '/auth/email/start', { body: { email: 'Bob@Example.com' } });
    expect(start.status).toBe(200);
    expect(start.body.devCode).toMatch(/^\d{6}$/);
    const bad = await call('POST', '/auth/email', { body: { email: 'bob@example.com', code: start.body.devCode === '000000' ? '111111' : '000000' } });
    expect(bad.status).toBe(401);
    const ok = await call('POST', '/auth/email', { body: { email: 'bob@example.com', code: start.body.devCode } });
    expect(ok.status).toBe(200);
    expect(ok.body.user.nickname).toBe('bob');
    // code is single-use
    const again = await call('POST', '/auth/email', { body: { email: 'bob@example.com', code: start.body.devCode } });
    expect(again.status).toBe(401);
  });
  it('resend within 30s is throttled', async () => {
    await call('POST', '/auth/email/start', { body: { email: 'carol@example.com' } });
    expect((await call('POST', '/auth/email/start', { body: { email: 'carol@example.com' } })).status).toBe(429);
  });
  it('google sign-in maps to one stable user', async () => {
    const a = await call('POST', '/auth/google', { body: { idToken: 'valid-google-token' } });
    const b = await call('POST', '/auth/google', { body: { idToken: 'valid-google-token' } });
    expect(a.body.user.id).toBe(b.body.user.id);
    expect(a.body.user.nickname).toBe('Ann Lee');
    expect((await call('POST', '/auth/google', { body: { idToken: 'forged-token-xx' } })).status).toBe(401);
  });
  it('unconfigured providers answer 501 with the real verifier', async () => {
    const cfg = { ...loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv), databaseUrl: url };
    const bare = buildApp({ db, config: cfg });
    const r = await bare.inject({ method: 'POST', url: '/auth/apple', payload: { identityToken: 'x'.repeat(20) } });
    expect(r.statusCode).toBe(501);
    expect(r.json().error).toBe('provider_not_configured');
    expect((await bare.inject({ method: 'POST', url: '/auth/dev', payload: { handle: 'foodjudge_007' } })).statusCode).toBe(404);
    await bare.close();
  });
  it('protected routes need a token', async () => {
    expect((await call('GET', '/me')).status).toBe(401);
    expect((await call('GET', '/me', { token: 'garbage' })).status).toBe(401);
  });
});

describe('feed & detail', () => {
  it('filters by category and content language', async () => {
    const drinks = await call<{ items: PostCard[] }>('GET', '/feed?category=drinks');
    expect(drinks.body.items.length).toBeGreaterThan(0);
    expect(drinks.body.items.every((p) => p.category === 'drinks')).toBe(true);
    const es = await call<{ items: PostCard[] }>('GET', '/feed?langs=es');
    expect(es.body.items.map((p) => p.title)).toEqual(['¿El nuevo sabor Coca-Cola Cherry Vainilla vale la pena?']);
  });
  it('paginates with a cursor without duplicates', async () => {
    const p1 = await call<{ items: PostCard[]; nextCursor: string }>('GET', '/feed');
    expect(p1.body.items).toHaveLength(20);
    const p2 = await call<{ items: PostCard[] }>('GET', `/feed?cursor=${p1.body.nextCursor}`);
    const ids = new Set(p1.body.items.map((p) => p.id));
    expect(p2.body.items.some((p) => ids.has(p.id))).toBe(false);
  });
  it('computes average from the five tiers and auto tags', async () => {
    const chips = await postByTitle('螺蛳粉味薯片');
    expect(chips.avg).toBe(2.1); // seeded [180,120,80,40,22] + demo's tier-1 rating
    expect(chips.tags).toContain('warn');
    const tea = await postByTitle('0糖乌龙茶气泡水');
    expect(tea.tags).toContain('potential');
  });
  it('blind posts hide average, distribution and comment tiers until rated (§4.4)', async () => {
    const t = await newUserToken('blind@example.com');
    const p = await postByTitle('樱花白桃味可乐（新口味）', t);
    expect(p.locked).toBe(true);
    expect(p.avg).toBeNull();
    expect(p.dist).toBeNull();
    expect(p.total).toBe(364);
    const comments = await call<{ items: Comment[] }>('GET', `/posts/${p.id}/comments?tier=5`, { token: t });
    expect(comments.body.items.length).toBe(3); // tier filter ignored while locked
    expect(comments.body.items.every((c) => c.tier === null)).toBe(true);

    const rated = await call<PostCard>('POST', `/posts/${p.id}/ratings`, { token: t, body: { tier: 4 } });
    expect(rated.status).toBe(201);
    expect(rated.body.locked).toBe(false);
    expect(rated.body.dist).toEqual([12, 28, 70, 141, 114]);
    const after = await call<{ items: Comment[] }>('GET', `/posts/${p.id}/comments`, { token: t });
    expect(after.body.items.every((c) => c.tier !== null)).toBe(true);
  });
  it('nearby returns distances sorted ascending within the radius (§5.5)', async () => {
    const r = await call<{ items: PostCard[] }>('GET', '/nearby?lat=40.7128&lng=-74.006&radius_km=5');
    expect(r.body.items.map((p) => [p.title, p.distanceKm])).toEqual([
      ['社区免费瑜伽课，有人去过吗？', 0.5],
      ['街角新开的塔可车，排队值吗？', 2.1],
    ]);
    const one = await call<{ items: PostCard[] }>('GET', '/nearby?lat=40.7128&lng=-74.006&radius_km=1');
    expect(one.body.items).toHaveLength(1);
  });
  it('unknown post id is a 404', async () => {
    expect((await call('GET', '/posts/00000000-0000-0000-0000-000000000000')).status).toBe(404);
    expect((await call('GET', '/posts/not-a-uuid')).status).toBe(404);
  });
});

describe('publish, rate and edit (§4.5)', () => {
  let token: string;
  let postId: string;

  it('publishes a post that appears first in the feed', async () => {
    token = await newUserToken('poster@example.com');
    const r = await call<PostCard>('POST', '/posts', {
      token,
      body: { category: 'work', title: '部门团建去爬山，去吗？', body: '自费', lang: 'zh', blind: false, location: { placeName: 'Toronto' } },
    });
    expect(r.status).toBe(201);
    expect(r.body.type).toBe('event');
    expect(r.body.emoji).toBe('💼');
    expect(r.body.total).toBe(0);
    expect(r.body.avg).toBeNull();
    postId = r.body.id;
    const feed = await call<{ items: PostCard[] }>('GET', '/feed');
    expect(feed.body.items[0]!.id).toBe(postId);
  });
  it('rejects bad input', async () => {
    expect((await call('POST', '/posts', { token, body: { category: 'cars', title: 'x', lang: 'zh' } })).status).toBe(400);
    expect((await call('POST', '/posts', { token, body: { category: 'work', title: '   ', lang: 'zh' } })).status).toBe(400);
    expect((await call('POST', `/posts/${postId}/ratings`, { token, body: { tier: 6 } })).status).toBe(400);
    expect((await call('POST', '/posts', { body: { category: 'work', title: 'x', lang: 'zh' } })).status).toBe(401);
  });
  it('rates once, mirrors to comments, and adds reputation', async () => {
    const before = (await call('GET', '/me', { token })).body.reputation;
    const r = await call<PostCard>('POST', `/posts/${postId}/ratings`, { token, body: { tier: 2, reason: '爬山太累' } });
    expect(r.body.dist).toEqual([0, 1, 0, 0, 0]);
    expect(r.body.myRating).toMatchObject({ tier: 2, editsLeft: 3 });
    expect((await call('POST', `/posts/${postId}/ratings`, { token, body: { tier: 3 } })).status).toBe(409);
    const me = (await call('GET', '/me', { token })).body;
    expect(me.reputation).toBe(before + 2);
    const c = await call<{ items: Comment[] }>('GET', `/posts/${postId}/comments`, { token });
    expect(c.body.items[0]).toMatchObject({ mine: true, tier: 2, body: '爬山太累', edited: false });
  });
  it('allows exactly 3 edits, moves the vote and marks the comment edited', async () => {
    const e1 = await call<PostCard>('PATCH', `/posts/${postId}/ratings/me`, { token, body: { tier: 5 } });
    expect(e1.body.dist).toEqual([0, 0, 0, 0, 1]);
    expect(e1.body.myRating).toMatchObject({ tier: 5, reason: '爬山太累', editsLeft: 2 }); // empty reason keeps old text
    await call('PATCH', `/posts/${postId}/ratings/me`, { token, body: { tier: 4, reason: '风景不错' } });
    const e3 = await call<PostCard>('PATCH', `/posts/${postId}/ratings/me`, { token, body: { tier: 3 } });
    expect(e3.body.myRating!.editsLeft).toBe(0);
    const e4 = await call('PATCH', `/posts/${postId}/ratings/me`, { token, body: { tier: 1 } });
    expect(e4.status).toBe(409);
    expect(e4.body.error).toBe('edit_limit_reached');
    const c = await call<{ items: Comment[] }>('GET', `/posts/${postId}/comments`, { token });
    expect(c.body.items[0]).toMatchObject({ tier: 3, body: '风景不错', edited: true });
    const stats = (await db.query('SELECT c1,c2,c3,c4,c5 FROM post_season_stats WHERE post_id = $1', [postId])).rows[0];
    expect(stats).toEqual({ c1: 0, c2: 0, c3: 1, c4: 0, c5: 0 });
  });
  it('filters comments by tier and toggles likes idempotently', async () => {
    const chips = await postByTitle('螺蛳粉味薯片');
    const t1 = await call<{ items: Comment[] }>('GET', `/posts/${chips.id}/comments?tier=1`);
    expect(t1.body.items.length).toBeGreaterThan(0);
    expect(t1.body.items.every((c) => c.tier === 1)).toBe(true);
    const cid = t1.body.items[0]!.id;
    const base = t1.body.items[0]!.likeCount;
    expect((await call('PUT', `/comments/${cid}/like`, { token })).body.likeCount).toBe(base + 1);
    expect((await call('PUT', `/comments/${cid}/like`, { token })).body.likeCount).toBe(base + 1);
    expect((await call('DELETE', `/comments/${cid}/like`, { token })).body.likeCount).toBe(base);
  });
});

describe('boards (§6)', () => {
  it('monthly drinks best list is sorted by average and capped at 20', async () => {
    clearBoardCache();
    const b = (await call<Board>('GET', '/boards?period=monthly&category=drinks&direction=best')).body;
    expect(b.entries).toHaveLength(20);
    expect(b.entries[0]!.post.title).toBe('蜜桃乌龙气泡水');
    expect(b.entries[0]!.avg).toBe(4.8);
    expect(b.season).toMatch(/^\d{4}-\d{2}$/);
    for (let i = 1; i < b.entries.length; i++) expect(b.entries[i]!.avg).toBeLessThanOrEqual(b.entries[i - 1]!.avg);
    expect(b.entries.some((e) => e.post.title.includes('樱花白桃'))).toBe(false); // blind posts never chart
  });
  it('all-time totals are ~5× monthly and worst list ascends', async () => {
    const m = (await call<Board>('GET', '/boards?period=monthly&category=event&direction=worst')).body;
    const a = (await call<Board>('GET', '/boards?period=all&category=event&direction=worst')).body;
    expect(m.entries[0]!.post.title).toBe('周一早八·高数');
    expect(a.entries[0]!.total).toBe(m.entries[0]!.total * 5);
    expect(a.entries[0]!.avg).toBeLessThanOrEqual(a.entries[1]!.avg);
  });
  it('synthDistribution hits the target average exactly', () => {
    for (const [avg, n] of [[4.8, 2860], [1.2, 1000], [3.0, 55], [4.9, 14300]] as const) {
      const d = synthDistribution(avg, n);
      expect(d.reduce((a, b) => a + b, 0)).toBe(n);
      expect(Math.round((d.reduce((s, c, i) => s + c * (i + 1), 0) / n) * 10) / 10).toBe(avg);
    }
  });
});

describe('me, badges, settings, moderation', () => {
  it('demo account matches spec §8 identity and shows real stats', async () => {
    const me = (await call('GET', '/me', { token: demoToken })).body;
    expect(me).toMatchObject({ nickname: '干饭鉴黄师', handle: 'foodjudge_007', reputation: 92 });
    expect(me.stats.ratings).toBe(4);
    const rated = (await call<{ items: PostCard[] }>('GET', '/me/ratings', { token: demoToken })).body.items;
    expect(rated).toHaveLength(4);
  });
  it('badge wall has 11 badges with the 3 seeded unlocks', async () => {
    const b = (await call('GET', '/me/badges', { token: demoToken })).body.items;
    expect(b).toHaveLength(11);
    expect(b.filter((x: { unlockedAt: string | null }) => x.unlockedAt).map((x: { key: string }) => x.key).sort()).toEqual(['early_taster', 'flop_spotter', 'golden_tongue']);
  });
  it('first post unlocks "first steps" automatically', async () => {
    const t = await newUserToken('badge@example.com');
    await call('POST', '/posts', { token: t, body: { category: 'drinks', title: 'New soda?', lang: 'en' } });
    const b = (await call('GET', '/me/badges', { token: t })).body.items;
    expect(b.find((x: { key: string }) => x.key === 'first_steps').unlockedAt).not.toBeNull();
  });
  it('settings: content languages must keep at least one', async () => {
    const t = await newUserToken('settings@example.com');
    const ok = await call('PUT', '/me/settings', { token: t, body: { contentLangs: ['en', 'es'], visibility: 'only_me', locale: 'fr' } });
    expect(ok.body.settings).toEqual({ contentLangs: ['en', 'es'], visibility: 'only_me' });
    expect(ok.body.locale).toBe('fr');
    expect((await call('PUT', '/me/settings', { token: t, body: { contentLangs: [] } })).status).toBe(400);
  });
  it('blocking hides an author from feed and comments; reports are stored', async () => {
    const t = await newUserToken('blocker@example.com');
    const p = await postByTitle('螺蛳粉味薯片', t);
    expect((await call('PUT', `/me/blocks/${p.author.id}`, { token: t })).status).toBe(200);
    const feed = await call<{ items: PostCard[] }>('GET', '/feed?category=snacks', { token: t });
    expect(feed.body.items.some((x) => x.id === p.id)).toBe(false);
    expect((await call('GET', '/me/blocks', { token: t })).body.items[0].id).toBe(p.author.id);
    const rep = await call('POST', '/reports', { token: t, body: { postId: p.id, reason: 'spam' } });
    expect(rep.status).toBe(201);
    expect((await call('POST', '/reports', { token: t, body: { reason: 'spam' } })).status).toBe(400);
  });
  it('weekly report counts this week', async () => {
    const t = await newUserToken('weekly@example.com');
    const p = await postByTitle('食堂新出的黄焖鸡', t);
    await call('POST', `/posts/${p.id}/ratings`, { token: t, body: { tier: 4 } });
    expect((await call('GET', '/me/weekly', { token: t })).body).toEqual({ ratings: 1, newBadges: 0, reputationDelta: 2 });
  });
  it('account deletion erases identity but keeps the vote in the average', async () => {
    const t = await newUserToken('leaver@example.com');
    const p = await postByTitle('食堂新出的黄焖鸡', t);
    await call('POST', `/posts/${p.id}/ratings`, { token: t, body: { tier: 5, reason: 'secret' } });
    expect((await call('DELETE', '/me', { token: t })).status).toBe(204);
    expect((await call('GET', '/me', { token: t })).status).toBe(401);
    const after = await postByTitle('食堂新出的黄焖鸡');
    expect(after.total).toBe(p.total + 1);
    const ident = await db.query("SELECT 1 FROM auth_identities WHERE provider_uid = 'leaver@example.com'");
    expect(ident.rowCount).toBe(0);
    // signing up again with the same e-mail creates a fresh account
    const t2 = await newUserToken('leaver@example.com');
    expect((await call('GET', '/me', { token: t2 })).body.stats.ratings).toBe(0);
  });
});

describe('cors', () => {
  it('preflight allows every method the API uses', async () => {
    const r = await app.inject({ method: 'OPTIONS', url: '/me/settings', headers: { origin: 'http://localhost:8081', 'access-control-request-method': 'PATCH' } });
    const allowed = String(r.headers['access-control-allow-methods']);
    for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) expect(allowed).toContain(m);
  });
});

describe('blind window (§4.4, 24 h)', () => {
  it('a blind post locks only during its window, then opens up and can chart', async () => {
    const t = await newUserToken('blindwin@example.com');
    const created = await call<PostCard>('POST', '/posts', { token: t, body: { category: 'drinks', title: 'Blind window soda', lang: 'en', blind: true } });
    expect(created.body.blind).toBe(true);
    expect(created.body.blindUntil).not.toBeNull();
    // Make it the worst drink by far, with enough ratings to chart this season.
    await db.query('UPDATE post_stats SET c1 = 900 WHERE post_id = $1', [created.body.id]);
    await db.query(`INSERT INTO post_season_stats (post_id, season, c1) VALUES ($1, to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'), 900)`, [created.body.id]);
    const other = await newUserToken('blindwin2@example.com');
    clearBoardCache();
    expect((await call<PostCard>('GET', `/posts/${created.body.id}`, { token: other })).body.locked).toBe(true);
    let worst = (await call<Board>('GET', '/boards?period=monthly&category=drinks&direction=worst')).body;
    expect(worst.entries.some((e) => e.post.id === created.body.id)).toBe(false);

    await db.query("UPDATE posts SET created_at = now() - interval '25 hours' WHERE id = $1", [created.body.id]);
    clearBoardCache();
    const after = (await call<PostCard>('GET', `/posts/${created.body.id}`, { token: other })).body;
    expect(after).toMatchObject({ locked: false, blind: false });
    expect(after.avg).toBe(1);
    worst = (await call<Board>('GET', '/boards?period=monthly&category=drinks&direction=worst')).body;
    expect(worst.entries[0]!.post.id).toBe(created.body.id);
    const all = (await call<Board>('GET', '/boards?period=all&category=drinks&direction=worst')).body;
    expect(all.entries.length).toBeGreaterThan(0); // all-time path (null season parameter) still works
  });
});

/** Minimal multipart/form-data body with one file field. */
function multipartBody(data: Buffer, filename: string, type: string) {
  const boundary = '----myna' + Math.random().toString(16).slice(2);
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, data, tail]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

const seg = (marker: number, body: Buffer) => Buffer.concat([Buffer.from([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body]);
/** Structurally valid JPEG: SOI, JFIF APP0, EXIF APP1 carrying a fake GPS tag, SOS, scan data, EOI. */
const jpegWithGps = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
  seg(0xe1, Buffer.from('Exif\0\0GPS-LAT-40.7128-LNG--74.0060', 'latin1')),
  seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
  Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9]),
]);

describe('image uploads', () => {
  async function upload(token: string | undefined, data: Buffer, name = 'p.jpg', type = 'image/jpeg') {
    const { payload, headers } = multipartBody(data, name, type);
    const res = await app.inject({ method: 'POST', url: '/uploads', payload, headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    return { status: res.statusCode, body: res.json() };
  }

  it('stores a JPEG without its EXIF/GPS metadata and serves it back', async () => {
    const t = await newUserToken('photo@example.com');
    const up = await upload(t, jpegWithGps);
    expect(up.status).toBe(201);
    expect(up.body.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.jpg$/);
    const got = await app.inject({ method: 'GET', url: up.body.url });
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toBe('image/jpeg');
    const bytes = got.rawPayload;
    expect(bytes.includes(Buffer.from('GPS-LAT'))).toBe(false);
    expect(bytes.includes(Buffer.from('JFIF'))).toBe(true);
    expect(bytes.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
  });

  it('strips PNG text/eXIf chunks', async () => {
    const t = await newUserToken('png@example.com');
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
    };
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', Buffer.alloc(13)), chunk('tEXt', Buffer.from('Location\0Home address')), chunk('IDAT', Buffer.from([1, 2, 3])), chunk('IEND', Buffer.alloc(0)),
    ]);
    const up = await upload(t, png, 'a.png', 'image/png');
    expect(up.status).toBe(201);
    const got = await app.inject({ method: 'GET', url: up.body.url });
    expect(got.rawPayload.includes(Buffer.from('Home address'))).toBe(false);
    expect(got.rawPayload.includes(Buffer.from('IDAT'))).toBe(true);
  });

  it('rejects anonymous uploads, non-images and spoofed content types', async () => {
    const t = await newUserToken('reject@example.com');
    expect((await upload(undefined, jpegWithGps)).status).toBe(401);
    const fake = await upload(t, Buffer.from('<script>alert(1)</script>'), 'x.jpg', 'image/jpeg');
    expect(fake.status).toBe(415);
    expect((await app.inject({ method: 'GET', url: '/uploads/../../etc/passwd' })).statusCode).toBe(404);
  });

  it('posts accept only images that were uploaded here (max 4)', async () => {
    const t = await newUserToken('postimg@example.com');
    const url = (await upload(t, jpegWithGps)).body.url;
    const ok = await call<PostCard>('POST', '/posts', { token: t, body: { category: 'snacks', title: 'Chips with a photo', lang: 'en', imageUrls: [url] } });
    expect(ok.status).toBe(201);
    expect(ok.body.imageUrls).toEqual([url]);
    const foreign = await call('POST', '/posts', { token: t, body: { category: 'snacks', title: 'x', lang: 'en', imageUrls: ['https://evil.example/a.jpg'] } });
    expect(foreign.status).toBe(400);
    const missing = await call('POST', '/posts', { token: t, body: { category: 'snacks', title: 'x', lang: 'en', imageUrls: ['/uploads/00000000-0000-0000-0000-000000000000.jpg'] } });
    expect(missing.body.error).toBe('unknown_image');
    const tooMany = await call('POST', '/posts', { token: t, body: { category: 'snacks', title: 'x', lang: 'en', imageUrls: [url, url, url, url, url] } });
    expect(tooMany.status).toBe(400);
  });
});
