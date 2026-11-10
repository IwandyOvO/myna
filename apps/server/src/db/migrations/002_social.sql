-- Phase 2 (§5.6 quick access): one history row per (user, post), newest view wins.
DELETE FROM views a USING views b
  WHERE a.user_id = b.user_id AND a.post_id = b.post_id AND a.ts < b.ts;
DELETE FROM views WHERE user_id IS NULL OR post_id IS NULL;
ALTER TABLE views ALTER COLUMN user_id SET NOT NULL, ALTER COLUMN post_id SET NOT NULL;
ALTER TABLE views ADD PRIMARY KEY (user_id, post_id);
CREATE INDEX views_user_ts_idx ON views (user_id, ts DESC);

CREATE INDEX favorites_user_idx ON favorites (user_id, created_at DESC);
CREATE INDEX follows_followee_idx ON follows (followee_id);
CREATE INDEX drafts_user_idx ON drafts (user_id, updated_at DESC);
CREATE INDEX comment_likes_comment_idx ON comment_likes (comment_id);
