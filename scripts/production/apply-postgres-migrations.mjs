#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationDirectory = path.join(root, 'infra/storage/postgres');
const action = process.argv[2] ?? 'plan';
const urlFromStdin = process.argv.includes('--database-url-stdin');
const target = 'clervo-production-postgres';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function migrations() {
  const names = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}-[a-z0-9-]+\.sql$/u.test(name))
    .sort();
  assert.ok(names.length > 0, 'production migrations are missing');
  const records = [];
  for (const name of names) {
    const sql = await readFile(path.join(migrationDirectory, name), 'utf8');
    records.push(Object.freeze({ name, checksum: sha256(sql), sql }));
  }
  return records;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

function connectionUrl(raw) {
  assert.ok(raw, 'database URL is required');
  const proxyHost = process.env.CLERVO_MIGRATION_PROXY_HOST;
  const socketForm = proxyHost
    ? /^(postgresql:\/\/[^@]+)@\/([^?]+)(?:\?.*)?$/u.exec(raw)
    : null;
  let parsed;
  try {
    parsed = new URL(socketForm ? `${socketForm[1]}@localhost/${socketForm[2]}` : raw);
  } catch {
    throw new Error('database URL is invalid');
  }
  assert.equal(parsed.protocol, 'postgresql:', 'database URL must use postgresql');
  assert.equal(decodeURIComponent(parsed.pathname), '/clervo', 'database name must be clervo');
  if (proxyHost) {
    assert.ok(['127.0.0.1', '::1', 'localhost'].includes(proxyHost), 'migration proxy must be loopback');
    parsed.hostname = proxyHost;
    parsed.port = process.env.CLERVO_MIGRATION_PROXY_PORT ?? '5432';
    parsed.search = '';
  }
  return parsed.toString();
}

async function apply(records) {
  assert.equal(process.env.CLERVO_ENV, 'production', 'CLERVO_ENV must be production');
  assert.equal(
    process.env.CLERVO_DATABASE_MIGRATION_CONFIRM,
    `apply:${target}`,
    'production database migration confirmation mismatch',
  );
  const rawUrl = urlFromStdin ? await readStdin() : process.env.CLERVO_DATABASE_URL;
  const pool = new Pool({
    connectionString: connectionUrl(rawUrl),
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  const applied = [];
  const skipped = [];
  try {
    const identity = await pool.query('SELECT current_database() AS database, current_user AS username');
    assert.equal(identity.rows[0]?.database, 'clervo', 'connected to unexpected database');
    assert.equal(identity.rows[0]?.username, 'clervo', 'connected as unexpected database user');
    await pool.query(`CREATE TABLE IF NOT EXISTS clervo_schema_migrations (
      migration_name text PRIMARY KEY,
      sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )`);
    for (const record of records) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('clervo_schema_migrations'))");
        const existing = await client.query(
          'SELECT sha256 FROM clervo_schema_migrations WHERE migration_name = $1',
          [record.name],
        );
        if (existing.rowCount === 1) {
          assert.equal(existing.rows[0].sha256, record.checksum, `migration checksum changed: ${record.name}`);
          skipped.push(record.name);
        } else {
          await client.query(record.sql);
          await client.query(
            'INSERT INTO clervo_schema_migrations (migration_name, sha256) VALUES ($1, $2)',
            [record.name, record.checksum],
          );
          applied.push(record.name);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
  return { action: 'applied', target, applied, skipped };
}

const records = await migrations();
if (action === 'plan') {
  process.stdout.write(`${JSON.stringify({
    action: 'plan',
    target,
    migrations: records.map(({ name, checksum }) => ({ name, checksum: `sha256:${checksum}` })),
    credentialInput: 'environment_or_stdin',
  }, null, 2)}\n`);
} else if (action === 'apply') {
  process.stdout.write(`${JSON.stringify(await apply(records), null, 2)}\n`);
} else {
  throw new Error('usage: apply-postgres-migrations.mjs [plan|apply] [--database-url-stdin]');
}
