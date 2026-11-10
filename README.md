# Myna · 听听大家怎么说

MVP implementation of the Myna spec v0.8.0 (`docs/myna-handoff.md`, prototype in `docs/myna-prototype-v0.8.html`).

```
packages/shared   Categories, the §4.2/§4.3 scales (verbatim), §5.4 placeholders, rating rules,
                  7-language dictionaries, API wire types. Used by both apps.
apps/server       Fastify + PostgreSQL REST API (§10), migrations, seed data (§12), integration tests.
apps/mobile       Expo (SDK 58) + expo-router app for iOS/Android (also runs on web for QA).
tools/            Extractor that pulls copy/seed data out of the prototype so nothing is retyped by hand.
```

## Run it

Requirements: Node 22+, PostgreSQL 16, git.

1. Create the database user and databases (psql / "SQL Shell" on Windows, as the `postgres` superuser):

   ```sql
   CREATE USER myna WITH PASSWORD 'myna' CREATEDB;
   CREATE DATABASE myna OWNER myna;
   CREATE DATABASE myna_test OWNER myna;
   ```

2. Install, configure, seed:

   ```bash
   npm install
   cp apps/server/.env.example apps/server/.env      # Windows: copy apps\server\.env.example apps\server\.env
   cp apps/mobile/.env.example apps/mobile/.env
   npm run db:seed
   ```

3. Start everything from one terminal:

   ```bash
   npm run dev         # API on :4000 + Expo; press w for the browser, or scan the QR code with Expo Go
   ```

   `npm run dev -- -c` also clears the bundler cache. The API's full log is in `apps/server/dev.log`;
   the terminal only shows `[api] ready` and errors. (`npm run server` / `npm run mobile` still start them separately.)

   **After pulling new code:** `git pull` then `npm install`, then `npm run dev` again.

Both `.env` files are loaded automatically. The server example enables dev conveniences
(`ALLOW_DEV_LOGIN`, `DEV_EXPOSE_EMAIL_CODES`): the login screen fills in the e-mail code for you.
For a real phone, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to your computer's LAN IP
(e.g. `http://192.168.1.23:4000`) and keep phone and computer on the same Wi-Fi.
The seeded demo account is `干饭鉴黄师 @foodjudge_007` (dev login: `POST /auth/dev {"handle":"foodjudge_007"}`).

Apple sign-in needs a development build (`npx expo run:ios` or `eas build --profile development`).

## Checks

```bash
npm test            # shared unit tests + server integration tests (real Postgres)
npm run typecheck   # shared, server, mobile
```

## Configuration

Server (`apps/server/.env.example`): `DATABASE_URL`, `JWT_SECRET` (required in production), social sign-in
(`GOOGLE_CLIENT_IDS`, `APPLE_BUNDLE_IDS`, `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` — a provider left empty answers 501),
and the §14 operating parameters (`BOARD_MIN_RATINGS`, `TAG_*`).

Mobile: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GOOGLE_{IOS,ANDROID,WEB}_CLIENT_ID`, `EXPO_PUBLIC_FACEBOOK_APP_ID`.

See `docs/IMPLEMENTATION.md` for what is done, what is deferred, and the decisions that need product sign-off.
