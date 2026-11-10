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

## Mobile app

```bash
cd apps/mobile
npx eas-cli@latest init          # creates the EAS project, writes extra.eas.projectId (needed for push)
npx eas-cli@latest build --profile preview --platform ios      # TestFlight/internal build
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios
```

Set `EXPO_PUBLIC_API_URL` to the deployed API in `eas.json` (per profile) before building.

## Before submitting to the App Store

- Terms of Service and Privacy Policy pages (Settings links them; texts need legal review).
- USPTO trademark search for "Myna" (spec §13.1).
- A moderation workflow for `reports` (currently stored in the database only).
- App Privacy answers: e-mail, user content (posts, ratings, photos), coarse/precise location (optional), device push token.
