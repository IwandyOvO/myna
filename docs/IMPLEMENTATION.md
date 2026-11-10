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

Verified: 15 shared unit tests, 32 server integration tests on PostgreSQL 16, typecheck of all three packages,
and a scripted Playwright walkthrough of the web build against the real API (browse → filter → blind post locked →
log in → rate → unlocked → edit → drawer → settings in EN + dark → boards → publish → me). Native iOS/Android builds
have **not** been run in this environment.

## Deferred (spec phase 2/3, or needs credentials)

- §7 system share import (iOS Share Extension / Android `ACTION_SEND`). Link Finder currently offers only the honest manual search; it never guesses.
- Production object storage + CDN, thumbnails, and image moderation (uploads themselves are done).
- Favourites, history, drafts, follows, likes-received list, limited-time challenges, badge leaderboard → "coming in a later release" toasts.
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
