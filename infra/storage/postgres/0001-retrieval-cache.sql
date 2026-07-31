CREATE TABLE IF NOT EXISTS clervo_retrieval_cache (
  environment_namespace text NOT NULL,
  cache_key text NOT NULL,
  record_json jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (environment_namespace, cache_key),
  CONSTRAINT clervo_retrieval_cache_namespace_check CHECK (environment_namespace ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  CONSTRAINT clervo_retrieval_cache_key_check CHECK (cache_key ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT clervo_retrieval_cache_record_object_check CHECK (jsonb_typeof(record_json) = 'object'),
  CONSTRAINT clervo_retrieval_cache_record_key_check CHECK (record_json ->> 'cacheKey' = cache_key),
  CONSTRAINT clervo_retrieval_cache_record_namespace_check CHECK (record_json ->> 'environmentNamespace' = environment_namespace),
  CONSTRAINT clervo_retrieval_cache_no_customer_fields_check CHECK (NOT (record_json ?| ARRAY['customerId', 'wallet', 'secret', 'cookies', 'browserState']))
);

CREATE INDEX IF NOT EXISTS clervo_retrieval_cache_expiry_idx
  ON clervo_retrieval_cache (environment_namespace, expires_at);
