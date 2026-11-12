# End-to-end walkthroughs (web build + real API)

Scripted Playwright runs of the main user journeys against a fresh seed. They exercise the same React Native code
through react-native-web, so they catch logic/UI regressions — not native-only issues (test those on a device).

```bash
# 1. fresh data (03 also needs last month's stats so a season settlement happens at server start)
npm run db:seed
psql "$DATABASE_URL" -c "INSERT INTO post_season_stats (post_id, season, c1,c2,c3,c4,c5) SELECT post_id, to_char(date_trunc('month', now() AT TIME ZONE 'UTC') - interval '1 day','YYYY-MM'), c1,c2,c3,c4,c5 FROM post_season_stats WHERE season = to_char(now() AT TIME ZONE 'UTC','YYYY-MM');"
# 2. API (dev helpers on) and the web build
ALLOW_DEV_LOGIN=1 DEV_EXPOSE_EMAIL_CODES=1 npm run server &
(cd apps/mobile && EXPO_PUBLIC_API_URL=http://localhost:4000 npx expo export --platform web --output-dir /tmp/myna-web)
node e2e/static-server.cjs /tmp/myna-web 8081 &
# 3. run (the argument is a folder for screenshots; it needs a shots/ subfolder)
mkdir -p /tmp/myna-e2e/shots
node e2e/04-own-posts-moderation.cjs /tmp/myna-e2e && node e2e/03-replies-notifications.cjs /tmp/myna-e2e && node e2e/02-community.cjs /tmp/myna-e2e && node e2e/01-core.cjs /tmp/myna-e2e
```

Each script prints `ok`/`FAIL` per step and saves a screenshot for every failure.
