CREATE TABLE IF NOT EXISTS clervo_x402_operations (
  environment_namespace text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  operation_id text NOT NULL,
  state text NOT NULL,
  quote_json jsonb NOT NULL,
  challenge_json jsonb NOT NULL,
  payment_fingerprint text,
  execution_json jsonb,
  settlement_json jsonb,
  response_json jsonb,
  lease_id text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz,
  PRIMARY KEY (environment_namespace, idempotency_key),
  UNIQUE (environment_namespace, operation_id),
  UNIQUE (environment_namespace, payment_fingerprint),
  CONSTRAINT clervo_x402_namespace_check CHECK (environment_namespace ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  CONSTRAINT clervo_x402_key_check CHECK (idempotency_key ~ '^[!-~]{8,128}$'),
  CONSTRAINT clervo_x402_request_hash_check CHECK (request_hash ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT clervo_x402_operation_id_check CHECK (operation_id ~ '^op_[a-f0-9]{32}$'),
  CONSTRAINT clervo_x402_payment_fingerprint_check CHECK (
    payment_fingerprint IS NULL OR payment_fingerprint ~ '^sha256:[a-f0-9]{64}$'
  ),
  CONSTRAINT clervo_x402_lease_id_check CHECK (lease_id IS NULL OR lease_id ~ '^lease_[a-f0-9]{32}$'),
  CONSTRAINT clervo_x402_state_check CHECK (state IN (
    'challenged', 'executing', 'executed', 'settling',
    'execution_unknown', 'settlement_unknown', 'completed'
  )),
  CONSTRAINT clervo_x402_public_terms_check CHECK (
    jsonb_typeof(quote_json) = 'object'
    AND jsonb_typeof(challenge_json) = 'object'
    AND NOT (challenge_json ?| ARRAY['payload', 'signature', 'authorization', 'privateKey', 'secret', 'credential'])
  ),
  CONSTRAINT clervo_x402_state_shape_check CHECK (
    (state = 'challenged' AND payment_fingerprint IS NULL AND execution_json IS NULL AND settlement_json IS NULL AND response_json IS NULL AND lease_id IS NULL AND lease_expires_at IS NULL AND completed_at IS NULL)
    OR (state IN ('executing', 'settling') AND payment_fingerprint IS NOT NULL AND lease_id IS NOT NULL AND lease_expires_at IS NOT NULL AND response_json IS NULL AND completed_at IS NULL)
    OR (state = 'executed' AND payment_fingerprint IS NOT NULL AND execution_json IS NOT NULL AND settlement_json IS NULL AND response_json IS NULL AND lease_id IS NULL AND lease_expires_at IS NULL AND completed_at IS NULL)
    OR (state = 'execution_unknown' AND payment_fingerprint IS NOT NULL AND response_json IS NULL AND lease_id IS NULL AND lease_expires_at IS NULL AND completed_at IS NULL)
    OR (state = 'settlement_unknown' AND payment_fingerprint IS NOT NULL AND execution_json IS NOT NULL AND settlement_json IS NOT NULL AND response_json IS NULL AND lease_id IS NULL AND lease_expires_at IS NULL AND completed_at IS NULL)
    OR (state = 'completed' AND payment_fingerprint IS NOT NULL AND execution_json IS NOT NULL AND settlement_json IS NOT NULL AND response_json IS NOT NULL AND lease_id IS NULL AND lease_expires_at IS NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS clervo_x402_state_time_idx
  ON clervo_x402_operations (environment_namespace, state, updated_at);
