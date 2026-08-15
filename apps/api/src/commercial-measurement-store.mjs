import { Pool } from 'pg';
import { assertCommercialEvent } from '../../../dist/packages/contracts/src/index.js';

function namespace(value) {
  if (!/^[a-z0-9][a-z0-9_-]{2,31}$/u.test(value ?? '')) throw new TypeError('invalid_commercial_namespace');
}

export class InMemoryCommercialMeasurementStore {
  kind = 'memory';
  durable = false;
  #events = new Map();

  constructor({ environmentNamespace = 'local' } = {}) {
    namespace(environmentNamespace);
    this.environmentNamespace = environmentNamespace;
  }

  async ready() { return true; }

  async record(input) {
    const event = assertCommercialEvent(input);
    const existing = this.#events.get(event.eventId);
    if (existing) return Object.freeze({ kind: 'replay', event: existing });
    this.#events.set(event.eventId, event);
    return Object.freeze({ kind: 'recorded', event });
  }

  async close() {}
}

export class PostgresCommercialMeasurementStore {
  kind = 'postgres';
  durable = true;

  constructor(client, { environmentNamespace } = {}) {
    if (!client || typeof client.query !== 'function') throw new TypeError('invalid_commercial_sql_client');
    namespace(environmentNamespace);
    this.client = client;
    this.environmentNamespace = environmentNamespace;
  }

  async ready() {
    const result = await this.client.query("SELECT to_regclass('public.clervo_commercial_events') AS events", []);
    return result.rows[0]?.events === 'clervo_commercial_events';
  }

  async record(input) {
    const event = assertCommercialEvent(input);
    const result = await this.client.query(
      `INSERT INTO clervo_commercial_events (
        environment_namespace, event_id, event_name, occurred_at, visitor_ref,
        source, channel, referrer_host, utm_source, utm_medium, utm_campaign,
        operation_id, product_id, model_id, outcome, traffic_class, metadata_json
      ) VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)
      ON CONFLICT (environment_namespace, event_id) DO NOTHING
      RETURNING event_id`,
      [this.environmentNamespace, event.eventId, event.eventName, event.occurredAt, event.visitorRef ?? null, event.source ?? null, event.channel ?? null, event.referrerHost ?? null, event.utmSource ?? null, event.utmMedium ?? null, event.utmCampaign ?? null, event.operationId ?? null, event.productId ?? null, event.modelId ?? null, event.outcome ?? null, event.trafficClass ?? 'unknown', JSON.stringify(event.metadata ?? {})],
    );
    return Object.freeze({ kind: result.rowCount === 1 ? 'recorded' : 'replay', event });
  }

  async close() {}
}

export function createPostgresCommercialMeasurementStoreFromEnvironment() {
  const connectionString = process.env.CLERVO_DATABASE_URL;
  if (!connectionString) throw new Error('CLERVO_DATABASE_URL is required');
  const environmentNamespace = process.env.CLERVO_STATE_NAMESPACE;
  namespace(environmentNamespace);
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 10_000, allowExitOnIdle: true });
  const store = new PostgresCommercialMeasurementStore(pool, { environmentNamespace });
  store.close = () => pool.end();
  return store;
}
