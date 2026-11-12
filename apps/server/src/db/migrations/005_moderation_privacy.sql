-- Own-post editing.
ALTER TABLE posts ADD COLUMN edited_at timestamptz;

-- Location privacy: store coordinates on a ~1 km grid (0.01°) so a post can't pinpoint someone's home.
UPDATE posts SET lat = round(lat::numeric, 2), lng = round(lng::numeric, 2) WHERE lat IS NOT NULL;

-- Moderation: roles, bans, age confirmation (COPPA, 13+).
ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));
ALTER TABLE users ADD COLUMN banned_at timestamptz;
ALTER TABLE users ADD COLUMN age_confirmed_at timestamptz;

-- One report per person per target (repeat reports don't count twice towards auto-hide).
DELETE FROM reports a USING reports b
  WHERE a.reporter_id = b.reporter_id AND a.post_id IS NOT DISTINCT FROM b.post_id
    AND a.comment_id IS NOT DISTINCT FROM b.comment_id AND a.created_at > b.created_at;
CREATE UNIQUE INDEX reports_once_post ON reports (reporter_id, post_id) WHERE comment_id IS NULL;
CREATE UNIQUE INDEX reports_once_comment ON reports (reporter_id, comment_id) WHERE comment_id IS NOT NULL;
ALTER TABLE reports ADD COLUMN resolved_at timestamptz;
ALTER TABLE reports ADD COLUMN resolved_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN resolution text CHECK (resolution IN ('dismissed', 'removed', 'restored'));
CREATE INDEX reports_open_idx ON reports (created_at) WHERE status = 'open';
