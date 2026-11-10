# Implementation notes (MVP, spec v0.8.0)

## Done — §16 phase 1

| Spec | Where | Notes |
|---|---|---|
| §3 navigation | `apps/mobile/src/components/TabBar.tsx`, `Drawer.tsx` | 5-slot bar with raised publish button; left drawer (78%, mask/✕/swipe to close). Link Finder + Settings are stack pages, so Back returns to the tab you came from. |
| §4.1–4.3 taxonomy & scales | `packages/shared/src/categories.ts`, `scales.ts` | Copy is verbatim; `scaleFor()` is the only way screens label tiers. Tests enforce no 💩 and ≤4-char zh labels. |
| §4.4 aggregation, blind, auto tags | `apps/server/src/services/posts.ts`, `db/migrations/001_init.sql` | `post_stats.total/avg` are generated columns, so they can't drift. Tag thresholds are env-configurable. |
| §4.5 rate / edit ×3 / "edited" | `services/ratings.ts` | Transactional; rating is mirrored into the comment stream; empty reason on edit keeps the old text (prototype behaviour). |
| §4.6 comments | tier filter chips, tier badge, likes | Replies not built (spec: "按通用社交产品实现", not in prototype). |
| §5.1–5.3 home / detail / publish | `src/app/(tabs)/index.tsx`, `post/[id].tsx`, `publish.tsx` | Placeholders switch per category (§5.4). GPS + reverse geocoding with manual city fallback. |
| §5.5 nearby | `(tabs)/nearby.tsx`, `GET /nearby` | 1/5/10 km/whole city (=50 km). |
| §5.6–5.7 me / badges | `(tabs)/me.tsx`, `achievements.tsx`, `services/badges.ts` | 11 badges with computed progress; unlocks are automatic. |
| §5.8 settings | `settings.tsx` | 7 UI languages (default = system), dark mode, visibility, block list, clear cache, account deletion. |
| §5.9 i18n | `packages/shared/src/i18n` | Prototype dictionaries are extracted, not retyped (`tools/gen-from-prototype.cjs`). New keys exist in all 7 languages (test-enforced). |
| §6 boards | `services/boards.ts` | Monthly seasons (`post_season_stats`, UTC month) and all-time; min-ratings threshold; 60 s in-process cache. |
| §8 accounts | `/auth/email/start`, `/auth/email`, `/auth/{google,apple,facebook}` | E-mail one-time code; social tokens verified server-side (Google/Apple JWKS, Facebook `debug_token`). No third-party passwords ever. |
| §13.3 UGC | `POST /reports`, block/unblock | Report sheet + block author on the detail page. Moderation console not built. |
| App Store 5.1.1(v) | `DELETE /me` | Erases identity and personal data; anonymous votes stay so averages and boards remain correct. |

Verified (phase 1–2): 15 shared unit tests, 41 server integration tests on PostgreSQL 16, typecheck of all three packages,
and two scripted Playwright walkthroughs of the web build against the real API (browse → filter → blind post locked →
log in → rate → unlocked → edit → drawer → settings in EN + dark → boards → publish → me; then favourite → profile/follow →
history → draft autosave/resume → likes → challenge/leaderboard → comment report). Native iOS/Android builds
have **not** been run in this environment.

## Phase 2: community features (done)

| Spec | What | Where |
|---|---|---|
| §5.6 收藏 | ☆/★ on the detail page, favourites list | `PUT/DELETE /posts/:id/favorite`, `GET /me/favorites`, `app/me/favorites.tsx` |
| §5.6 浏览历史 | Recorded when a signed-in user opens a post; one row per post, newest first; clear | `GET/DELETE /me/history`, migration `002_social.sql` |
| §5.6 草稿箱 | Leaving the publish page with unsent content saves a draft; tap a draft to resume; publishing deletes it | `GET/POST /drafts`, `DELETE /drafts/:id`, `app/me/drafts.tsx` |
| §5.6 获赞记录 | Who liked which of my comments | `GET /me/likes`, `app/me/likes.tsx` |
| §5.6 关注 | Tap any author/commenter → profile with counts, posts and follow; following list | `GET /users/:id`, `PUT/DELETE /users/:id/follow`, `GET /me/following` |
| §5.7 | Weekly challenge ("rate 5 new products this week") and badge leaderboard | `GET /me/challenge`, `GET /leaderboard` |
| §5.8 | "Who can see my ratings" is enforced on comment lists (hidden ratings still count in averages) | `services/posts.ts` `listComments` |
| §13.3 | Comments are reportable too (⋯ on each comment), plus block author | detail page |
| — | Route error boundary: friendly retry / go-home page instead of a red screen | `components/CrashScreen.tsx` |

## Phase 3: replies, notifications, seasons, production readiness (done)

| Area | What | Where |
|---|---|---|
| §4.6 replies | Reply to any comment or reply (threads stay one level deep), first 3 inline + "View all N", delete your own reply | `POST/GET /comments/:id/replies`, `DELETE /comments/:id`, `components/comments.tsx` |
| Notifications | Reply / like / follow / badge / season entries; never for yourself or from blocked users; likes and follows notify once; 🔔 unread badge + inbox | `services/notify.ts`, `GET /notifications`, `app/notifications.tsx` |
| Push | Expo push tokens registered after sign-in, removed on sign-out; tap opens the right screen; per-type switches (Activity / Charts & badges); dead tokens pruned | `lib/push.ts`, `POST/DELETE /me/push-tokens`, `ExpoPusher` |
| §6 seasons | Previous month's best-board Top 20 frozen into `season_awards` (hourly, idempotent), authors notified, "Chart Maker"/"Monthly Champion" badges awarded from it; "Last season" sheet on Rankings | `services/seasons.ts`, `GET /seasons/last` |
| Badges | Unlock immediately after posting/rating and notify | `unlockBadges()` |
| Profile | Edit nickname and avatar | `PUT /me/profile`, `app/me/edit.tsx` |
| Comments | Paged with "Load more comments" | `useComments` (infinite) |
| Legal & support | Terms / Privacy pages (draft — legal review needed), consent line on login, Send Feedback | `lib/legal.ts`, `POST /feedback` |
| Resilience | Offline banner, crash fallback page, request timeouts | `OfflineBanner`, `CrashScreen` |
| Server hardening | Rate limits (300/min, sign-in 10/min, uploads 30/min), helmet headers, 256 KB body limit, CORS origins, trust-proxy, token redaction in logs, `/ready`, graceful shutdown | `app.ts`, `index.ts` |
| Deploy | Dockerfile (API + shared deps only; production boot verified locally), docker-compose, `eas.json`, `docs/DEPLOY.md` | repo root |

Verified at this point: 15 shared unit tests, 53 server integration tests, typecheck of all packages, and 30 end-to-end steps
across `e2e/01-core`, `02-community`, `03-replies-notifications` (web build against the real API). Not verified here: a
Docker image build (no Docker daemon in this environment), push delivery to a real device (needs an EAS project id and a
physical phone), and native builds.

## Deferred (spec phase 2/3, or needs credentials)

- §7 system share import (iOS Share Extension / Android `ACTION_SEND`). Link Finder currently offers only the honest manual search; it never guesses.
- Production object storage + CDN, thumbnails, and image moderation (uploads themselves are done).
- The limited challenge's reward badge; a moderation console for `reports`/`feedback`; data export ("Download my data").
- Real e-mail delivery (`ConsoleMailer` → SES/Postmark), push notifications, Redis, rate limiting, moderation console.
- Social sign-in needs real client IDs; unconfigured providers show "not set up yet" in the app and 501 on the API.

## Product decisions (2026-11, spec v0.8.1)

Decided:
1. **§4.3 generic zh product scale** is now 👎 踩雷 / 😖 不太行 / 😐 一般 / 😋 不错 / 🤩 顶级 (was 屎 / 不好喝 / 好喝). Test-enforced: no "屎" in any scale.
2. **Blind window = 24 h** (`BLIND_HOURS`, shared constant + server env). During the window the score, breakdown, auto tags, comment tier badges and tier filter are hidden from people who have not rated, and the post stays off the boards. Afterwards it is a normal public post and can chart.
3. **Phase 2 starts with image uploads** — done, see below.

Still placeholders / open:
4. **"Food" board = snacks + dining.** §6 is ambiguous; it uses the dining scale as specified.
5. **Demo account stats.** The seed keeps the spec identity (干饭鉴黄师, @foodjudge_007, reputation 92, 3 badges) but shows real counts, not the illustrative 12 / 348 / 1.2k.
6. **Reputation rule (placeholder, §14):** +2 per first rating (matches the "Rated! Reputation +2" copy), clamped to 0–100. Badge time rules (streak, night owl) use UTC until users have a time zone.
7. Badge descriptions/conditions only exist in zh/en in the prototype; the other 5 languages fall back to English.

## Phase 2: image uploads

- App: up to 4 photos per post (library or camera, cropped 4:3, JPEG quality 0.7); the first is the cover on cards and the detail page shows a swipeable gallery. Emoji stays as the fallback cover.
- API: `POST /uploads` (signed-in, multipart, ≤ 8 MB, JPEG/PNG identified by magic bytes, not by the declared type) → `{ url: "/uploads/<uuid>.jpg" }`; `POST /posts` only accepts paths that exist in our storage.
- Privacy: EXIF/XMP (incl. GPS) and PNG text chunks are stripped server-side before storing; the picker is also asked not to return EXIF.
- Storage: `LocalDiskStorage` (`UPLOAD_DIR`, default `apps/server/uploads/`, git-ignored) behind a `Storage` interface. **Before launch:** S3/R2 + CDN implementation, image resizing/thumbnails, and image moderation (App Store 1.2) — reports already cover posts with images.

## Still open from the spec (§13–14)

USPTO trademark search for "Myna"; operating parameters (board threshold, tag thresholds, reputation algorithm); cold-start category focus; real-device GPS check.
