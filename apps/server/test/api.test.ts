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
import { landingPage } from '../src/services/landing';
import { clearBoardCache } from '../src/services/boards';
import { LocalDiskStorage } from '../src/lib/storage';
import type { PushMessage } from '../src/services/notify';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://myna:myna@localhost:5432/myna_test';
let db: Db;
let app: FastifyInstance;
let demoToken: string;
const pushed: PushMessage[] = [];
const deadTokens = new Set<string>();
const pusher = { send: async (m: PushMessage[]) => { pushed.push(...m); return m.map((x) => x.to).filter((t) => deadTokens.has(t)); } };

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
  const login = await call<{ token: string }>('POST', '/auth/email', { body: { email, code: start.body.devCode, ageConfirmed: true } });
  return login.body.token;
}

beforeAll(async () => {
  db = createPool(url);
  await seed(db);
  const config = { ...loadConfig({ NODE_ENV: 'test', ALLOW_DEV_LOGIN: '1', DEV_EXPOSE_EMAIL_CODES: '1' } as NodeJS.ProcessEnv), databaseUrl: url };
  app = buildApp({ db, config, social, mailer: { sendLoginCode: async () => {} }, storage: new LocalDiskStorage(mkdtempSync(join(tmpdir(), 'myna-uploads-'))), pusher });
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
    const bad = await call('POST', '/auth/email', { body: { email: 'bob@example.com', code: start.body.devCode === '000000' ? '111111' : '000000', ageConfirmed: true } });
    expect(bad.status).toBe(401);
    const ok = await call('POST', '/auth/email', { body: { email: 'bob@example.com', code: start.body.devCode, ageConfirmed: true } });
    expect(ok.status).toBe(200);
    expect(ok.body.user.nickname).toBe('bob');
    // code is single-use
    const again = await call('POST', '/auth/email', { body: { email: 'bob@example.com', code: start.body.devCode, ageConfirmed: true } });
    expect(again.status).toBe(401);
  });
  it('resend within 30s is throttled', async () => {
    await call('POST', '/auth/email/start', { body: { email: 'carol@example.com' } });
    expect((await call('POST', '/auth/email/start', { body: { email: 'carol@example.com' } })).status).toBe(429);
  });
  it('google sign-in maps to one stable user', async () => {
    const a = await call('POST', '/auth/google', { body: { idToken: 'valid-google-token', ageConfirmed: true } });
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
      ['社区免费瑜伽课，有人去过吗？', 1],
      ['街角新开的塔可车，排队值吗？', 2],
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
    expect(me.stats.posts).toBe(2);
    const rated = (await call<{ items: PostCard[] }>('GET', '/me/ratings', { token: demoToken })).body.items;
    expect(rated).toHaveLength(4);
  });
  it('badge wall has 11 badges: 3 seeded unlocks + first steps (demo has posts)', async () => {
    const b = (await call('GET', '/me/badges', { token: demoToken })).body.items;
    expect(b).toHaveLength(11);
    expect(b.filter((x: { unlockedAt: string | null }) => x.unlockedAt).map((x: { key: string }) => x.key).sort()).toEqual(['early_taster', 'first_steps', 'flop_spotter', 'golden_tongue']);
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
    expect(ok.body.settings).toEqual({ contentLangs: ['en', 'es'], visibility: 'only_me', notifySocial: true, notifyRank: true });
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

describe('phase 2: favourites, history, drafts, likes, follows (§5.6)', () => {
  it('favourites toggle idempotently and show on cards and in the list', async () => {
    const t = await newUserToken('fav@example.com');
    const p = await postByTitle('0糖乌龙茶气泡水', t);
    expect(p.favorited).toBe(false);
    expect((await call('PUT', `/posts/${p.id}/favorite`, { token: t })).body.favorited).toBe(true);
    await call('PUT', `/posts/${p.id}/favorite`, { token: t });
    expect((await call<PostCard>('GET', `/posts/${p.id}`, { token: t })).body.favorited).toBe(true);
    expect((await call<{ items: PostCard[] }>('GET', '/me/favorites', { token: t })).body.items.map((x) => x.id)).toEqual([p.id]);
    await call('DELETE', `/posts/${p.id}/favorite`, { token: t });
    expect((await call<{ items: PostCard[] }>('GET', '/me/favorites', { token: t })).body.items).toHaveLength(0);
    expect((await call('PUT', '/posts/00000000-0000-0000-0000-000000000000/favorite', { token: t })).status).toBe(404);
  });

  it('opening posts builds a de-duplicated, newest-first history that can be cleared', async () => {
    const t = await newUserToken('hist@example.com');
    const a = await postByTitle('螺蛳粉味薯片', t);
    const b = await postByTitle('食堂新出的黄焖鸡', t);
    await call('GET', `/posts/${a.id}`, { token: t });
    await call('GET', `/posts/${b.id}`, { token: t });
    await call('GET', `/posts/${a.id}`, { token: t });
    expect((await call<{ items: PostCard[] }>('GET', '/me/history', { token: t })).body.items.map((x) => x.id)).toEqual([a.id, b.id]);
    expect((await call('DELETE', '/me/history', { token: t })).status).toBe(204);
    expect((await call<{ items: PostCard[] }>('GET', '/me/history', { token: t })).body.items).toHaveLength(0);
    await call('GET', `/posts/${a.id}`); // anonymous views are not recorded anywhere
  });

  it('drafts can be created, updated, listed and deleted — only by their owner', async () => {
    const t = await newUserToken('draft@example.com');
    const other = await newUserToken('draft2@example.com');
    const d = await call('POST', '/drafts', { token: t, body: { payload: { type: 'event', category: 'work', title: '团建去吗' } } });
    expect(d.status).toBe(201);
    const u = await call('POST', '/drafts', { token: t, body: { id: d.body.id, payload: { type: 'event', category: 'work', title: '团建去吗？', body: 'AA' } } });
    expect(u.body.payload).toMatchObject({ title: '团建去吗？', body: 'AA' });
    expect((await call('GET', '/drafts', { token: t })).body.items).toHaveLength(1);
    expect((await call('POST', '/drafts', { token: other, body: { id: d.body.id, payload: { title: 'hijack' } } })).status).toBe(404);
    expect((await call('POST', '/drafts', { token: t, body: { payload: { title: 'x', evil: 1 } } })).status).toBe(400);
    await call('DELETE', `/drafts/${d.body.id}`, { token: other });
    expect((await call('GET', '/drafts', { token: t })).body.items).toHaveLength(1); // other user's delete did nothing
    await call('DELETE', `/drafts/${d.body.id}`, { token: t });
    expect((await call('GET', '/drafts', { token: t })).body.items).toHaveLength(0);
  });

  it('likes received lists who liked my comments, excluding my own likes', async () => {
    const author = await newUserToken('likes-author@example.com');
    const fan = await newUserToken('likes-fan@example.com');
    const p = await postByTitle('部门团建去密室逃脱，AA 128，值吗？', author);
    await call('POST', `/posts/${p.id}/ratings`, { token: author, body: { tier: 5, reason: '超好玩' } });
    const mine = (await call<{ items: Comment[] }>('GET', `/posts/${p.id}/comments`, { token: author })).body.items.find((c) => c.mine)!;
    await call('PUT', `/comments/${mine.id}/like`, { token: author }); // self-like: not listed
    await call('PUT', `/comments/${mine.id}/like`, { token: fan });
    const likes = (await call('GET', '/me/likes', { token: author })).body.items;
    expect(likes).toHaveLength(1);
    expect(likes[0]).toMatchObject({ commentBody: '超好玩', tier: 5, post: { id: p.id } });
    expect(likes[0].liker.nickname).toBe('likes-fan');
  });

  it('profiles show posts and counts; follow/unfollow; cannot follow yourself', async () => {
    const a = await newUserToken('prof-a@example.com');
    const b = await newUserToken('prof-b@example.com');
    const bMe = (await call('GET', '/me', { token: b })).body;
    await call('POST', '/posts', { token: b, body: { category: 'snacks', title: 'B 的零食', lang: 'zh' } });
    let prof = (await call('GET', `/users/${bMe.id}`, { token: a })).body;
    expect(prof).toMatchObject({ isMe: false, followedByMe: false, stats: { posts: 1, followers: 0 } });
    expect(prof.posts[0].title).toBe('B 的零食');
    await call('PUT', `/users/${bMe.id}/follow`, { token: a });
    await call('PUT', `/users/${bMe.id}/follow`, { token: a });
    prof = (await call('GET', `/users/${bMe.id}`, { token: a })).body;
    expect(prof).toMatchObject({ followedByMe: true, stats: { followers: 1 } });
    expect((await call('GET', '/me/following', { token: a })).body.items.map((u: { id: string }) => u.id)).toEqual([bMe.id]);
    expect((await call('PUT', `/users/${bMe.id}/follow`, { token: b })).status).toBe(400);
    await call('DELETE', `/users/${bMe.id}/follow`, { token: a });
    expect((await call('GET', '/me/following', { token: a })).body.items).toHaveLength(0);
    expect((await call('GET', `/users/${bMe.id}`)).body.isMe).toBe(false); // anonymous can view
    expect((await call('GET', '/users/not-a-user')).status).toBe(404);
  });
});

describe('rating visibility, comment reports, challenge, leaderboard', () => {
  it('"who can see my ratings" hides the comment (not the vote) from the right people', async () => {
    const author = await newUserToken('vis-author@example.com');
    const friend = await newUserToken('vis-friend@example.com');
    const stranger = await newUserToken('vis-stranger@example.com');
    const friendId = (await call('GET', '/me', { token: friend })).body.id;
    const p = await postByTitle('0糖乌龙茶气泡水', author);
    await call('POST', `/posts/${p.id}/ratings`, { token: author, body: { tier: 4, reason: 'private take' } });
    const sees = async (t: string) => (await call<{ items: Comment[] }>('GET', `/posts/${p.id}/comments`, { token: t })).body.items.some((c) => c.body === 'private take');

    await call('PUT', '/me/settings', { token: author, body: { visibility: 'only_me' } });
    expect(await sees(author)).toBe(true);
    expect(await sees(friend)).toBe(false);
    expect(await sees(stranger)).toBe(false);
    expect((await call<PostCard>('GET', `/posts/${p.id}`, { token: stranger })).body.total).toBe(p.total + 1); // vote still counts

    await call('PUT', '/me/settings', { token: author, body: { visibility: 'following' } });
    await call('PUT', `/users/${friendId}/follow`, { token: author }); // the author follows friend
    expect(await sees(friend)).toBe(true);
    expect(await sees(stranger)).toBe(false);

    await call('PUT', '/me/settings', { token: author, body: { visibility: 'everyone' } });
    expect(await sees(stranger)).toBe(true);
  });

  it('comments can be reported', async () => {
    const t = await newUserToken('reporter2@example.com');
    const p = await postByTitle('螺蛳粉味薯片', t);
    const c = (await call<{ items: Comment[] }>('GET', `/posts/${p.id}/comments`, { token: t })).body.items[0]!;
    expect((await call('POST', '/reports', { token: t, body: { commentId: c.id, reason: 'abuse' } })).status).toBe(201);
    const row = (await db.query('SELECT reason FROM reports WHERE comment_id = $1', [c.id])).rows[0];
    expect(row.reason).toBe('abuse');
  });

  it('weekly challenge counts ratings on new products this week only', async () => {
    const t = await newUserToken('challenge@example.com');
    expect((await call('GET', '/me/challenge', { token: t })).body).toMatchObject({ current: 0, target: 5, done: false });
    const newProduct = await postByTitle('螺蛳粉味薯片', t); // seeded hours ago → new product
    const event = await postByTitle('周五早八的课，教授点名，到底去不去？', t); // event → doesn't count
    const old = (await call<Board>('GET', '/boards?period=all&category=drinks&direction=best')).body.entries[0]!; // created 40+ days ago
    await call('POST', `/posts/${newProduct.id}/ratings`, { token: t, body: { tier: 2 } });
    await call('POST', `/posts/${event.id}/ratings`, { token: t, body: { tier: 4 } });
    await call('POST', `/posts/${old.post.id}/ratings`, { token: t, body: { tier: 5 } });
    const ch = (await call('GET', '/me/challenge', { token: t })).body;
    expect(ch.current).toBe(1);
    expect(new Date(ch.endsAt).getUTCDay()).toBe(1); // next Monday
  });

  it('leaderboard ranks by badges then reputation and marks me', async () => {
    const lb = (await call('GET', '/leaderboard', { token: demoToken })).body.items;
    expect(lb[0]).toMatchObject({ rank: 1, badges: 4, isMe: true });
    expect(lb[0].user.handle).toBe('foodjudge_007');
    for (let i = 1; i < lb.length; i++) expect(lb[i].badges).toBeLessThanOrEqual(lb[i - 1].badges);
  });
});

describe('replies (§4.6)', () => {
  it('reply threads: create, preview under the comment, full list, reply-to-reply joins the thread, delete own', async () => {
    const a = await newUserToken('thread-a@example.com');
    const b = await newUserToken('thread-b@example.com');
    const p = await postByTitle('食堂新出的黄焖鸡', a);
    await call('POST', `/posts/${p.id}/ratings`, { token: a, body: { tier: 4, reason: '下饭' } });
    const top = (await call<{ items: Comment[] }>('GET', `/posts/${p.id}/comments`, { token: a })).body.items.find((c) => c.mine)!;
    expect(top).toMatchObject({ replyCount: 0, replies: [], parentId: null });

    const r1 = await call('POST', `/comments/${top.id}/replies`, { token: b, body: { body: '同意！' } });
    expect(r1.status).toBe(201);
    const replyId = r1.body.items[0].id;
    await call('POST', `/comments/${replyId}/replies`, { token: a, body: { body: '谢谢' } }); // reply to a reply
    for (const n of [1, 2, 3]) await call('POST', `/comments/${top.id}/replies`, { token: b, body: { body: `第${n}条` } });

    const again = (await call<{ items: Comment[] }>('GET', `/posts/${p.id}/comments`, { token: a })).body.items.find((c) => c.id === top.id)!;
    expect(again.replyCount).toBe(5);
    expect(again.replies.map((r) => r.body)).toEqual(['同意！', '谢谢', '第1条']); // first 3, oldest first
    expect(again.replies.every((r) => r.tier === null && r.parentId === top.id)).toBe(true);
    const all = (await call<{ items: Comment[] }>('GET', `/comments/${top.id}/replies`)).body.items;
    expect(all).toHaveLength(5);

    expect((await call('DELETE', `/comments/${replyId}`, { token: a })).status).toBe(404); // not mine
    expect((await call('DELETE', `/comments/${top.id}`, { token: a })).status).toBe(404); // rating comments can't be deleted this way
    expect((await call('DELETE', `/comments/${replyId}`, { token: b })).status).toBe(204);
    expect((await call<{ items: Comment[] }>('GET', `/comments/${top.id}/replies`)).body.items).toHaveLength(4);
    expect((await call('POST', `/comments/${top.id}/replies`, { token: b, body: { body: '   ' } })).status).toBe(400);
    expect((await call('POST', `/comments/${top.id}/replies`, { body: { body: 'anon' } })).status).toBe(401);
  });

  it('tier filter still applies to top-level comments only', async () => {
    const p = await postByTitle('螺蛳粉味薯片');
    const t1 = (await call<{ items: Comment[] }>('GET', `/posts/${p.id}/comments?tier=1`)).body.items;
    expect(t1.every((c) => c.tier === 1 && c.parentId === null)).toBe(true);
  });
});

describe('notifications & push', () => {
  it('reply, like and follow notify the recipient (in-app + push), once, in their language', async () => {
    const author = await newUserToken('notif-author@example.com');
    const fan = await newUserToken('notif-fan@example.com');
    await call('PUT', '/me/settings', { token: author, body: { locale: 'zh' } });
    await call('POST', '/me/push-tokens', { token: author, body: { token: 'ExponentPushToken[author-device]', platform: 'ios' } });
    const authorId = (await call('GET', '/me', { token: author })).body.id;
    const p = await postByTitle('0糖乌龙茶气泡水', author);
    await call('POST', `/posts/${p.id}/ratings`, { token: author, body: { tier: 5, reason: '冰箱常备' } });
    const c = (await call<{ items: Comment[] }>('GET', `/posts/${p.id}/comments`, { token: author })).body.items.find((x) => x.mine)!;
    pushed.length = 0;

    await call('POST', `/comments/${c.id}/replies`, { token: fan, body: { body: '我也是' } });
    await call('PUT', `/comments/${c.id}/like`, { token: fan });
    await call('DELETE', `/comments/${c.id}/like`, { token: fan });
    await call('PUT', `/comments/${c.id}/like`, { token: fan }); // toggling doesn't notify twice
    await call('PUT', `/users/${authorId}/follow`, { token: fan });

    const box = (await call('GET', '/notifications', { token: author })).body;
    expect(box.items.map((n: { type: string }) => n.type)).toEqual(['follow', 'like', 'reply']);
    expect(box.unread).toBe(3);
    expect(box.items[2]).toMatchObject({ postId: p.id, url: `/post/${p.id}`, data: { text: '我也是' } });
    expect(box.items[0].url).toMatch(/^\/user\//);
    expect(pushed.map((m) => m.title)).toEqual(['notif-fan 回复了你', 'notif-fan 赞了你的评论', 'notif-fan 关注了你']);
    expect(pushed.every((m) => m.to === 'ExponentPushToken[author-device]')).toBe(true);

    await call('POST', '/notifications/read-all', { token: author });
    expect((await call('GET', '/notifications/unread', { token: author })).body.unread).toBe(0);
  });

  it('no notifications for your own actions or from people you blocked; preferences stop pushes', async () => {
    const me = await newUserToken('notif-self@example.com');
    const troll = await newUserToken('notif-troll@example.com');
    const trollId = (await call('GET', '/me', { token: troll })).body.id;
    await call('POST', '/me/push-tokens', { token: me, body: { token: 'ExponentPushToken[self-device]' } });
    const p = await postByTitle('食堂新出的黄焖鸡', me);
    await call('POST', `/posts/${p.id}/ratings`, { token: me, body: { tier: 3, reason: 'ok' } });
    const c = (await call<{ items: Comment[] }>('GET', `/posts/${p.id}/comments`, { token: me })).body.items.find((x) => x.mine)!;
    await call('POST', `/comments/${c.id}/replies`, { token: me, body: { body: 'self reply' } });
    await call('PUT', `/me/blocks/${trollId}`, { token: me });
    await call('POST', `/comments/${c.id}/replies`, { token: troll, body: { body: 'spam' } });
    expect((await call('GET', '/notifications', { token: me })).body.items.filter((n: { type: string }) => n.type !== 'badge')).toHaveLength(0);

    await call('DELETE', `/me/blocks/${trollId}`, { token: me });
    await call('PUT', '/me/settings', { token: me, body: { notifySocial: false } });
    pushed.length = 0;
    await call('POST', `/comments/${c.id}/replies`, { token: troll, body: { body: 'hi' } });
    expect((await call('GET', '/notifications', { token: me })).body.items.some((n: { type: string }) => n.type === 'reply')).toBe(true); // still in the inbox
    expect(pushed).toHaveLength(0); // but not pushed
    expect((await call('GET', '/me', { token: me })).body.settings).toMatchObject({ notifySocial: false, notifyRank: true });
  });

  it('earning a badge notifies; dead push tokens are removed', async () => {
    const t = await newUserToken('notif-badge@example.com');
    await call('POST', '/me/push-tokens', { token: t, body: { token: 'ExponentPushToken[dead-device]' } });
    deadTokens.add('ExponentPushToken[dead-device]');
    await call('POST', '/posts', { token: t, body: { category: 'drinks', title: 'First post!', lang: 'en' } });
    const box = (await call('GET', '/notifications', { token: t })).body.items;
    expect(box[0]).toMatchObject({ type: 'badge', url: '/achievements', data: { key: 'first_steps' } });
    const left = await db.query("SELECT 1 FROM push_tokens WHERE token = 'ExponentPushToken[dead-device]'");
    expect(left.rowCount).toBe(0);
  });
});

describe('season settlement (§6)', () => {
  it('freezes last month\'s Top 20, notifies authors, unlocks chart badges, and runs only once', async () => {
    const author = await newUserToken('season-author@example.com');
    const created = await call<PostCard>('POST', '/posts', { token: author, body: { category: 'food', title: 'Season champion noodles', lang: 'en' } });
    // Last month: this post had a perfect score with plenty of ratings.
    const last = await db.query(`SELECT to_char((date_trunc('month', now() AT TIME ZONE 'UTC') - interval '1 day'), 'YYYY-MM') AS s`);
    const season = last.rows[0].s as string;
    await db.query("DELETE FROM season_settlements WHERE season = $1", [season]); // the server may have settled an empty month at startup
    await db.query('INSERT INTO post_season_stats (post_id, season, c5) VALUES ($1, $2, 500)', [created.body.id, season]);

    const awards = await app.runSeasonJob();
    expect(awards).not.toBeNull();
    const mine = awards!.find((a) => a.postId === created.body.id)!;
    expect(mine).toMatchObject({ category: 'food', rank: 1 });
    expect(await app.runSeasonJob()).toBeNull(); // idempotent

    const box = (await call('GET', '/notifications', { token: author })).body.items;
    const seasonNote = box.find((n: { type: string }) => n.type === 'season');
    expect(seasonNote).toMatchObject({ postId: created.body.id, data: { season, category: 'food', rank: 1 } });
    const badges = (await call('GET', '/me/badges', { token: author })).body.items;
    expect(badges.find((b: { key: string }) => b.key === 'chart_maker').unlockedAt).not.toBeNull();
    expect(badges.find((b: { key: string }) => b.key === 'monthly_champion').unlockedAt).not.toBeNull();
    const pub = (await call('GET', '/seasons/last')).body;
    expect(pub.season).toBe(season);
    expect(pub.awards.find((a: { post_id: string }) => a.post_id === created.body.id).rank).toBe(1);
  });
});

describe('production hardening', () => {
  it('rate-limits sign-in attempts per IP', async () => {
    const cfg = { ...loadConfig({ NODE_ENV: 'test', RATE_LIMIT_GENERAL: '1000', RATE_LIMIT_AUTH: '3' } as NodeJS.ProcessEnv), databaseUrl: url };
    const limited = buildApp({ db, config: cfg, mailer: { sendLoginCode: async () => {} } });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await limited.inject({ method: 'POST', url: '/auth/email', payload: { email: 'x@example.com', code: '123456', ageConfirmed: true } })).statusCode);
    expect(codes.slice(0, 3)).toEqual([401, 401, 401]);
    expect(codes.slice(3)).toEqual([429, 429]);
    // other routes are not affected by the sign-in limit
    expect((await limited.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    await limited.close();
  });

  it('readiness checks the database; security headers are set; big bodies are refused', async () => {
    const r = await app.inject({ method: 'GET', url: '/ready' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['strict-transport-security']).toBeTruthy();
    const big = await app.inject({ method: 'POST', url: '/drafts', headers: { authorization: `Bearer ${demoToken}`, 'content-type': 'application/json' }, payload: JSON.stringify({ payload: { body: 'x'.repeat(300_000) } }) });
    expect(big.statusCode).toBe(413);
  });

  it('production config refuses a missing JWT secret and disables dev helpers', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET/);
    const prod = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), ALLOW_DEV_LOGIN: '1', DEV_EXPOSE_EMAIL_CODES: '1' } as NodeJS.ProcessEnv);
    expect(prod.allowDevLogin).toBe(false);
    expect(prod.exposeEmailCodes).toBe(false);
  });
});

describe('feedback', () => {
  it('stores feedback from signed-in and anonymous users; rejects empty', async () => {
    expect((await call('POST', '/feedback', { token: demoToken, body: { body: '很好用！', appVersion: '0.8.0', platform: 'ios' } })).status).toBe(201);
    expect((await call('POST', '/feedback', { body: { body: 'anonymous idea' } })).status).toBe(201);
    expect((await call('POST', '/feedback', { body: { body: '   ' } })).status).toBe(400);
    const rows = (await db.query('SELECT body, user_id IS NOT NULL AS signed FROM feedback ORDER BY created_at')).rows;
    expect(rows).toEqual([{ body: '很好用！', signed: true }, { body: 'anonymous idea', signed: false }]);
  });
});

describe('profile editing', () => {
  it('changes nickname and avatar, validates them, keeps the handle', async () => {
    const t = await newUserToken('rename@example.com');
    const before = (await call('GET', '/me', { token: t })).body;
    const after = (await call('PUT', '/me/profile', { token: t, body: { nickname: '  新名字  ', avatar: '🦜' } })).body;
    expect(after).toMatchObject({ nickname: '新名字', avatar: '🦜', handle: before.handle });
    expect((await call('PUT', '/me/profile', { token: t, body: { nickname: '' } })).status).toBe(400);
    expect((await call('PUT', '/me/profile', { token: t, body: { nickname: 'x'.repeat(25) } })).status).toBe(400);
    expect((await call('PUT', '/me/profile', { token: t, body: { avatar: '🦜🦜🦜' } })).status).toBe(400);
    expect((await call('PUT', '/me/profile', { body: { nickname: 'anon' } })).status).toBe(401);
  });

  it('comments page through with a cursor', async () => {
    const p = await postByTitle('螺蛳粉味薯片');
    for (let i = 0; i < 22; i++) {
      const t = await newUserToken(`pager${i}@example.com`);
      await call('POST', `/posts/${p.id}/ratings`, { token: t, body: { tier: 3, reason: `第${i}条` } });
    }
    const first = (await call<{ items: Comment[]; nextCursor: string }>('GET', `/posts/${p.id}/comments`)).body;
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toBeTruthy();
    const second = (await call<{ items: Comment[]; nextCursor: string | null }>('GET', `/posts/${p.id}/comments?cursor=${first.nextCursor}`)).body;
    expect(second.items.length).toBeGreaterThan(0);
    const ids = new Set(first.items.map((c) => c.id));
    expect(second.items.some((c) => ids.has(c.id))).toBe(false);
  });
});

describe('own posts, privacy, moderation, age gate, export, hot feed, share page', () => {
  it('authors can edit and delete their posts; others cannot', async () => {
    const me = await newUserToken('owner@example.com');
    const other = await newUserToken('not-owner@example.com');
    const p = (await call<PostCard>('POST', '/posts', { token: me, body: { category: 'snacks', title: 'Typo titel', lang: 'en' } })).body;
    expect(p.editedAt).toBeNull();
    const e = await call<PostCard>('PATCH', `/posts/${p.id}`, { token: me, body: { title: 'Fixed title', body: 'better' } });
    expect(e.body).toMatchObject({ title: 'Fixed title', body: 'better' });
    expect(e.body.editedAt).not.toBeNull();
    expect((await call('PATCH', `/posts/${p.id}`, { token: other, body: { title: 'hijack' } })).status).toBe(404);
    expect((await call('DELETE', `/posts/${p.id}`, { token: other })).status).toBe(404);
    expect((await call('DELETE', `/posts/${p.id}`, { token: me })).status).toBe(204);
    expect((await call('GET', `/posts/${p.id}`)).status).toBe(404);
    expect((await call<{ items: PostCard[] }>('GET', '/me/posts', { token: me })).body.items).toHaveLength(0);
  });

  it('stores coordinates on a ~1 km grid', async () => {
    const t = await newUserToken('geo@example.com');
    const p = (await call<PostCard>('POST', '/posts', { token: t, body: { category: 'food', title: 'Secret spot', lang: 'en', location: { lat: 40.712345, lng: -74.006789, placeName: 'NYC' } } })).body;
    const row = (await db.query('SELECT lat, lng FROM posts WHERE id = $1', [p.id])).rows[0];
    expect(row).toEqual({ lat: 40.71, lng: -74.01 });
  });

  it('blocks clear profanity in posts, ratings, replies and nicknames', async () => {
    const t = await newUserToken('potty@example.com');
    expect((await call('POST', '/posts', { token: t, body: { category: 'food', title: '老板是傻逼', lang: 'zh' } })).body.error).toBe('content_blocked');
    const p = await postByTitle('食堂新出的黄焖鸡', t);
    expect((await call('POST', `/posts/${p.id}/ratings`, { token: t, body: { tier: 1, reason: 'total shit' } })).body.error).toBe('content_blocked');
    expect((await call('PUT', '/me/profile', { token: t, body: { nickname: 'fuck_you' } })).status).toBe(400);
    expect((await call('PUT', '/me/profile', { token: t, body: { nickname: 'fuck you' } })).body.error).toBe('content_blocked');
  });

  it('three distinct reporters auto-hide a post; repeat reports by one person count once', async () => {
    const author = await newUserToken('reported-author@example.com');
    const p = (await call<PostCard>('POST', '/posts', { token: author, body: { category: 'life', title: 'Borderline post', lang: 'en' } })).body;
    const r1 = await newUserToken('rep1@example.com');
    for (let i = 0; i < 3; i++) await call('POST', '/reports', { token: r1, body: { postId: p.id, reason: 'spam' } });
    expect((await call('GET', `/posts/${p.id}`)).status).toBe(200); // still one reporter
    const r2 = await newUserToken('rep2@example.com');
    await call('POST', '/reports', { token: r2, body: { postId: p.id, reason: 'abuse' } });
    const r3 = await newUserToken('rep3@example.com');
    const last = await call('POST', '/reports', { token: r3, body: { postId: p.id, reason: 'spam' } });
    expect(last.body.hidden).toBe(true);
    expect((await call('GET', `/posts/${p.id}`)).status).toBe(404);

    // admin queue → restore it
    const queue = (await call('GET', '/admin/reports', { token: demoToken })).body.items;
    const item = queue.find((x: { targetId: string }) => x.targetId === p.id);
    expect(item).toMatchObject({ targetType: 'post', status: 'hidden', reporters: 3, reasons: { spam: 2, abuse: 1 } });
    expect((await call('GET', '/admin/reports', { token: author })).status).toBe(403); // not an admin
    await call('POST', '/admin/reports/resolve', { token: demoToken, body: { targetType: 'post', targetId: p.id, action: 'restore' } });
    expect((await call('GET', `/posts/${p.id}`)).status).toBe(200);
    expect((await call('GET', '/admin/reports', { token: demoToken })).body.items.some((x: { targetId: string }) => x.targetId === p.id)).toBe(false);
  });

  it('admins remove content and ban accounts; banned accounts cannot act or sign in', async () => {
    const troll = await newUserToken('troll2@example.com');
    const trollId = (await call('GET', '/me', { token: troll })).body.id;
    const p = (await call<PostCard>('POST', '/posts', { token: troll, body: { category: 'life', title: 'Spam spam', lang: 'en' } })).body;
    const fan = await newUserToken('reporter-fan@example.com');
    await call('POST', '/reports', { token: fan, body: { postId: p.id, reason: 'spam' } });
    await call('POST', '/admin/reports/resolve', { token: demoToken, body: { targetType: 'post', targetId: p.id, action: 'remove' } });
    expect((await call('GET', `/posts/${p.id}`)).status).toBe(404);
    expect((await call('PUT', `/admin/users/${trollId}/ban`, { token: demoToken })).status).toBe(200);
    expect((await call('POST', '/posts', { token: troll, body: { category: 'life', title: 'again', lang: 'en' } })).body.error).toBe('account_banned');
    const start = await call('POST', '/auth/email/start', { body: { email: 'troll2@example.com' } }).catch(() => null);
    if (start && start.status === 200) {
      const relogin = await call('POST', '/auth/email', { body: { email: 'troll2@example.com', code: start.body.devCode } });
      expect(relogin.body.error).toBe('account_banned');
    }
    await call('DELETE', `/admin/users/${trollId}/ban`, { token: demoToken });
    expect((await call('GET', '/me', { token: troll })).status).toBe(200);
  });

  it('new accounts must confirm they are 13+; existing ones sign in without it', async () => {
    const start = await call('POST', '/auth/email/start', { body: { email: 'kid@example.com' } });
    const no = await call('POST', '/auth/email', { body: { email: 'kid@example.com', code: start.body.devCode } });
    expect(no.body.error).toBe('age_confirmation_required');
    const yes = await call('POST', '/auth/email', { body: { email: 'kid@example.com', code: start.body.devCode, ageConfirmed: true } });
    expect(yes.status).toBe(200);
    const row = (await db.query("SELECT age_confirmed_at FROM users WHERE id = $1", [yes.body.user.id])).rows[0];
    expect(row.age_confirmed_at).not.toBeNull();
    expect((await call('POST', '/auth/google', { body: { idToken: 'valid-google-token' } })).status).toBe(200); // existing Google user from earlier test
  });

  it('exports the account\'s data', async () => {
    const r = await call('GET', '/me/export', { token: demoToken });
    expect(r.status).toBe(200);
    expect(r.body.account.handle).toBe('foodjudge_007');
    expect(r.body.ratings).toHaveLength(4);
    expect(r.body.posts.length).toBeGreaterThan(0);
    expect(r.body).toHaveProperty('signInMethods');
    expect(JSON.stringify(r.body)).not.toContain('code_hash');
  });

  it('hot feed puts actively rated posts first; new feed stays chronological', async () => {
    const fresh = await newUserToken('hot-author@example.com');
    const p = (await call<PostCard>('POST', '/posts', { token: fresh, body: { category: 'drinks', title: 'Viral soda', lang: 'en' } })).body;
    for (let i = 0; i < 6; i++) {
      const t = await newUserToken(`hot-rater${i}@example.com`);
      await call('POST', `/posts/${p.id}/ratings`, { token: t, body: { tier: 5 } });
    }
    const hot = (await call<{ items: PostCard[]; nextCursor: string }>('GET', '/feed?sort=hot')).body;
    expect(hot.items[0]!.id).toBe(p.id);
    const page2 = (await call<{ items: PostCard[] }>('GET', `/feed?sort=hot&cursor=${hot.nextCursor}`)).body;
    expect(page2.items.some((x) => hot.items.some((y) => y.id === x.id))).toBe(false);
  });

  it('share landing page has preview tags, escapes text and hides blind scores', async () => {
    const t = await newUserToken('share@example.com');
    const p = (await call<PostCard>('POST', '/posts', { token: t, body: { category: 'snacks', title: '<script>alert(1)</script> chips', lang: 'en' } })).body;
    const r = await app.inject({ method: 'GET', url: `/p/${p.id}` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/html');
    expect(r.body).toContain('og:title');
    expect(r.body).not.toContain('<script>alert(1)</script>');
    expect(r.body).toContain(`myna://post/${p.id}`);
    const blind = await postByTitle('樱花白桃味可乐（新口味）');
    const b = await app.inject({ method: 'GET', url: `/p/${blind.id}`, headers: { 'accept-language': 'en' } });
    expect(b.body).not.toMatch(/class="score"/);
    expect((await app.inject({ method: 'GET', url: '/p/not-a-post' })).statusCode).toBe(200); // generic page
    expect(r.body).not.toMatch(/https?:\/\/[^"]*\/post\//); // no web app configured → no web link
    const withWeb = landingPage(p, 'en', { appStoreUrl: null, webAppUrl: 'https://web.example.com' });
    expect(withWeb).toContain(`href="https://web.example.com/post/${p.id}"`);
    expect(withWeb).toContain('View on the web');
  });
});
