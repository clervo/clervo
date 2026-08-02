CREATE TABLE IF NOT EXISTS clervo_search_http_operations (
  environment_namespace text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  operation_id text NOT NULL,
  state text NOT NULL,
  lease_id text,
  lease_expires_at timestamptz,
  response_json jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz,
  PRIMARY KEY (environment_namespace, idempotency_key),
  UNIQUE (environment_namespace, operation_id),
  CONSTRAINT clervo_search_operation_namespace_check CHECK (environment_namespace ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  CONSTRAINT clervo_search_operation_key_check CHECK (idempotency_key ~ '^[!-~]{8,128}$'),
  CONSTRAINT clervo_search_operation_hash_check CHECK (request_hash ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT clervo_search_operation_id_check CHECK (operation_id ~ '^op_[a-f0-9]{32}$'),
  CONSTRAINT clervo_search_operation_state_check CHECK (state IN ('in_progress', 'completed')),
  CONSTRAINT clervo_search_operation_shape_check CHECK (
    (
      state = 'in_progress'
      AND lease_id ~ '^lease_[a-f0-9]{32}$'
      AND lease_expires_at IS NOT NULL
      AND response_json IS NULL
      AND completed_at IS NULL
    )
    OR
    (
      state = 'completed'
      AND lease_id IS NULL
      AND lease_expires_at IS NULL
      AND jsonb_typeof(response_json) = 'object'
      AND completed_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS clervo_search_operation_retention_idx
  ON clervo_search_http_operations (environment_namespace, updated_at);

CREATE TABLE IF NOT EXISTS clervo_search_free_quota (
  environment_namespace text NOT NULL,
  subject_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL,
  last_consumed_token text NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (environment_namespace, subject_hash),
  CONSTRAINT clervo_search_quota_namespace_check CHECK (environment_namespace ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  CONSTRAINT clervo_search_quota_subject_check CHECK (subject_hash ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT clervo_search_quota_count_check CHECK (request_count >= 1),
  CONSTRAINT clervo_search_quota_token_check CHECK (last_consumed_token ~ '^lease_[a-f0-9]{32}$')
);

CREATE INDEX IF NOT EXISTS clervo_search_quota_retention_idx
  ON clervo_search_free_quota (environment_namespace, updated_at);
