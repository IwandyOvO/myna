-- Settings → Send feedback.
CREATE TABLE feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  app_version text,
  platform    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
