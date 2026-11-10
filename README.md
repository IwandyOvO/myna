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

Requirements: Node 22, PostgreSQL 16.

```bash
npm install
createdb myna && createdb myna_test        # or use DATABASE_URL / TEST_DATABASE_URL
cp apps/server/.env.example apps/server/.env
npm run db:seed                            # migrates + loads the prototype's posts, boards and badges
ALLOW_DEV_LOGIN=1 DEV_EXPOSE_EMAIL_CODES=1 npm run server   # http://localhost:4000
npm run mobile                             # Expo dev server; press i / a / w
```

Point a device at your machine with `EXPO_PUBLIC_API_URL=http://<lan-ip>:4000 npm run mobile`.
With `DEV_EXPOSE_EMAIL_CODES=1` the login screen fills in the e-mail code for you. The seeded demo account is
`干饭鉴黄师 @foodjudge_007` (dev login: `POST /auth/dev {"handle":"foodjudge_007"}`).

Expo Go cannot load Apple sign-in or SecureStore natively in every case; use a development build
(`npx expo run:ios` / `run:android` or `eas build --profile development`).

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
