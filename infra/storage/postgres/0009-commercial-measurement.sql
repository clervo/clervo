CREATE TABLE IF NOT EXISTS clervo_commercial_events (
  environment_namespace text NOT NULL,
  event_id text NOT NULL,
  event_name text NOT NULL,
  occurred_at timestamptz NOT NULL,
  visitor_ref text,
  source text,
  channel text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  operation_id text,
  product_id text,
  model_id text,
  outcome text,
  traffic_class text NOT NULL DEFAULT 'unknown',
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (environment_namespace, event_id),
  CONSTRAINT clervo_commercial_events_namespace_check CHECK (environment_namespace ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  CONSTRAINT clervo_commercial_events_id_check CHECK (event_id ~ '^evt_[a-f0-9]{32}$'),
  CONSTRAINT clervo_commercial_events_name_check CHECK (event_name IN ('site_visit', 'activation_surface', 'setup_start', 'catalog_view', 'free_result', 'payment_failure')),
  CONSTRAINT clervo_commercial_events_traffic_check CHECK (traffic_class IN ('external', 'internal', 'unknown')),
  CONSTRAINT clervo_commercial_events_metadata_check CHECK (jsonb_typeof(metadata_json) IN ('object', 'null') AND NOT (metadata_json ?| ARRAY['prompt', 'payload', 'response', 'body', 'secret', 'privateKey', 'authorization', 'credential', 'paymentSignature', 'cookie']))
);

CREATE INDEX IF NOT EXISTS clervo_commercial_events_time_idx
  ON clervo_commercial_events (environment_namespace, occurred_at, event_name);

ALTER TABLE clervo_x402_operations ADD COLUMN IF NOT EXISTS customer_ref text;
ALTER TABLE clervo_x402_operations ADD COLUMN IF NOT EXISTS traffic_class text NOT NULL DEFAULT 'unknown';
ALTER TABLE clervo_x402_operations DROP CONSTRAINT IF EXISTS clervo_x402_customer_ref_check;
ALTER TABLE clervo_x402_operations ADD CONSTRAINT clervo_x402_customer_ref_check CHECK (customer_ref IS NULL OR customer_ref ~ '^sha256:[a-f0-9]{64}$');
ALTER TABLE clervo_x402_operations DROP CONSTRAINT IF EXISTS clervo_x402_traffic_class_check;
ALTER TABLE clervo_x402_operations ADD CONSTRAINT clervo_x402_traffic_class_check CHECK (traffic_class IN ('external', 'internal', 'unknown'));

CREATE INDEX IF NOT EXISTS clervo_x402_customer_ref_idx
  ON clervo_x402_operations (environment_namespace, customer_ref, completed_at);
