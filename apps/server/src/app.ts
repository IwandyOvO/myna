import cors from '@fastify/cors';
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
import { badgeWall, leaderboard, weekly, weeklyChallenge } from './services/badges';
import { getBoard } from './services/boards';
import * as posts from './services/posts';
import * as community from './services/social';
import { editRating, rate } from './services/ratings';
import * as users from './services/users';

export interface AppDeps {
  db: Db;
  config: Config;
  mailer?: Mailer;
  social?: SocialVerifier;
  storage?: Storage;
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
  const tagCfg = { tags: config.autoTags, blindHours: config.blindHours };

  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' && { level: 'info' } });
  app.register(cors, { origin: true, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] });
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
    return id;
  }
  const reqLocale = (req: FastifyRequest): Locale => resolveLocale(req.headers['accept-language']?.split(',')[0]);

  async function issue(provider: AuthProvider, identity: Parameters<typeof users.findOrCreateUser>[2], req: FastifyRequest) {
    const userId = await withTx(db, (tx) => users.findOrCreateUser(tx, provider, identity, reqLocale(req)));
    return { token: await tokens.sign(userId), user: await users.getMe(db, userId) };
  }

  app.get('/health', async () => ({ ok: true }));

  // ---- auth (§10 POST /auth/{provider}) ----------------------------------------
  app.post('/auth/email/start', async (req) => {
    const { email } = z.object({ email: z.string() }).parse(req.body);
    const e = users.normalizeEmail(email);
    const code = await users.issueEmailCode(db, e, config.jwtSecret);
    await mailer.sendLoginCode(e, code);
    return config.exposeEmailCodes ? { sent: true, devCode: code } : { sent: true };
  });
  app.post('/auth/email', async (req) => {
    const { email, code } = z.object({ email: z.string(), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const e = users.normalizeEmail(email);
    await users.consumeEmailCode(db, e, code, config.jwtSecret);
    return issue('email', { providerUid: e, email: e }, req);
  });
  app.post('/auth/google', async (req) => {
    const { idToken } = z.object({ idToken: z.string().min(10) }).parse(req.body);
    return issue('google', await social.google(idToken), req);
  });
  app.post('/auth/apple', async (req) => {
    const { identityToken, fullName } = z.object({ identityToken: z.string().min(10), fullName: z.string().max(60).optional() }).parse(req.body);
    const id = await social.apple(identityToken);
    return issue('apple', { ...id, name: fullName || id.name }, req);
  });
  app.post('/auth/facebook', async (req) => {
    const { accessToken } = z.object({ accessToken: z.string().min(10) }).parse(req.body);
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
    const q = z.object({ category: category.optional(), langs: langList, q: z.string().max(100).optional(), cursor: z.string().optional() }).parse(req.query);
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
    reply.status(201);
    return posts.getPost(db, tagCfg, userId, id);
  });

  // ---- images (§4.1 post images) -------------------------------------------------------
  app.post('/uploads', async (req, reply) => {
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

  // ---- ratings (§4.5) ----------------------------------------------------------------
  const rateBody = z.object({ tier, reason: z.string().max(500).optional() });
  app.post('/posts/:id/ratings', async (req, reply) => {
    const userId = await requireUser(req);
    const { id } = z.object({ id: uuid }).parse(req.params);
    const b = rateBody.parse(req.body);
    await rate(db, userId, id, { tier: b.tier as 1 | 2 | 3 | 4 | 5, reason: b.reason });
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
    return { likeCount: await posts.setCommentLike(db, userId, id, true) };
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
      .object({ locale: locale.nullable().optional(), contentLangs: z.array(locale).optional(), visibility: z.enum(['everyone', 'following', 'only_me']).optional() })
      .parse(req.body);
    await users.updateSettings(db, userId, s);
    return users.getMe(db, userId);
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
    return { following: true };
  });
  app.delete('/users/:id/follow', async (req) => {
    const me = await requireUser(req);
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await community.setFollow(db, me, id, false);
    return { following: false };
  });

  // ---- moderation (App Store 1.2) ------------------------------------------------------
  app.post('/reports', async (req, reply) => {
    const me = await requireUser(req);
    const b = z
      .object({ postId: uuid.optional(), commentId: uuid.optional(), reason: z.enum(['spam', 'abuse', 'illegal', 'other']), note: z.string().max(500).default('') })
      .parse(req.body);
    await posts.report(db, me, b, b.reason, b.note);
    reply.status(201);
    return { ok: true };
  });

  return app;
}
