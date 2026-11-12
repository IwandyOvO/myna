import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import {
  BOARD_CATEGORIES, CATEGORIES, LOCALES, isLocale, resolveLocale,
  type AuthProvider, type Locale,
} from '@myna/shared';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import { createSocialVerifier, type SocialVerifier } from './auth/providers';
import { ConsoleMailer, type Mailer } from './auth/mailer';
import { TokenService } from './auth/tokens';
import type { Config } from './config';
import { withTx, type Db } from './db/pool';
import { HttpError, badRequest, notFound, unauthorized } from './lib/errors';
import { sniffImage, stripMetadata } from './lib/images';
import { LocalDiskStorage, UPLOAD_PATH, type Storage } from './lib/storage';
import { badgeWall, leaderboard, pickLang, unlockBadges, weekly, weeklyChallenge } from './services/badges';
import * as notifications from './services/notify';
import { ExpoPusher, NoopPusher, type NotifyInput, type Pusher } from './services/notify';
import { previousSeason, seasonAwards, settleSeason } from './services/seasons';
import { getBoard } from './services/boards';
import * as posts from './services/posts';
import * as community from './services/social';
import * as admin from './services/admin';
import { landingPage } from './services/landing';
import { editRating, rate } from './services/ratings';
import * as users from './services/users';

export interface AppDeps {
  db: Db;
  config: Config;
  mailer?: Mailer;
  social?: SocialVerifier;
  storage?: Storage;
  pusher?: Pusher;
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 4;

const tier = z.coerce.number().int().min(1).max(5);
const uuid = z.string().uuid();
const locale = z.enum(LOCALES);
const category = z.enum(CATEGORIES);
const langList = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(',').filter(isLocale) : undefined));

export function buildApp(deps: AppDeps): FastifyInstance {
  const { db, config } = deps;
  const tokens = new TokenService(config.jwtSecret);
  const mailer = deps.mailer ?? new ConsoleMailer();
  const social = deps.social ?? createSocialVerifier(config);
  const storage = deps.storage ?? new LocalDiskStorage(config.uploadDir);
  const pusher = deps.pusher ?? (process.env.NODE_ENV === 'test' ? new NoopPusher() : new ExpoPusher(process.env.EXPO_ACCESS_TOKEN));
  const tagCfg = { tags: config.autoTags, blindHours: config.blindHours };

  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test' && {
      level: process.env.LOG_LEVEL ?? 'info',
      // Never write bearer tokens or e-mail codes to logs.
      redact: ['req.headers.authorization', 'req.body.code', 'req.body.idToken', 'req.body.identityToken', 'req.body.accessToken'],
    },
    bodyLimit: 256 * 1024, // JSON bodies; uploads have their own multipart limit
    trustProxy: config.trustProxy,
  });
  app.register(helmet, { crossOriginResourcePolicy: { policy: 'cross-origin' } }); // images are loaded by the app/web from another origin
  app.register(cors, {
    origin: config.corsOrigins.length ? config.corsOrigins : true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  const limits = config.rateLimits;
  if (limits.general > 0) app.register(rateLimit, { max: limits.general, timeWindow: '1 minute' });
  /** Per-route limit (e.g. sign-in); no-op when rate limiting is disabled. */
  const limit = (max: number) => (limits.general > 0 && max > 0 ? { config: { rateLimit: { max, timeWindow: '1 minute' } } } : {});
  app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message });
    if (err instanceof ZodError) return reply.status(400).send({ error: 'validation_failed', message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: 'bad_request', message: (err as Error).message });
    app.log.error(err);
    return reply.status(500).send({ error: 'internal' });
  });

  /** Viewer id from "Authorization: Bearer <jwt>", or null for anonymous browsing. */
  async function viewer(req: FastifyRequest): Promise<string | null> {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return null;
    const id = await tokens.verify(h.slice(7));
    if (!id) throw unauthorized('invalid_token');
    return id;
  }
  async function requireUser(req: FastifyRequest): Promise<string> {
    const id = await viewer(req);
    if (!id) throw unauthorized('login_required');
    const state = await users.accountState(db, id);
    if (!state) throw unauthorized('user_not_found');
    if (state.banned) throw new HttpError(403, 'account_banned');
    return id;
  }
  async function requireAdmin(req: FastifyRequest): Promise<string> {
    const id = await requireUser(req);
    if ((await users.accountState(db, id))?.role !== 'admin') throw new HttpError(403, 'admin_only');
    return id;
  }
  const reqLocale = (req: FastifyRequest): Locale => resolveLocale(req.headers['accept-language']?.split(',')[0]);

  const send = (n: NotifyInput) => notifications.notify(db, pusher, n, (e) => app.log.warn({ err: e }, 'notify failed'));

  /** Unlock newly earned badges after an action and tell the user (never fails the action). */
  async function checkBadges(userId: string) {
    try {
      const { fresh } = await unlockBadges(db, userId, config.boardMinRatings, config.blindHours);
      if (!fresh.length) return;
      const loc = (await db.query<{ locale: string | null }>('SELECT locale FROM users WHERE id = $1', [userId])).rows[0]?.locale;
      const l = isLocale(loc) ? loc : 'en';
      for (const b of fresh) await send({ userId, type: 'badge', data: { badge: pickLang(b.name, l), icon: b.icon, key: b.key } });
    } catch (e) {
      app.log.warn({ err: e }, 'badge check failed');
    }
  }

  async function issue(provider: AuthProvider, identity: Parameters<typeof users.findOrCreateUser>[2], req: FastifyRequest) {
    const ageConfirmed = (req.body as { ageConfirmed?: unknown } | undefined)?.ageConfirmed === true;
    const userId = await withTx(db, (tx) => users.findOrCreateUser(tx, provider, identity, reqLocale(req), ageConfirmed));
    const state = await users.accountState(db, userId);
    if (state?.banned) throw new HttpError(403, 'account_banned');
    return { token: await tokens.sign(userId), user: await users.getMe(db, userId) };
  }

  // Routes live in a child scope registered after the rate limiter, so its per-route limits apply.
  app.register(async (app) => {
  app.get('/health', async () => ({ ok: true }));

  // Share landing page (spec: growth). Link previews read its Open Graph tags; the button opens the app.
  app.get('/p/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    let post = null;
    try {
      post = await posts.getPost(db, tagCfg, null, id);
    } catch {
      /* unknown or removed: render the generic page */
    }
    reply.header('content-type', 'text/html; charset=utf-8').header('cache-control', 'public, max-age=300');
    return landingPage(post, resolveLocale(req.headers['accept-language']?.split(',')[0]), config.appStoreUrl);
  });
  /** Readiness: the database answers. Use for load-balancer health checks. */
  app.get('/ready', async (_req, reply) => {
    try {
      await db.query('SELECT 1');
      return { ok: true };
    } catch {
      return reply.status(503).send({ ok: false });
    }
  });

  // ---- auth (§10 POST /auth/{provider}) ----------------------------------------
  app.post('/auth/email/start', limit(limits.auth), async (req) => {
    const { email } = z.object({ email: z.string() }).parse(req.body);
    const e = users.normalizeEmail(email);
    const code = await users.issueEmailCode(db, e, config.jwtSecret);
    await mailer.sendLoginCode(e, code);
    return config.exposeEmailCodes ? { sent: true, devCode: code } : { sent: true };
  });
  app.post('/auth/email', limit(limits.auth), async (req) => {
    const { email, code } = z.object({ email: z.string(), code: z.string().regex(/^\d{6}$/), ageConfirmed: z.boolean().optional() }).parse(req.body);
    const e = users.normalizeEmail(email);
    // Check the age gate before using up the one-time code, so a missed checkbox doesn't burn it.
    if (!(req.body as { ageConfirmed?: boolean }).ageConfirmed && !(await users.identityExists(db, 'email', e))) throw badRequest('age_confirmation_required');
    await users.consumeEmailCode(db, e, code, config.jwtSecret);
    return issue('email', { providerUid: e, email: e }, req);
  });
  app.post('/auth/google', limit(limits.auth), async (req) => {
    const { idToken } = z.object({ idToken: z.string().min(10), ageConfirmed: z.boolean().optional() }).parse(req.body);
    return issue('google', await social.google(idToken), req);
  });
  app.post('/auth/apple', limit(limits.auth), async (req) => {
    const { identityToken, fullName } = z.object({ identityToken: z.string().min(10), fullName: z.string().max(60).optional(), ageConfirmed: z.boolean().optional() }).parse(req.body);
    const id = await social.apple(identityToken);
    return issue('apple', { ...id, name: fullName || id.name }, req);
  });
  app.post('/auth/facebook', limit(limits.auth), async (req) => {
    const { accessToken } = z.object({ accessToken: z.string().min(10), ageConfirmed: z.boolean().optional() }).parse(req.body);
    return issue('facebook', await social.facebook(accessToken), req);
  });
  if (config.allowDevLogin) {
    // Development only: sign in as a seeded user by handle (e.g. foodjudge_007).
    app.post('/auth/dev', async (req) => {
      const { handle } = z.object({ handle: z.string() }).parse(req.body);
      const row = (await db.query<{ id: string }>('SELECT id FROM users WHERE handle = $1 AND deleted_at IS NULL', [handle])).rows[0];
      if (!row) throw notFound('user_not_found');
      return { token: await tokens.sign(row.id), user: await users.getMe(db, row.id) };
    });
  }

  // ---- feed / posts ---------------------------------------------------------------
  app.get('/feed', async (req) => {
    const q = z
      .object({ category: category.optional(), langs: langList, q: z.string().max(100).optional(), cursor: z.string().optional(), sort: z.enum(['hot', 'new']).default('new') })
      .parse(req.query);
    return posts.feed(db, tagCfg, { viewer: await viewer(req), ...q });
  });
  app.get('/search', async (req) => {
    const q = z.object({ q: z.string().min(1).max(100), cursor: z.string().optional() }).parse(req.query);
    return posts.feed(db, tagCfg, { viewer: await viewer(req), q: q.q, cursor: q.cursor });
  });
  app.get('/nearby', async (req) => {
    const q = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180), radius_km: z.coerce.number().positive().max(200).optional() }).parse(req.query);
    return { items: await posts.nearby(db, tagCfg, await viewer(req), q.lat, q.lng, q.radius_km) };
  });
  app.get('/posts/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const me = await viewer(req);
    const post = await posts.getPost(db, tagCfg, me, id);
    if (me) await community.recordView(db, me, post.id); // §5.6 browsing history
    return post;
  });
  app.post('/posts', async (req, reply) => {
    const userId = await requireUser(req);
    const body = z
      .object({
        category,
        title: z.string().min(1).max(120),
        body: z.string().max(2000).optional(),
        emoji: z.string().max(8).optional(),
        imageUrls: z.array(z.string().regex(UPLOAD_PATH)).max(MAX_IMAGES).optional(),
        blind: z.boolean().optional(),
        lang: locale,
        location: z
          .union([
            z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), placeName: z.string().max(80) }),
            z.object({ placeName: z.string().min(1).max(80) }),
          ])
          .nullish(),
      })
      .parse(req.body);
    for (const u of body.imageUrls ?? []) if (!(await storage.exists(u))) throw badRequest('unknown_image');
    const id = await withTx(db, (tx) => posts.createPost(tx, userId, body));
    await checkBadges(userId);
    reply.status(201);
    return posts.getPost(db, tagCfg, userId, id);
  });

  // ---- images (§4.1 post images) -------------------------------------------------------
  app.post('/uploads', limit(limits.upload), async (req, reply) => {
    await requireUser(req);
    const file = await req.file();
    if (!file) throw badRequest('file_required');
    let data: Buffer;
    try {
      data = await file.toBuffer();
    } catch {
      throw new HttpError(413, 'file_too_large');
    }
    const type = sniffImage(data);
    if (!type) throw new HttpError(415, 'unsupported_image'); // JPEG and PNG only
    const url = await storage.putImage(stripMetadata(data, type), type);
    reply.status(201);
    return { url };
  });
  app.get('/uploads/:name', async (req, reply) => {
    const { name } = z.object({ name: z.string() }).parse(req.params);
    const data = await storage.read(name);
    if (!data) throw notFound();
    return reply
      .header('content-type', name.endsWith('.png') ? 'image/png' : 'image/jpeg')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .send(data);
  });

  // Own posts: edit text/cover/images, or delete.
  app.patch('/posts/:id', async (req) => {
    const userId = await requireUser(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = z
      .object({ title: z.string().max(120).optional(), body: z.string().max(2000).optional(), emoji: z.string().max(8).optional(), imageUrls: z.array(z.string().regex(UPLOAD_PATH)).max(MAX_IMAGES).optional() })
      .parse(req.body);
    for (const u of b.imageUrls ?? []) if (!(await storage.exists(u))) throw badRequest('unknown_image');
    await posts.editPost(db, userId, id, b);
    return posts.getPost(db, tagCfg, userId, id);
  });
  app.delete('/posts/:id', async (req, reply) => {
    const userId = await requireUser(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    await posts.deletePost(db, userId, id);
    reply.status(204);
  });

  // ---- ratings (§4.5) ----------------------------------------------------------------
  const rateBody = z.object({ tier, reason: z.string().max(500).optional() });
  app.post('/posts/:id/ratings', async (req, reply) => {
    const userId = await requireUser(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = rateBody.parse(req.body);
    await rate(db, userId, id, { tier: b.tier as 1 | 2 | 3 | 4 | 5, reason: b.reason });
    await checkBadges(userId);
    reply.status(201);
    return posts.getPost(db, tagCfg, userId, id);
  });
  app.patch('/posts/:id/ratings/me', async (req) => {
    const userId = await requireUser(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = rateBody.parse(req.body);
    await editRating(db, userId, id, { tier: b.tier as 1 | 2 | 3 | 4 | 5, reason: b.reason });
    return posts.getPost(db, tagCfg, userId, id);
  });

  // ---- comments (§4.6) ---------------------------------------------------------------
  app.get('/posts/:id/comments', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const q = z.object({ tier: tier.optional(), cursor: z.string().optional() }).parse(req.query);
    return posts.listComments(db, await viewer(req), id, q.tier as 1 | 2 | 3 | 4 | 5 | undefined, q.cursor, config.blindHours);
  });
  app.put('/comments/:id/like', async (req) => {
    const userId = await requireUser(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const likeCount = await posts.setCommentLike(db, userId, id, true);
    const c = (await db.query<{ user_id: string; post_id: string; body: string }>('SELECT user_id, post_id, body FROM comments WHERE id = $1', [id])).rows[0];
    if (c) await send({ userId: c.user_id, type: 'like', actorId: userId, postId: c.post_id, commentId: id, data: { text: c.body.slice(0, 80) } });
    return { likeCount };
  });

  // ---- replies (§4.6) ----------------------------------------------------------------------
  app.post('/comments/:id/replies', async (req, reply) => {
    const userId = await requireUser(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const { body } = z.object({ body: z.string().min(1).max(500) }).parse(req.body);
    const r = await posts.createReply(db, userId, id, body);
    await send({ userId: r.recipientId, type: 'reply', actorId: userId, postId: r.postId, commentId: r.id, data: { text: r.text.slice(0, 80) } });
    reply.status(201);
    return { items: await posts.listReplies(db, userId, r.threadId), threadId: r.threadId };
  });
  app.get('/comments/:id/replies', async (req) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    return { items: await posts.listReplies(db, await viewer(req), id) };
  });
  app.delete('/comments/:id', async (req, reply) => {
    const userId = await requireUser(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    await posts.deleteReply(db, userId, id);
    reply.status(204);
  });
  app.delete('/comments/:id/like', async (req) => {
    const userId = await requireUser(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    return { likeCount: await posts.setCommentLike(db, userId, id, false) };
  });

  // ---- boards (§6) -----------------------------------------------------------------
  app.get('/boards', async (req) => {
    const q = z
      .object({ period: z.enum(['monthly', 'all']).default('monthly'), category: z.enum(BOARD_CATEGORIES).default('drinks'), direction: z.enum(['best', 'worst']).default('best') })
      .parse(req.query);
    return getBoard(db, { ...q, minRatings: config.boardMinRatings, blindHours: config.blindHours });
  });

  // ---- me (§5.6–5.8) -----------------------------------------------------------------
  app.get('/me', async (req) => users.getMe(db, await requireUser(req)));
  app.delete('/me', async (req, reply) => {
    const userId = await requireUser(req);
    await withTx(db, (tx) => users.deleteAccount(tx, userId));
    reply.status(204);
  });
  app.put('/me/settings', async (req) => {
    const userId = await requireUser(req);
    const s = z
      .object({
        locale: locale.nullable().optional(),
        contentLangs: z.array(locale).optional(),
        visibility: z.enum(['everyone', 'following', 'only_me']).optional(),
        notifySocial: z.boolean().optional(),
        notifyRank: z.boolean().optional(),
      })
      .parse(req.body);
    await users.updateSettings(db, userId, s);
    return users.getMe(db, userId);
  });
  app.put('/me/profile', async (req) => {
    const userId = await requireUser(req);
    const b = z.object({ nickname: z.string().max(60).optional(), avatar: z.string().max(16).optional() }).parse(req.body);
    await users.updateProfile(db, userId, b);
    return users.getMe(db, userId);
  });
  app.get('/me/export', async (req, reply) => {
    const data = await users.exportData(db, await requireUser(req));
    reply.header('content-disposition', 'attachment; filename="myna-data.json"');
    return data;
  });
  app.get('/me/posts', async (req) => ({ items: await posts.myPosts(db, tagCfg, await requireUser(req)) }));
  app.get('/me/ratings', async (req) => ({ items: await posts.myRatedPosts(db, tagCfg, await requireUser(req)) }));
  app.get('/me/badges', async (req) => ({ items: await badgeWall(db, await requireUser(req), reqLocale(req), config.boardMinRatings, config.blindHours) }));
  app.get('/badges', async (req) => ({ items: await badgeWall(db, await requireUser(req), reqLocale(req), config.boardMinRatings, config.blindHours) }));
  app.get('/me/weekly', async (req) => weekly(db, await requireUser(req)));
  app.get('/me/challenge', async (req) => weeklyChallenge(db, await requireUser(req)));
  app.get('/leaderboard', async (req) => ({ items: await leaderboard(db, await viewer(req)) }));
  app.get('/me/blocks', async (req) => ({ items: await users.listBlocks(db, await requireUser(req)) }));
  app.put('/me/blocks/:userId', async (req) => {
    const me = await requireUser(req);
    const { userId } = z.object({ userId: uuid }).parse(req.params);
    await users.block(db, me, userId);
    return { ok: true };
  });
  app.delete('/me/blocks/:userId', async (req) => {
    const me = await requireUser(req);
    const { userId } = z.object({ userId: uuid }).parse(req.params);
    await users.unblock(db, me, userId);
    return { ok: true };
  });

  // ---- phase 2: favourites, history, drafts, likes received, profiles & follows (§5.6) ----
  app.put('/posts/:id/favorite', async (req) => {
    const me = await requireUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await community.setFavorite(db, me, id, true);
    return { favorited: true };
  });
  app.delete('/posts/:id/favorite', async (req) => {
    const me = await requireUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await community.setFavorite(db, me, id, false);
    return { favorited: false };
  });
  app.get('/me/favorites', async (req) => ({ items: await community.favorites(db, tagCfg, await requireUser(req)) }));
  app.get('/me/history', async (req) => ({ items: await community.history(db, tagCfg, await requireUser(req)) }));
  app.delete('/me/history', async (req, reply) => {
    await community.clearHistory(db, await requireUser(req));
    reply.status(204);
  });
  app.get('/me/likes', async (req) => ({ items: await community.likesReceived(db, await requireUser(req)) }));
  app.get('/me/following', async (req) => ({ items: await community.following(db, await requireUser(req)) }));

  const draftPayload = z
    .object({
      type: z.enum(['product', 'event']).optional(),
      category: category.optional(),
      title: z.string().max(120).optional(),
      body: z.string().max(2000).optional(),
      emoji: z.string().max(8).nullable().optional(),
      imageUrls: z.array(z.string().regex(UPLOAD_PATH)).max(MAX_IMAGES).optional(),
      blind: z.boolean().optional(),
      lang: locale.optional(),
      placeName: z.string().max(80).nullable().optional(),
      lat: z.number().min(-90).max(90).nullable().optional(),
      lng: z.number().min(-180).max(180).nullable().optional(),
    })
    .strict();
  app.get('/drafts', async (req) => ({ items: await community.listDrafts(db, await requireUser(req)) }));
  app.post('/drafts', async (req, reply) => {
    const me = await requireUser(req);
    const b = z.object({ id: uuid.optional(), payload: draftPayload }).parse(req.body);
    const d = await community.saveDraft(db, me, b.id, b.payload);
    reply.status(b.id ? 200 : 201);
    return d;
  });
  app.delete('/drafts/:id', async (req, reply) => {
    const me = await requireUser(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    await community.deleteDraft(db, me, id);
    reply.status(204);
  });

  app.get('/users/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return community.profile(db, tagCfg, await viewer(req), id);
  });
  app.put('/users/:id/follow', async (req) => {
    const me = await requireUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await community.setFollow(db, me, id, true);
    await send({ userId: id, type: 'follow', actorId: me });
    return { following: true };
  });
  app.delete('/users/:id/follow', async (req) => {
    const me = await requireUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await community.setFollow(db, me, id, false);
    return { following: false };
  });

  // ---- notifications & push --------------------------------------------------------------
  app.get('/notifications', async (req) => notifications.listNotifications(db, await requireUser(req)));
  app.get('/notifications/unread', async (req) => ({ unread: await notifications.unreadCount(db, await requireUser(req)) }));
  app.post('/notifications/read-all', async (req) => {
    await notifications.markAllRead(db, await requireUser(req));
    return { ok: true };
  });
  app.post('/me/push-tokens', async (req, reply) => {
    const me = await requireUser(req);
    const b = z.object({ token: z.string().min(10).max(200), platform: z.enum(['ios', 'android', 'web', 'unknown']).default('unknown') }).parse(req.body);
    await notifications.registerPushToken(db, me, b.token, b.platform);
    reply.status(201);
    return { ok: true };
  });
  app.delete('/me/push-tokens', async (req) => {
    const me = await requireUser(req);
    const b = z.object({ token: z.string().min(10).max(200) }).parse(req.body);
    await notifications.removePushToken(db, me, b.token);
    return { ok: true };
  });

  // ---- seasons (§6) ------------------------------------------------------------------------
  app.get('/seasons/last', async () => {
    const season = previousSeason();
    return { season, awards: await seasonAwards(db, season) };
  });

  // ---- feedback ----------------------------------------------------------------------------
  app.post('/feedback', limit(10), async (req, reply) => {
    const me = await viewer(req);
    const b = z.object({ body: z.string().trim().min(1).max(2000), appVersion: z.string().max(20).optional(), platform: z.string().max(20).optional() }).parse(req.body);
    await db.query('INSERT INTO feedback (user_id, body, app_version, platform) VALUES ($1, $2, $3, $4)', [me, b.body, b.appVersion ?? null, b.platform ?? null]);
    reply.status(201);
    return { ok: true };
  });

  // ---- moderation (App Store 1.2) ------------------------------------------------------
  app.post('/reports', async (req, reply) => {
    const me = await requireUser(req);
    const b = z
      .object({ postId: uuid.optional(), commentId: uuid.optional(), reason: z.enum(['spam', 'abuse', 'illegal', 'other']), note: z.string().max(500).default('') })
      .parse(req.body);
    const r = await posts.report(db, me, b, b.reason, b.note);
    reply.status(201);
    return { ok: true, hidden: r.hidden };
  });

  // ---- admin moderation (role = admin; grant with `npm run admin:grant -- <handle>`) -------
  app.get('/admin/reports', async (req) => {
    await requireAdmin(req);
    return { items: await admin.reportQueue(db) };
  });
  app.post('/admin/reports/resolve', async (req) => {
    const me = await requireAdmin(req);
    const b = z.object({ targetType: z.enum(['post', 'comment']), targetId: uuid, action: z.enum(['remove', 'restore', 'dismiss']) }).parse(req.body);
    await admin.resolveReports(db, me, b.targetType, b.targetId, b.action);
    return { ok: true };
  });
  app.put('/admin/users/:id/ban', async (req) => {
    const me = await requireAdmin(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    if (id === me) throw badRequest('cannot_ban_self');
    await admin.setBan(db, id, true);
    return { ok: true };
  });
  app.delete('/admin/users/:id/ban', async (req) => {
    await requireAdmin(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    await admin.setBan(db, id, false);
    return { ok: true };
  });
  });

  /** Settles the previous month if nobody has yet, then notifies the authors (safe to call repeatedly). */
  app.decorate('runSeasonJob', async (now = new Date()) => {
    const season = previousSeason(now);
    const awards = await settleSeason(db, season, config.boardMinRatings, config.blindHours);
    if (!awards) return null;
    for (const a of awards) {
      await send({ userId: a.authorId, type: 'season', postId: a.postId, data: { season, category: a.category, rank: a.rank, title: a.title } });
    }
    for (const author of new Set(awards.map((a) => a.authorId))) await checkBadges(author);
    app.log.info({ season, awards: awards.length }, 'season settled');
    return awards;
  });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    runSeasonJob: (now?: Date) => Promise<import('./services/seasons').SeasonAward[] | null>;
  }
}
