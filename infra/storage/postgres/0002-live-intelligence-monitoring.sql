CREATE TABLE IF NOT EXISTS clervo_live_intelligence_monitor_definitions (
  environment_namespace text NOT NULL,
  monitor_id text NOT NULL,
  revision integer NOT NULL,
  definition_hash text NOT NULL,
  definition_json jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (environment_namespace, monitor_id, revision),
  UNIQUE (environment_namespace, monitor_id, definition_hash),
  CONSTRAINT clervo_monitor_definition_namespace_check CHECK (environment_namespace ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  CONSTRAINT clervo_monitor_definition_id_check CHECK (monitor_id ~ '^mon_[A-Za-z0-9]{20,64}$'),
  CONSTRAINT clervo_monitor_definition_revision_check CHECK (revision >= 1),
  CONSTRAINT clervo_monitor_definition_hash_check CHECK (definition_hash ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT clervo_monitor_definition_json_check CHECK (
    jsonb_typeof(definition_json) = 'object'
    AND definition_json ->> 'monitorId' = monitor_id
    AND (definition_json ->> 'revision')::integer = revision
    AND definition_json ->> 'definitionHash' = definition_hash
  )
);

CREATE TABLE IF NOT EXISTS clervo_live_intelligence_monitor_states (
  environment_namespace text NOT NULL,
  monitor_id text NOT NULL,
  definition_revision integer NOT NULL,
  state_revision bigint NOT NULL,
  state_hash text NOT NULL,
  state_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (environment_namespace, monitor_id),
  UNIQUE (environment_namespace, monitor_id, state_hash),
  FOREIGN KEY (environment_namespace, monitor_id, definition_revision)
    REFERENCES clervo_live_intelligence_monitor_definitions (environment_namespace, monitor_id, revision),
  CONSTRAINT clervo_monitor_state_revision_check CHECK (state_revision >= 1),
  CONSTRAINT clervo_monitor_state_hash_check CHECK (state_hash ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT clervo_monitor_state_json_check CHECK (
    jsonb_typeof(state_json) = 'object'
    AND state_json ->> 'monitorId' = monitor_id
    AND (state_json ->> 'definitionRevision')::integer = definition_revision
    AND (state_json ->> 'stateRevision')::bigint = state_revision
    AND state_json ->> 'stateHash' = state_hash
  )
);

CREATE TABLE IF NOT EXISTS clervo_live_intelligence_monitor_snapshots (
  environment_namespace text NOT NULL,
  monitor_id text NOT NULL,
  definition_revision integer NOT NULL,
  snapshot_id text NOT NULL,
  sequence bigint NOT NULL,
  snapshot_hash text NOT NULL,
  previous_snapshot_id text,
  previous_snapshot_hash text,
  search_generated_at timestamptz NOT NULL,
  snapshot_json jsonb NOT NULL,
  PRIMARY KEY (environment_namespace, snapshot_id),
  UNIQUE (environment_namespace, monitor_id, sequence),
  UNIQUE (environment_namespace, monitor_id, snapshot_hash),
  FOREIGN KEY (environment_namespace, monitor_id, definition_revision)
    REFERENCES clervo_live_intelligence_monitor_definitions (environment_namespace, monitor_id, revision),
  CONSTRAINT clervo_monitor_snapshot_sequence_check CHECK (sequence >= 1),
  CONSTRAINT clervo_monitor_snapshot_id_check CHECK (snapshot_id ~ '^snap_[A-Za-z0-9]{32}$'),
  CONSTRAINT clervo_monitor_snapshot_hash_check CHECK (snapshot_hash ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT clervo_monitor_snapshot_parent_pair_check CHECK ((previous_snapshot_id IS NULL) = (previous_snapshot_hash IS NULL)),
  CONSTRAINT clervo_monitor_snapshot_first_parent_check CHECK ((sequence = 1) = (previous_snapshot_id IS NULL)),
  CONSTRAINT clervo_monitor_snapshot_json_check CHECK (
    jsonb_typeof(snapshot_json) = 'object'
    AND snapshot_json ->> 'monitorId' = monitor_id
    AND snapshot_json ->> 'snapshotId' = snapshot_id
    AND (snapshot_json ->> 'sequence')::bigint = sequence
    AND snapshot_json ->> 'snapshotHash' = snapshot_hash
  )
);

CREATE INDEX IF NOT EXISTS clervo_monitor_snapshot_lineage_idx
  ON clervo_live_intelligence_monitor_snapshots (environment_namespace, monitor_id, sequence DESC);

CREATE TABLE IF NOT EXISTS clervo_live_intelligence_monitor_comparisons (
  environment_namespace text NOT NULL,
  monitor_id text NOT NULL,
  comparison_id text NOT NULL,
  baseline_snapshot_id text NOT NULL,
  current_snapshot_id text NOT NULL,
  report_hash text NOT NULL,
  comparison_json jsonb NOT NULL,
  PRIMARY KEY (environment_namespace, comparison_id),
  UNIQUE (environment_namespace, monitor_id, current_snapshot_id),
  FOREIGN KEY (environment_namespace, baseline_snapshot_id)
    REFERENCES clervo_live_intelligence_monitor_snapshots (environment_namespace, snapshot_id) ON DELETE CASCADE,
  FOREIGN KEY (environment_namespace, current_snapshot_id)
    REFERENCES clervo_live_intelligence_monitor_snapshots (environment_namespace, snapshot_id) ON DELETE CASCADE,
  CONSTRAINT clervo_monitor_comparison_hash_check CHECK (report_hash ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT clervo_monitor_comparison_json_check CHECK (
    jsonb_typeof(comparison_json) = 'object'
    AND comparison_json ->> 'comparisonId' = comparison_id
    AND comparison_json ->> 'reportHash' = report_hash
  )
);

CREATE TABLE IF NOT EXISTS clervo_live_intelligence_change_alerts (
  environment_namespace text NOT NULL,
  monitor_id text NOT NULL,
  alert_id text NOT NULL,
  alert_hash text NOT NULL,
  comparison_id text NOT NULL,
  current_snapshot_id text NOT NULL,
  alert_json jsonb NOT NULL,
  PRIMARY KEY (environment_namespace, alert_id),
  UNIQUE (environment_namespace, monitor_id, alert_hash),
  FOREIGN KEY (environment_namespace, comparison_id)
    REFERENCES clervo_live_intelligence_monitor_comparisons (environment_namespace, comparison_id) ON DELETE CASCADE,
  FOREIGN KEY (environment_namespace, current_snapshot_id)
    REFERENCES clervo_live_intelligence_monitor_snapshots (environment_namespace, snapshot_id) ON DELETE CASCADE,
  CONSTRAINT clervo_change_alert_hash_check CHECK (alert_hash ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT clervo_change_alert_not_delivered_check CHECK (alert_json ->> 'deliveryState' = 'not_delivered'),
  CONSTRAINT clervo_change_alert_json_check CHECK (
    jsonb_typeof(alert_json) = 'object'
    AND alert_json ->> 'monitorId' = monitor_id
    AND alert_json ->> 'alertId' = alert_id
    AND alert_json ->> 'alertHash' = alert_hash
  )
);
