-- §4.6 replies: a reply is a comment with a parent and no tier (only rating comments carry a tier).
ALTER TABLE comments ALTER COLUMN tier_snapshot DROP NOT NULL;
ALTER TABLE comments ADD COLUMN parent_id uuid REFERENCES comments(id) ON DELETE CASCADE;
ALTER TABLE comments ADD CONSTRAINT comments_reply_shape CHECK ((parent_id IS NULL) = (tier_snapshot IS NOT NULL));
CREATE INDEX comments_parent_idx ON comments (parent_id, created_at) WHERE parent_id IS NOT NULL;

-- In-app notification center (and the source of push messages).
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,       -- recipient
  type       text NOT NULL CHECK (type IN ('reply','like','follow','badge','season')),
  actor_id   uuid REFERENCES users(id) ON DELETE CASCADE,
  post_id    uuid REFERENCES posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  data       jsonb NOT NULL DEFAULT '{}',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
-- Toggling a like or a follow must not spam the recipient.
CREATE UNIQUE INDEX notifications_like_once ON notifications (actor_id, comment_id) WHERE type = 'like';
CREATE UNIQUE INDEX notifications_follow_once ON notifications (actor_id, user_id) WHERE type = 'follow';

CREATE TABLE push_tokens (
  token      text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   text NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_tokens_user_idx ON push_tokens (user_id);

-- Per-user notification preferences (settings → push). social = replies/likes/follows, rank = badges/charts.
ALTER TABLE users ADD COLUMN notify_social boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN notify_rank boolean NOT NULL DEFAULT true;

-- §6 monthly season settlement: the final Top 20 of each "best" board, frozen when the month ends.
CREATE TABLE season_settlements (
  season     text PRIMARY KEY,
  settled_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE season_awards (
  season    text NOT NULL REFERENCES season_settlements(season) ON DELETE CASCADE,
  category  text NOT NULL,
  rank      int  NOT NULL CHECK (rank BETWEEN 1 AND 20),
  post_id   uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  avg       numeric(3,1) NOT NULL,
  total     int NOT NULL,
  PRIMARY KEY (season, category, rank)
);
CREATE INDEX season_awards_author_idx ON season_awards (author_id);
