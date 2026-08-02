CREATE TABLE IF NOT EXISTS clervo_receiver_accounting_entries (
  environment_namespace text NOT NULL,
  entry_id text NOT NULL,
  settlement_id text NOT NULL,
  operation_id text NOT NULL,
  authorization_id text NOT NULL,
  receipt_hash text NOT NULL,
  settlement_reference_hash text NOT NULL,
  input_hash text NOT NULL,
  entry_hash text NOT NULL,
  previous_entry_hash text,
  entry_json jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (environment_namespace, entry_id),
  UNIQUE (environment_namespace, settlement_id),
  UNIQUE (environment_namespace, operation_id),
  UNIQUE (environment_namespace, receipt_hash),
  CONSTRAINT clervo_receiver_accounting_namespace_check CHECK (environment_namespace ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  CONSTRAINT clervo_receiver_accounting_entry_id_check CHECK (entry_id ~ '^acct_[a-f0-9]{40}$'),
  CONSTRAINT clervo_receiver_accounting_receipt_hash_check CHECK (receipt_hash ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT clervo_receiver_accounting_settlement_reference_check CHECK (settlement_reference_hash ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT clervo_receiver_accounting_input_hash_check CHECK (input_hash ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT clervo_receiver_accounting_entry_hash_check CHECK (entry_hash ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT clervo_receiver_accounting_previous_hash_check CHECK (previous_entry_hash IS NULL OR previous_entry_hash ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT clervo_receiver_accounting_json_check CHECK (
    jsonb_typeof(entry_json) = 'object'
    AND entry_json ->> 'schemaVersion' = 'clervo.receiver-accounting.v1'
    AND entry_json ->> 'entryId' = entry_id
    AND entry_json ->> 'settlementId' = settlement_id
    AND entry_json ->> 'operationId' = operation_id
    AND entry_json ->> 'authorizationId' = authorization_id
    AND entry_json ->> 'receiptHash' = receipt_hash
    AND entry_json ->> 'settlementReferenceHash' = settlement_reference_hash
    AND entry_json ->> 'inputHash' = input_hash
    AND entry_json ->> 'entryHash' = entry_hash
    AND jsonb_array_length(entry_json -> 'postings') = 4
  ),
  CONSTRAINT clervo_receiver_accounting_no_sensitive_fields_check CHECK (
    NOT (entry_json ?| ARRAY['wallet', 'walletAddress', 'privateKey', 'secret', 'credential', 'authorization'])
  )
);

CREATE INDEX IF NOT EXISTS clervo_receiver_accounting_time_idx
  ON clervo_receiver_accounting_entries (environment_namespace, occurred_at, entry_id);
