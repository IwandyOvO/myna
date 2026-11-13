# Deploying Myna

## What you need to provide

| Item | Why | Where it goes |
|---|---|---|
| A server or container host (Fly.io, Render, Railway, AWS, a VPS…) | Runs the API | `Dockerfile` in the repo root |
| Managed PostgreSQL 16 | Data | `DATABASE_URL` |
| A random secret, 32+ characters | Signs login tokens | `JWT_SECRET` (`openssl rand -hex 32`) |
| E-mail provider (Postmark, SES, SendGrid, Resend) | Login codes | implement `Mailer` in `apps/server/src/auth/mailer.ts` (currently logs to the console) |
| Object storage + CDN (S3/R2) | Photos | implement `Storage` in `apps/server/src/lib/storage.ts` (currently local disk; mount `/data/uploads` as a persistent volume meanwhile) |
| Apple Developer account ($99/yr) | iOS builds, Sign in with Apple, push | `APPLE_BUNDLE_IDS=app.myna.ios`, EAS credentials |
| Google / Facebook developer apps | Social sign-in | `GOOGLE_CLIENT_IDS`, `FACEBOOK_APP_ID/SECRET`, and the app's `EXPO_PUBLIC_*` IDs |
| Expo account + EAS project | App builds and push tokens | `eas init` writes the project id into `app.json` |

## API

```bash
docker build -t myna-api .
docker run -p 4000:4000 -e DATABASE_URL=... -e JWT_SECRET=... -v myna-uploads:/data/uploads myna-api
```

or locally, production-like: `JWT_SECRET=$(openssl rand -hex 32) docker compose up --build`.

- Migrations run automatically at startup.
- `GET /health` = process alive, `GET /ready` = database reachable (use for load-balancer checks).
- The monthly season settlement runs inside the API (hourly check, idempotent), so several instances are safe.
- `NODE_ENV=production` refuses to start without `JWT_SECRET` and disables dev login / dev e-mail codes.
- Behind a proxy set `TRUST_PROXY=1`; for a web client set `CORS_ORIGINS`.
- Logs are JSON on stdout; tokens and codes are redacted.

## Web app

The same Expo app, exported for browsers (`Dockerfile.web`) and served by a tiny static server
(`apps/mobile/serve-web.cjs`: SPA fallback, gzip, long-cache hashed bundles, `GET /health`).

```bash
docker build -f Dockerfile.web --build-arg EXPO_PUBLIC_API_URL=https://api.example.com -t myna-web .
docker run -p 8080:8080 myna-web
```

On Railway: add a second service from the same GitHub repo with the variables
`RAILWAY_DOCKERFILE_PATH=Dockerfile.web` and `EXPO_PUBLIC_API_URL=https://<api domain>`, then generate a domain
on port 8080. The API URL is baked in at build time, so changing it needs a redeploy.

- On the API, set `WEB_APP_URL=https://<web domain>`: share pages (`/p/:id`) then offer "View on the web".
- Optionally lock the API to the web origin with `CORS_ORIGINS=https://<web domain>` (native apps send no Origin, so they're unaffected).
- On the web, e-mail sign-in works out of the box; push notifications are app-only, and social sign-in needs each provider's web client set up.

## Mobile app

```bash
cd apps/mobile
npx eas-cli@latest init          # creates the EAS project, writes extra.eas.projectId (needed for push)
npx eas-cli@latest build --profile preview --platform ios      # TestFlight/internal build
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios
```

Set `EXPO_PUBLIC_API_URL` to the deployed API in `apps/mobile/eas.json` (per profile; `api.myna.example` is a placeholder) before building.
The `development` profile needs `npx expo install expo-dev-client` first — it is left out on purpose because, once installed,
`npx expo start` opens development builds instead of Expo Go.

## Before submitting to the App Store

- Terms of Service and Privacy Policy pages (Settings links them; texts need legal review).
- USPTO trademark search for "Myna" (spec §13.1).
- Who moderates: grant the role with `npm run admin:grant -- <handle>`; they use Settings → 🛡️ Moderation in the app.
- App Privacy answers: e-mail, user content (posts, ratings, photos), coarse/precise location (optional), device push token.

## Crash reporting (Sentry) — set up

Wired in for both sides (organization `myna-cj`):
- App → project `myna` (`apps/mobile/src/lib/sentry.ts`, override with `EXPO_PUBLIC_SENTRY_DSN`)
- API → project `myna-api` (`apps/server/src/instrument.ts`, override with `SENTRY_DSN`, `SENTRY_DSN=off` disables)

Only errors are sent (no tracing), and no personal data: no e-mail, IP, cookies, headers, bodies or query strings —
the app tags reports with the opaque user id only. Reports carry `environment` = development / production.

Check it works: in a dev build tap Settings → 🧪 Sentry test error (app), and open `http://localhost:4000/debug/sentry`
with `ALLOW_DEV_LOGIN=1` (API). Both test hooks exist only in development.

Readable stack traces for release builds need an auth token as an EAS secret (never commit it or paste it in chat):
`npx eas-cli@latest secret:create --name SENTRY_AUTH_TOKEN --value <token>` (Sentry → Settings → Auth Tokens, scope
`project:releases`). Expo Go reports JavaScript errors only; native crashes need a development/production build.
