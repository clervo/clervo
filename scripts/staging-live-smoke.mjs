#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = process.env.CLERVO_STAGING_ORIGIN;
const expectedReleaseId = process.env.CLERVO_RELEASE_ID;
const evidencePath = process.env.CLERVO_STAGING_EVIDENCE_PATH;
const identityToken = process.env.CLERVO_STAGING_IDENTITY_TOKEN;

if (!origin || !expectedReleaseId) throw new Error('CLERVO_STAGING_ORIGIN and CLERVO_RELEASE_ID are required');
const normalizedOrigin = new URL(origin).origin;
const authorizationHeaders = identityToken ? { authorization: `Bearer ${identityToken}` } : {};

async function post(route, idempotencyKey, body, headers = {}) {
  return fetch(`${normalizedOrigin}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey, ...authorizationHeaders, ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
}

const observedAt = new Date().toISOString();
const nonce = Date.now().toString(36);
const healthResponse = await fetch(`${normalizedOrigin}/healthz`, {
  headers: authorizationHeaders,
  signal: AbortSignal.timeout(15_000),
});
assert.equal(healthResponse.status, 200);
const health = await healthResponse.json();
assert.equal(health.status, 'ok');
assert.equal(health.environment, 'staging');
assert.equal(health.releaseId, expectedReleaseId);
assert.equal(health.paidExecutionEnabled, false);

const freeResponse = await post('/v1/search/free', `idem_live_${nonce}_free`, {
  query: 'Clervo recorded staging deployment proof',
  maxResults: 2,
  synthesize: true,
});
assert.equal(freeResponse.status, 200);
const free = await freeResponse.json();
assert.equal(free.fundingMode, 'free');
assert.equal(free.output.searchResponse.results.length, 2);
assert.equal(free.output.synthesisReport.outcome, 'synthesized');

const paidResponse = await post('/v1/search/paid', `idem_live_${nonce}_paid`, {
  query: 'Paid execution must remain disabled',
  maxResults: 1,
  synthesize: false,
});
assert.equal(paidResponse.status, 402);
const paid = await paidResponse.json();
assert.equal(paid.extensions.clervo.executionAllowed, false);

const evidence = {
  schemaVersion: 1,
  observedAt,
  origin: normalizedOrigin,
  releaseId: expectedReleaseId,
  health: { status: healthResponse.status, body: health },
  freeSample: {
    status: freeResponse.status,
    fundingMode: free.fundingMode,
    productId: free.productId,
    resultCount: free.output.searchResponse.results.length,
    synthesisOutcome: free.output.synthesisReport.outcome,
  },
  paidRoute: {
    status: paidResponse.status,
    executionAllowed: paid.extensions.clervo.executionAllowed,
    paymentMode: 'non-payable-challenge',
  },
  externalProviderCallsProven: false,
  realPaymentProven: false,
};

if (evidencePath) {
  const absoluteEvidencePath = path.resolve(repositoryRoot, evidencePath);
  await mkdir(path.dirname(absoluteEvidencePath), { recursive: true });
  await writeFile(absoluteEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
}

console.log('staging live smoke: PASS');
console.log(JSON.stringify(evidence, null, 2));