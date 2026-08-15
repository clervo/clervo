import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';
import { normalizeProductionDatabaseUrl } from '../../scripts/production/postgres-connection-url.mjs';

const execute = promisify(execFile);

test('production migration runner is ordered, checksum-bound, secret-safe, and fail-closed', async () => {
  const { stdout } = await execute(process.execPath, ['scripts/production/apply-postgres-migrations.mjs', 'plan']);
  const plan = JSON.parse(stdout);
  assert.equal(plan.action, 'plan');
  assert.equal(plan.target, 'clervo-production-postgres');
  assert.deepEqual(plan.migrations.map(({ name }) => name), [
    '0001-retrieval-cache.sql',
    '0002-live-intelligence-monitoring.sql',
    '0003-search-http-state.sql',
    '0004-receiver-accounting.sql',
    '0005-x402-operation-state.sql',
    '0006-sandbox-operation-state.sql',
    '0007-prediction-market-state.sql',
    '0008-ai-free-tier-quota.sql',
    '0008-prediction-dynamic-venues.sql',
    '0009-commercial-measurement.sql',
  ]);
  assert.ok(plan.migrations.every(({ checksum }) => /^sha256:[a-f0-9]{64}$/u.test(checksum)));
  assert.equal(plan.credentialInput, 'environment_or_stdin');
  await assert.rejects(
    execute(process.execPath, ['scripts/production/apply-postgres-migrations.mjs', 'apply'], {
      env: { PATH: process.env.PATH },
    }),
    /CLERVO_ENV must be production/u,
  );
  const sensitiveMarker = 'must-not-appear-in-errors';
  const invalid = spawnSync(process.execPath, ['scripts/production/apply-postgres-migrations.mjs', 'apply', '--database-url-stdin'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    input: `not-a-url-${sensitiveMarker}`,
    env: {
      PATH: process.env.PATH,
      CLERVO_ENV: 'production',
      CLERVO_DATABASE_MIGRATION_CONFIRM: 'apply:clervo-production-postgres',
      CLERVO_DATABASE_MIGRATION_TARGET: '0008-prediction-dynamic-venues.sql',
      CLERVO_MIGRATION_PROXY_HOST: '127.0.0.1',
    },
  });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /database URL is invalid/u);
  assert.equal(invalid.stderr.includes(sensitiveMarker), false);
  const source = await readFile('scripts/production/apply-postgres-migrations.mjs', 'utf8');
  assert.match(source, /pg_advisory_xact_lock/u);
  assert.match(source, /migration checksum changed/u);
  assert.match(source, /--database-url-stdin/u);
  assert.doesNotMatch(source, /console\.log\([^)]*(?:DATABASE_URL|password)/u);
});

test('production migration URL normalizes only the exact managed Cloud SQL socket', () => {
  const connection = 'bloxsniper-prod:us-central1:clervo-production-postgres';
  const scheme = 'postgresql';
  const normalized = normalizeProductionDatabaseUrl(
    `${scheme}://clervo:fixture-only@/clervo?host=/cloudsql/${connection}`,
    { CLERVO_CLOUD_SQL_CONNECTION: connection },
  );
  const parsed = new URL(normalized);
  assert.equal(parsed.hostname, 'localhost');
  assert.equal(parsed.pathname, '/clervo');
  assert.equal(parsed.searchParams.get('host'), `/cloudsql/${connection}`);
  assert.throws(() => normalizeProductionDatabaseUrl(
    `${scheme}://clervo:fixture-only@/clervo?host=/cloudsql/other:region:database`,
    { CLERVO_CLOUD_SQL_CONNECTION: connection },
  ), /database URL is invalid/u);
});
