-- Fun layer (2026-11): daily question + streaks, rating milestones, translation cache.

-- One featured post per UTC day.
CREATE TABLE daily_picks (
  day     date PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE
);

-- A user answered (rated) the day's pick on that day — streaks are consecutive days here.
CREATE TABLE daily_answers (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     date NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- Rating-count milestones already announced to the author (5, 10, 25…), so each fires once.
CREATE TABLE post_milestones (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  n       int NOT NULL,
  PRIMARY KEY (post_id, n)
);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('reply','like','follow','badge','season','milestone'));

-- Machine translations, keyed by a hash of (source text, target language).
CREATE TABLE translations (
  key        text PRIMARY KEY,
  target     text NOT NULL,
  text       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Comment lists default to most-liked.
CREATE INDEX IF NOT EXISTS comments_post_likes_idx ON comments (post_id, like_count DESC, created_at DESC) WHERE parent_id IS NULL;
