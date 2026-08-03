#!/usr/bin/env node

import assert from 'node:assert/strict';
import { Pool } from 'pg';

const action = process.argv[2] ?? 'plan';
const urlFromStdin = process.argv.includes('--database-url-stdin');

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

function recoveryConnection(raw) {
  assert.ok(raw, 'database URL is required');
  const host = process.env.CLERVO_RECOVERY_PROXY_HOST;
  const port = process.env.CLERVO_RECOVERY_PROXY_PORT;
  assert.ok(['127.0.0.1', '::1', 'localhost'].includes(host), 'recovery proxy must be loopback');
  assert.match(port ?? '', /^[1-9][0-9]{1,4}$/u, 'invalid recovery proxy port');
  const socketForm = /^(postgresql:\/\/[^@]+)@\/([^?]+)(?:\?.*)?$/u.exec(raw);
  let parsed;
  try {
    parsed = new URL(socketForm ? `${socketForm[1]}@localhost/${socketForm[2]}` : raw);
  } catch {
    throw new Error('database URL is invalid');
  }
  assert.equal(parsed.protocol, 'postgresql:', 'database URL must use postgresql');
  assert.equal(decodeURIComponent(parsed.pathname), '/clervo', 'database name must be clervo');
  parsed.hostname = host;
  parsed.port = port;
  parsed.search = '';
  return parsed.toString();
}

if (action === 'plan') {
  process.stdout.write(`${JSON.stringify({
    action: 'plan',
    targetPattern: 'clervo-stage14-recovery-YYYYMMDD',
    credentialInput: 'stdin',
    mutation: false,
    customerPayloadsRead: false,
  }, null, 2)}\n`);
} else if (action === 'verify') {
  const target = process.env.CLERVO_RECOVERY_TARGET ?? '';
  const idempotencyKey = process.env.CLERVO_RECOVERY_IDEMPOTENCY_KEY ?? '';
  assert.match(target, /^clervo-stage14-recovery-[0-9]{8}$/u, 'invalid recovery target');
  assert.match(idempotencyKey, /^[!-~]{8,128}$/u, 'invalid recovery idempotency key');
  assert.equal(urlFromStdin, true, 'recovery verification requires database URL on stdin');
  const pool = new Pool({
    connectionString: recoveryConnection(await readStdin()),
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  try {
    const identity = await pool.query('SELECT current_database() AS database, current_user AS username');
    assert.deepEqual(identity.rows[0], { database: 'clervo', username: 'clervo' });
    const migrations = await pool.query('SELECT migration_name FROM clervo_schema_migrations ORDER BY migration_name');
    assert.deepEqual(migrations.rows.map(({ migration_name: name }) => name), [
      '0001-retrieval-cache.sql',
      '0002-live-intelligence-monitoring.sql',
      '0003-search-http-state.sql',
      '0004-receiver-accounting.sql',
      '0005-x402-operation-state.sql',
      '0006-sandbox-operation-state.sql',
    ]);
    const operation = await pool.query(
      `SELECT state, response_json->>'state' AS response_state
         FROM clervo_search_http_operations
        WHERE environment_namespace = 'production' AND idempotency_key = $1`,
      [idempotencyKey],
    );
    assert.equal(operation.rowCount, 1, 'recovery smoke operation missing');
    assert.deepEqual(operation.rows[0], { state: 'completed', response_state: 'RECEIPTED' });
    const requiredTables = await pool.query(`SELECT COUNT(*)::integer AS count
      FROM pg_catalog.pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname IN ('clervo_search_http_operations', 'clervo_receiver_accounting_entries', 'clervo_x402_operations', 'clervo_sandbox_operations')`);
    assert.equal(requiredTables.rows[0]?.count, 4, 'recovery tables missing');
    process.stdout.write(`${JSON.stringify({
      action: 'recovery-verified',
      target,
      migrationCount: migrations.rowCount,
      completedSmokeOperationRestored: true,
      requiredTablesRestored: true,
      customerPayloadsPrinted: false,
      mutation: false,
    }, null, 2)}\n`);
  } finally {
    await pool.end();
  }
} else {
  throw new Error('usage: verify-managed-recovery.mjs [plan|verify] [--database-url-stdin]');
}
