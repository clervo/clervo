#!/usr/bin/env node

import {
  SEARCH_STATE_RETENTION,
  createPostgresSearchStateStoreFromEnvironment,
} from '../../apps/api/src/search-state-store.mjs';

const [mode] = process.argv.slice(2);
if (!['--plan', '--apply'].includes(mode)) throw new Error('usage: search-state-retention.mjs --plan|--apply');
if (mode === '--apply') {
  const namespace = process.env.CLERVO_STATE_NAMESPACE;
  const required = `delete-expired:${namespace}`;
  if (!namespace || process.env.CLERVO_RETENTION_CONFIRM !== required) throw new Error('exact retention confirmation required');
}

const store = await createPostgresSearchStateStoreFromEnvironment();
try {
  const now = new Date().toISOString();
  const counts = mode === '--plan'
    ? await store.retentionPlan(now)
    : await apply(store, now);
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 'clervo.search-state-retention-result.v1',
    mode: mode === '--plan' ? 'plan' : 'applied',
    environmentNamespace: store.environmentNamespace,
    evaluatedAt: now,
    retentionSeconds: SEARCH_STATE_RETENTION,
    counts,
  })}\n`);
} finally {
  await store.close();
}

async function apply(store, now) {
  return store.applyRetention(now);
}
