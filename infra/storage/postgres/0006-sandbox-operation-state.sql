CREATE TABLE IF NOT EXISTS clervo_sandbox_operations (
  environment_namespace text NOT NULL,
  operation_id text NOT NULL,
  tenant_hash text NOT NULL,
  request_hash text NOT NULL,
  state text NOT NULL,
  lease_id text,
  lease_expires_at timestamptz,
  response_json jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz,
  PRIMARY KEY (environment_namespace, operation_id),
  CONSTRAINT clervo_sandbox_namespace_check CHECK (environment_namespace ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  CONSTRAINT clervo_sandbox_operation_id_check CHECK (operation_id ~ '^op_[A-Za-z0-9]{20,64}$'),
  CONSTRAINT clervo_sandbox_tenant_hash_check CHECK (tenant_hash ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT clervo_sandbox_request_hash_check CHECK (request_hash ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT clervo_sandbox_lease_id_check CHECK (lease_id IS NULL OR lease_id ~ '^lease_[a-f0-9]{32}$'),
  CONSTRAINT clervo_sandbox_state_check CHECK (state IN ('executing', 'execution_unknown', 'completed')),
  CONSTRAINT clervo_sandbox_state_shape_check CHECK (
    (
      state = 'executing'
      AND lease_id IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND response_json IS NULL
      AND completed_at IS NULL
    )
    OR
    (
      state = 'execution_unknown'
      AND lease_id IS NULL
      AND lease_expires_at IS NULL
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

CREATE INDEX IF NOT EXISTS clervo_sandbox_state_time_idx
  ON clervo_sandbox_operations (environment_namespace, state, updated_at);
