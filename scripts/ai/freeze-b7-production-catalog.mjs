#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

function argumentsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!['--credential-file', '--output', '--observed-at'].includes(name) || value === undefined) throw new TypeError('b7_catalog_freeze_argument_invalid');
    result[name.slice(2)] = value;
  }
  for (const required of ['credential-file', 'output', 'observed-at']) if (result[required] === undefined) throw new TypeError(`b7_catalog_freeze_argument_missing:${required}`);
  return result;
}

function timestamp(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new TypeError('b7_catalog_freeze_timestamp_invalid');
  return value;
}

function text(value, code, maximum = 160) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum || /[\u0000-\u001F\u007F]/u.test(value)) throw new TypeError(code);
  return value;
}

function stringList(value, code) {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string' || entry.length === 0 || entry.length > 160) || new Set(value).size !== value.length) throw new TypeError(code);
  return [...value].sort();
}

function normalizedEntry(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('b7_catalog_freeze_entry_invalid');
  if (value.object !== 'model' || value.owned_by !== 'clervo' || value.provider !== 'clervo') throw new TypeError('b7_catalog_freeze_private_projection_invalid');
  if (typeof value.canonical !== 'boolean') throw new TypeError('b7_catalog_freeze_canonical_invalid');
  const allowed = new Set(['id', 'object', 'created', 'owned_by', 'provider', 'capability', 'endpoints', 'canonical', 'reasoning', 'lifecycle']);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new TypeError('b7_catalog_freeze_unexpected_field');
  return Object.freeze({
    id: text(value.id, 'b7_catalog_freeze_id_invalid'),
    capability: text(value.capability, 'b7_catalog_freeze_capability_invalid', 64),
    endpoints: stringList(value.endpoints, 'b7_catalog_freeze_endpoints_invalid'),
    canonical: value.canonical,
    ...(value.reasoning === true ? { reasoning: true } : {}),
    ...(value.lifecycle === undefined ? {} : { lifecycle: text(value.lifecycle, 'b7_catalog_freeze_lifecycle_invalid', 64) }),
  });
}

const args = argumentsFrom(process.argv.slice(2));
const observedAt = timestamp(args['observed-at']);
const credential = (await readFile(path.resolve(args['credential-file']), 'utf8')).trim();
if (credential.length < 20 || credential.length > 2_048 || /[\r\n]/u.test(credential)) throw new TypeError('b7_catalog_freeze_credential_invalid');

const response = await fetch('https://ai.clervo.dev/v1/models', {
  headers: { authorization: `Bearer ${credential}`, accept: 'application/json' },
  redirect: 'error',
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new TypeError(`b7_catalog_freeze_http_${response.status}`);
if (response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new TypeError('b7_catalog_freeze_content_type_invalid');
const declared = Number(response.headers.get('content-length') ?? '0');
if (Number.isFinite(declared) && declared > 5_000_000) throw new TypeError('b7_catalog_freeze_response_too_large');
const body = await response.json();
if (body?.object !== 'list' || !Array.isArray(body.data)) throw new TypeError('b7_catalog_freeze_shape_invalid');
const entries = body.data.map(normalizedEntry).sort((left, right) => left.id.localeCompare(right.id));
if (new Set(entries.map(({ id }) => id)).size !== entries.length) throw new TypeError('b7_catalog_freeze_id_collision');

const canonicalModels = entries.filter(({ canonical }) => canonical);
const aliases = entries.filter(({ canonical }) => !canonical);
const idFingerprint = createHash('sha256').update(JSON.stringify(entries.map(({ id }) => id))).digest('hex');
const catalogFingerprint = createHash('sha256').update(JSON.stringify(entries)).digest('hex');
const output = {
  schemaVersion: 'ai-b7-production-freeze.v1',
  source: 'https://ai.clervo.dev/v1/models',
  observedAt,
  frozenForMilestone: 'B7',
  inventory: {
    canonicalModels: canonicalModels.length,
    aliases: aliases.length,
    callableModelIds: entries.length,
    idFingerprint: `sha256:${idFingerprint}`,
    catalogFingerprint: `sha256:${catalogFingerprint}`,
  },
  canonicalModels,
  aliases,
};

const target = path.resolve(args.output);
const temporary = `${target}.tmp`;
await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
await rename(temporary, target);
process.stdout.write(`B7 production catalog freeze: PASS (${canonicalModels.length} canonical, ${aliases.length} aliases, ${entries.length} callable IDs, sha256:${idFingerprint})\n`);
