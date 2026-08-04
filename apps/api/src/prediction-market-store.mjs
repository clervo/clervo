import { createHash } from 'node:crypto';

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function identity(snapshot) {
  if (!snapshot || !/^pmkt_[a-f0-9]{32}$/u.test(snapshot.marketRef ?? '') || !['polymarket', 'kalshi'].includes(snapshot.venueId)
    || typeof snapshot.venueMarketId !== 'string' || !Number.isFinite(Date.parse(snapshot.observedAt)) || new Date(Date.parse(snapshot.observedAt)).toISOString() !== snapshot.observedAt) throw new TypeError('prediction_market_store_snapshot_invalid');
}

export class PostgresPredictionMarketStore {
  durable = true;
  kind = 'postgres';
  constructor(client, { maximumSnapshotsPerMarket = 10_000 } = {}) {
    if (!client || typeof client.query !== 'function' || !Number.isSafeInteger(maximumSnapshotsPerMarket) || maximumSnapshotsPerMarket < 2 || maximumSnapshotsPerMarket > 100_000) throw new TypeError('prediction_market_store_config_invalid');
    this.client = client;
    this.maximumSnapshotsPerMarket = maximumSnapshotsPerMarket;
  }
  async ready() {
    const result = await this.client.query("SELECT to_regclass('public.clervo_prediction_markets') AS markets, to_regclass('public.clervo_prediction_history') AS history", []);
    return result.rows[0]?.markets === 'clervo_prediction_markets' && result.rows[0]?.history === 'clervo_prediction_history';
  }
  async put(snapshot) {
    identity(snapshot);
    await this.client.query(
      `INSERT INTO clervo_prediction_markets (market_ref, venue_id, venue_market_id, observed_at, snapshot_json)
       VALUES ($1, $2, $3, $4::timestamptz, $5::jsonb)
       ON CONFLICT (market_ref) DO UPDATE SET observed_at = EXCLUDED.observed_at, snapshot_json = EXCLUDED.snapshot_json, updated_at = clock_timestamp()
       WHERE clervo_prediction_markets.venue_id = EXCLUDED.venue_id
         AND clervo_prediction_markets.venue_market_id = EXCLUDED.venue_market_id
         AND clervo_prediction_markets.observed_at <= EXCLUDED.observed_at`,
      [snapshot.marketRef, snapshot.venueId, snapshot.venueMarketId, snapshot.observedAt, JSON.stringify(snapshot)],
    );
  }
  async get(marketRef) {
    if (!/^pmkt_[a-f0-9]{32}$/u.test(marketRef ?? '')) throw new TypeError('prediction_market_ref_invalid');
    const result = await this.client.query('SELECT snapshot_json FROM clervo_prediction_markets WHERE market_ref = $1', [marketRef]);
    return result.rows[0]?.snapshot_json;
  }
  async append(snapshot) {
    identity(snapshot);
    const client = typeof this.client.connect === 'function' ? await this.client.connect() : this.client;
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [snapshot.marketRef]);
      await client.query(
        `INSERT INTO clervo_prediction_markets (market_ref, venue_id, venue_market_id, observed_at, snapshot_json)
         VALUES ($1, $2, $3, $4::timestamptz, $5::jsonb)
         ON CONFLICT (market_ref) DO UPDATE SET observed_at = EXCLUDED.observed_at, snapshot_json = EXCLUDED.snapshot_json, updated_at = clock_timestamp()
         WHERE clervo_prediction_markets.venue_id = EXCLUDED.venue_id AND clervo_prediction_markets.venue_market_id = EXCLUDED.venue_market_id AND clervo_prediction_markets.observed_at <= EXCLUDED.observed_at`,
        [snapshot.marketRef, snapshot.venueId, snapshot.venueMarketId, snapshot.observedAt, JSON.stringify(snapshot)],
      );
      const selected = await client.query('SELECT sequence, observed_at, previous_hash, payload_hash, record_hash, snapshot_json FROM clervo_prediction_history WHERE market_ref = $1 ORDER BY sequence DESC LIMIT 1', [snapshot.marketRef]);
      const last = selected.rows[0];
      const payloadHash = digest(canonical(snapshot));
      if (last && new Date(last.observed_at).toISOString() === snapshot.observedAt) {
        if (last.payload_hash !== payloadHash) throw new Error('prediction_history_observation_conflict');
        await client.query('COMMIT');
        return Object.freeze({ record: Object.freeze({ sequence: last.sequence, marketRef: snapshot.marketRef, venueId: snapshot.venueId, observedAt: snapshot.observedAt, previousHash: last.previous_hash, payloadHash, recordHash: last.record_hash, snapshot: last.snapshot_json }), replayed: true });
      }
      if (last && Date.parse(last.observed_at) >= Date.parse(snapshot.observedAt)) throw new Error('prediction_history_out_of_order');
      const sequence = (last?.sequence ?? 0) + 1;
      if (sequence > this.maximumSnapshotsPerMarket) throw new Error('prediction_history_capacity_reached');
      const previousHash = last?.record_hash ?? null;
      const recordHash = digest(canonical({ sequence, marketRef: snapshot.marketRef, venueId: snapshot.venueId, observedAt: snapshot.observedAt, previousHash, payloadHash }));
      await client.query('INSERT INTO clervo_prediction_history (market_ref, sequence, observed_at, previous_hash, payload_hash, record_hash, snapshot_json) VALUES ($1, $2, $3::timestamptz, $4, $5, $6, $7::jsonb)', [snapshot.marketRef, sequence, snapshot.observedAt, previousHash, payloadHash, recordHash, JSON.stringify(snapshot)]);
      await client.query('COMMIT');
      return Object.freeze({ record: Object.freeze({ sequence, marketRef: snapshot.marketRef, venueId: snapshot.venueId, observedAt: snapshot.observedAt, previousHash, payloadHash, recordHash, snapshot }), replayed: false });
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release?.(); }
  }
  async list(marketRef, afterSequence = 0, limit = 100) {
    if (!/^pmkt_[a-f0-9]{32}$/u.test(marketRef ?? '') || !Number.isSafeInteger(afterSequence) || afterSequence < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError('prediction_history_query_invalid');
    const result = await this.client.query('SELECT sequence, observed_at, previous_hash, payload_hash, record_hash, snapshot_json FROM clervo_prediction_history WHERE market_ref = $1 AND sequence > $2 ORDER BY sequence ASC LIMIT $3', [marketRef, afterSequence, limit]);
    return Object.freeze(result.rows.map((row) => Object.freeze({ sequence: row.sequence, marketRef, venueId: row.snapshot_json.venueId, observedAt: new Date(row.observed_at).toISOString(), previousHash: row.previous_hash, payloadHash: row.payload_hash, recordHash: row.record_hash, snapshot: row.snapshot_json })));
  }
  async close() { await this.client.end?.(); }
}

export async function createPostgresPredictionMarketStoreFromEnvironment(environment = process.env) {
  if (!environment.CLERVO_DATABASE_URL) throw new Error('CLERVO_DATABASE_URL is required');
  const { Pool } = await import('pg');
  const client = new Pool({ connectionString: environment.CLERVO_DATABASE_URL, max: 4, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 10_000, allowExitOnIdle: true, application_name: 'clervo-prediction-api' });
  const store = new PostgresPredictionMarketStore(client);
  if (!await store.ready()) { await store.close(); throw new Error('prediction_market_migration_required'); }
  return store;
}
