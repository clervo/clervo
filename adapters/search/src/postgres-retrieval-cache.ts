import type { DurableRetrievalCacheStore, RetrievalCacheRecord } from '../../../services/search/src/retrieval-cache.js';

export interface RetrievalCacheSqlClient {
  query<T extends Record<string, unknown>>(sql: string, parameters: readonly unknown[]): Promise<Readonly<{ rows: readonly T[] }>>;
}

export class PostgresDurableRetrievalCacheStore implements DurableRetrievalCacheStore {
  constructor(private readonly client: RetrievalCacheSqlClient, readonly environmentNamespace: string) {
    if (!/^[a-z0-9][a-z0-9_-]{2,31}$/u.test(environmentNamespace)) throw new Error('invalid_postgres_retrieval_cache_namespace');
  }

  async get(cacheKey: string): Promise<RetrievalCacheRecord | undefined> {
    const result = await this.client.query<{ record_json: RetrievalCacheRecord }>(
      'SELECT record_json FROM clervo_retrieval_cache WHERE environment_namespace = $1 AND cache_key = $2',
      [this.environmentNamespace, cacheKey],
    );
    return result.rows[0]?.record_json;
  }

  async put(record: Readonly<RetrievalCacheRecord>): Promise<void> {
    if (record.environmentNamespace !== this.environmentNamespace) throw new Error('postgres_retrieval_cache_namespace_substitution');
    await this.client.query(
      'INSERT INTO clervo_retrieval_cache (environment_namespace, cache_key, record_json, expires_at) VALUES ($1, $2, $3::jsonb, $4::timestamptz) ON CONFLICT (environment_namespace, cache_key) DO UPDATE SET record_json = EXCLUDED.record_json, expires_at = EXCLUDED.expires_at, updated_at = clock_timestamp()',
      [this.environmentNamespace, record.cacheKey, JSON.stringify(record), record.expiresAt],
    );
  }

  async delete(cacheKey: string): Promise<void> {
    await this.client.query('DELETE FROM clervo_retrieval_cache WHERE environment_namespace = $1 AND cache_key = $2', [this.environmentNamespace, cacheKey]);
  }

  async keys(): Promise<readonly string[]> {
    const result = await this.client.query<{ cache_key: string }>(
      'SELECT cache_key FROM clervo_retrieval_cache WHERE environment_namespace = $1 ORDER BY cache_key',
      [this.environmentNamespace],
    );
    return Object.freeze(result.rows.map((row) => row.cache_key));
  }
}
