CREATE TABLE IF NOT EXISTS clervo_prediction_markets (
  market_ref text PRIMARY KEY,
  venue_id text NOT NULL,
  venue_market_id text NOT NULL,
  observed_at timestamptz NOT NULL,
  snapshot_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT clervo_prediction_market_ref_check CHECK (market_ref ~ '^pmkt_[a-f0-9]{32}$'),
  CONSTRAINT clervo_prediction_venue_check CHECK (venue_id IN ('polymarket', 'kalshi')),
  CONSTRAINT clervo_prediction_venue_identity_unique UNIQUE (venue_id, venue_market_id),
  CONSTRAINT clervo_prediction_snapshot_object_check CHECK (jsonb_typeof(snapshot_json) = 'object')
);

CREATE TABLE IF NOT EXISTS clervo_prediction_history (
  market_ref text NOT NULL REFERENCES clervo_prediction_markets(market_ref) ON DELETE RESTRICT,
  sequence integer NOT NULL,
  observed_at timestamptz NOT NULL,
  previous_hash text,
  payload_hash text NOT NULL,
  record_hash text NOT NULL,
  snapshot_json jsonb NOT NULL,
  PRIMARY KEY (market_ref, sequence),
  CONSTRAINT clervo_prediction_history_sequence_check CHECK (sequence > 0),
  CONSTRAINT clervo_prediction_history_previous_hash_check CHECK (previous_hash IS NULL OR previous_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT clervo_prediction_history_payload_hash_check CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT clervo_prediction_history_record_hash_check CHECK (record_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT clervo_prediction_history_snapshot_object_check CHECK (jsonb_typeof(snapshot_json) = 'object'),
  CONSTRAINT clervo_prediction_history_observation_unique UNIQUE (market_ref, observed_at)
);

CREATE INDEX IF NOT EXISTS clervo_prediction_history_observed_idx
  ON clervo_prediction_history (market_ref, observed_at);
