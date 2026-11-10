-- Myna schema v0.8 (spec §9, adapted). All ids are UUIDs.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname      text NOT NULL,
  handle        text NOT NULL UNIQUE,
  avatar        text NOT NULL DEFAULT '🙂',      -- emoji avatar; avatar_url once uploads exist
  avatar_url    text,
  reputation    int  NOT NULL DEFAULT 80 CHECK (reputation BETWEEN 0 AND 100),
  locale        text,
  content_langs text[] NOT NULL DEFAULT '{zh,en,es,fr,ja,ko,it}',
  visibility    text NOT NULL DEFAULT 'everyone' CHECK (visibility IN ('everyone','following','only_me')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE TABLE auth_identities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     text NOT NULL CHECK (provider IN ('email','google','facebook','apple')),
  provider_uid text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_uid)
);

CREATE TABLE email_codes (
  email      text PRIMARY KEY,
  code_hash  text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts   int NOT NULL DEFAULT 0
);

CREATE TABLE posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   uuid NOT NULL REFERENCES users(id),
  type        text NOT NULL CHECK (type IN ('product','event')),
  category    text NOT NULL,
  title       text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body        text NOT NULL DEFAULT '',
  emoji       text NOT NULL DEFAULT '✨',
  image_urls  text[] NOT NULL DEFAULT '{}',
  lang        text NOT NULL,
  blind       boolean NOT NULL DEFAULT false,
  lat         double precision,
  lng         double precision,
  place_name  text,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','removed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_feed_idx ON posts (created_at DESC, id DESC) WHERE status = 'active';
CREATE INDEX posts_category_idx ON posts (category, created_at DESC);
CREATE INDEX posts_geo_idx ON posts (lat, lng) WHERE lat IS NOT NULL;

-- Five-tier counts. total/avg are generated so they can never drift from c1..c5.
CREATE TABLE post_stats (
  post_id uuid PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  c1 int NOT NULL DEFAULT 0 CHECK (c1 >= 0), c2 int NOT NULL DEFAULT 0 CHECK (c2 >= 0),
  c3 int NOT NULL DEFAULT 0 CHECK (c3 >= 0), c4 int NOT NULL DEFAULT 0 CHECK (c4 >= 0),
  c5 int NOT NULL DEFAULT 0 CHECK (c5 >= 0),
  total int GENERATED ALWAYS AS (c1 + c2 + c3 + c4 + c5) STORED,
  avg numeric(3,1) GENERATED ALWAYS AS (
    round((c1 + 2*c2 + 3*c3 + 4*c4 + 5*c5)::numeric / NULLIF(c1 + c2 + c3 + c4 + c5, 0), 1)) STORED
);

-- Monthly season counts (§6 月榜 / 赛季). A rating counts in the season it was first given.
CREATE TABLE post_season_stats (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  season  text NOT NULL,                      -- 'YYYY-MM' (UTC)
  c1 int NOT NULL DEFAULT 0 CHECK (c1 >= 0), c2 int NOT NULL DEFAULT 0 CHECK (c2 >= 0),
  c3 int NOT NULL DEFAULT 0 CHECK (c3 >= 0), c4 int NOT NULL DEFAULT 0 CHECK (c4 >= 0),
  c5 int NOT NULL DEFAULT 0 CHECK (c5 >= 0),
  total int GENERATED ALWAYS AS (c1 + c2 + c3 + c4 + c5) STORED,
  avg numeric(3,1) GENERATED ALWAYS AS (
    round((c1 + 2*c2 + 3*c3 + 4*c4 + 5*c5)::numeric / NULLIF(c1 + c2 + c3 + c4 + c5, 0), 1)) STORED,
  PRIMARY KEY (post_id, season)
);
CREATE INDEX post_season_stats_season_idx ON post_season_stats (season);

CREATE TABLE ratings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id),
  tier         smallint NOT NULL CHECK (tier BETWEEN 1 AND 5),
  reason_text  text NOT NULL DEFAULT '',
  edited_count smallint NOT NULL DEFAULT 0 CHECK (edited_count BETWEEN 0 AND 3),
  season       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
CREATE INDEX ratings_user_idx ON ratings (user_id, created_at DESC);

CREATE TABLE comments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id),
  rating_id     uuid UNIQUE REFERENCES ratings(id) ON DELETE CASCADE, -- the comment mirroring a user's rating (§4.5)
  tier_snapshot smallint NOT NULL CHECK (tier_snapshot BETWEEN 1 AND 5),
  body          text NOT NULL DEFAULT '',
  like_count    int NOT NULL DEFAULT 0,
  edited        boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_post_idx ON comments (post_id, tier_snapshot);

CREATE TABLE comment_likes (
  comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE badges (
  id        serial PRIMARY KEY,
  key       text NOT NULL UNIQUE,
  icon      text NOT NULL,
  name_i18n jsonb NOT NULL,
  desc_i18n jsonb NOT NULL,
  cond_i18n jsonb NOT NULL,
  rule      jsonb NOT NULL,      -- {"metric": "...", "target": n}
  sort      int NOT NULL DEFAULT 0
);

CREATE TABLE user_badges (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id    int  NOT NULL REFERENCES badges(id),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

CREATE TABLE reputation_events (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta      int NOT NULL,
  reason     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE blocks (
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blocked_user_id)
);

-- App Store 1.2: users must be able to report objectionable content.
CREATE TABLE reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id),
  post_id     uuid REFERENCES posts(id) ON DELETE CASCADE,
  comment_id  uuid REFERENCES comments(id) ON DELETE CASCADE,
  reason      text NOT NULL CHECK (reason IN ('spam','abuse','illegal','other')),
  note        text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'open',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (post_id IS NOT NULL OR comment_id IS NOT NULL)
);

-- Phase-2 tables (spec §9) created now so the schema matches the spec.
CREATE TABLE favorites (user_id uuid REFERENCES users(id) ON DELETE CASCADE, post_id uuid REFERENCES posts(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, post_id));
CREATE TABLE follows (follower_id uuid REFERENCES users(id) ON DELETE CASCADE, followee_id uuid REFERENCES users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (follower_id, followee_id));
CREATE TABLE views (user_id uuid REFERENCES users(id) ON DELETE CASCADE, post_id uuid REFERENCES posts(id) ON DELETE CASCADE, ts timestamptz NOT NULL DEFAULT now());
CREATE TABLE drafts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, payload_json jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE share_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  raw_text text NOT NULL, source text, matched_post_id uuid REFERENCES posts(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('matched','unmatched','inquired')), created_at timestamptz NOT NULL DEFAULT now()
);
