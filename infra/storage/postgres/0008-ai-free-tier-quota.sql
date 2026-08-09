CREATE TABLE IF NOT EXISTS clervo_ai_free_tier_quota (
  environment_namespace text NOT NULL,
  quota_day date NOT NULL,
  subject_hash text NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (environment_namespace, quota_day, subject_hash),
  CHECK (environment_namespace ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  CHECK (subject_hash = '__global__' OR subject_hash ~ '^sha256:[a-f0-9]{64}$')
);

CREATE INDEX IF NOT EXISTS clervo_ai_free_tier_quota_updated_at_idx
  ON clervo_ai_free_tier_quota (environment_namespace, updated_at);
