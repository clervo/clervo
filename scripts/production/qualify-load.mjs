#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  InMemoryFreeSearchQuota,
  SEARCH_FREE_PATH,
  createSearchResponse,
} from '../../dist/packages/contracts/src/index.js';
import { createSearchServer } from '../../apps/api/src/search-server.mjs';
import { InMemorySearchStateStore } from '../../apps/api/src/search-state-store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(await readFile(path.join(root, 'infra/production/load-qualification.v1.json'), 'utf8'));
const evidencePath = path.join(root, 'docs/evidence/production/load-qualification.v1.json');
const worktreeStatus = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim();
assert.equal(worktreeStatus, '', 'load_qualification_requires_clean_worktree');
const sourceCommit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const now = '2026-08-02T12:00:00.000Z';
let calls = 0;
let active = 0;
let maximumActive = 0;
let releaseBurst;
let burstStartedResolve;
let burstMode = true;
const burstGate = new Promise((resolve) => { releaseBurst = resolve; });
const burstStarted = new Promise((resolve) => { burstStartedResolve = resolve; });

function output(input) {
  const evidenceText = 'The bounded load qualification returned useful evidence.';
  return {
    searchResponse: createSearchResponse({
      operationId: input.operationId,
      query: input.query,
      now,
      maxResults: input.maxResults,
      evidence: [{
        resultId: 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
        sourceId: 'adapter_mock.search',
        url: 'https://example.com/load',
        title: 'Load evidence',
        snippet: evidenceText,
        evidenceText,
        retrievedAt: now,
        publishedAt: '2026-08-02T11:00:00.000Z',
        authorityScore: 90,
        relevanceScore: 95,
      }],
      citations: [{
        citationId: 'cite_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
        resultId: 'sr_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
        canonicalUrl: 'https://example.com/load',
        quote: evidenceText,
        startOffset: 0,
        endOffset: evidenceText.length,
      }],
    }),
  };
}

const executor = {
  async execute(input) {
    calls += 1;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    if (burstMode && active === policy.maximumConcurrentExecutions) burstStartedResolve();
    try {
      if (burstMode) await burstGate;
      else await new Promise((resolve) => setTimeout(resolve, 2));
      return output(input);
    } finally {
      active -= 1;
    }
  },
};

const stateStore = new InMemorySearchStateStore({
  environmentNamespace: 'load-qualification',
  freeQuota: new InMemoryFreeSearchQuota(10_000, 60_000),
});
const server = createSearchServer({
  executor,
  stateStore,
  now: () => now,
  maxConcurrentExecutions: policy.maximumConcurrentExecutions,
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const initialRss = process.memoryUsage().rss;

async function post(sequence, prefix) {
  const startedAt = performance.now();
  const response = await fetch(`${origin}${SEARCH_FREE_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `idem_load_${prefix}_${String(sequence).padStart(5, '0')}`,
    },
    body: JSON.stringify({ query: `${prefix} request ${sequence}`, maxResults: 1, synthesize: false }),
  });
  const body = await response.json();
  return { sequence, status: response.status, latencyMs: performance.now() - startedAt, body };
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

async function concurrentRange(count, concurrency, prefix) {
  const results = [];
  let next = 1;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next <= count) {
      const sequence = next;
      next += 1;
      results.push(await post(sequence, prefix));
    }
  }));
  return results;
}

let report;
try {
  const admittedPromises = Array.from(
    { length: policy.maximumConcurrentExecutions },
    (_, index) => post(index + 1, 'burst'),
  );
  await Promise.race([
    burstStarted,
    new Promise((_, reject) => setTimeout(() => reject(new Error('burst_admission_timeout')), 5_000)),
  ]);
  const overflow = await Promise.all(Array.from(
    { length: policy.burstRequests - policy.maximumConcurrentExecutions },
    (_, index) => post(index + policy.maximumConcurrentExecutions + 1, 'burst'),
  ));
  assert.ok(overflow.every(({ status, body }) => status === 503 && body.code === 'search_overloaded'));
  const overloadP95Ms = percentile(overflow.map(({ latencyMs }) => latencyMs), 0.95);
  assert.ok(overloadP95Ms <= policy.maximumOverloadP95Ms);
  releaseBurst();
  const admitted = await Promise.all(admittedPromises);
  assert.ok(admitted.every(({ status }) => status === 200));
  const callsAfterBurst = calls;

  const replayed = await Promise.all(admitted.map(({ sequence }) => post(sequence, 'burst')));
  assert.ok(replayed.every(({ status, body }) => status === 200 && body.replayed === true));
  assert.equal(calls, callsAfterBurst);

  burstMode = false;
  const steady = await concurrentRange(policy.steadyRequests, policy.steadyClientConcurrency, 'steady');
  assert.ok(steady.every(({ status }) => status === 200));
  const steadyP95Ms = percentile(steady.map(({ latencyMs }) => latencyMs), 0.95);
  assert.ok(steadyP95Ms <= policy.maximumSteadyP95Ms);
  assert.ok(maximumActive <= policy.maximumConcurrentExecutions);
  const rssGrowthBytes = Math.max(0, process.memoryUsage().rss - initialRss);
  assert.ok(rssGrowthBytes <= policy.maximumRssGrowthBytes);

  report = {
    schemaVersion: 'clervo.production-load-qualification.v1',
    qualifiedAt: new Date().toISOString(),
    sourceCommit,
    burst: {
      requests: policy.burstRequests,
      admitted: admitted.length,
      overloaded: overflow.length,
      unexpectedStatuses: 0,
      overloadP95Ms,
      replayedWithoutExecution: replayed.length,
    },
    steady: {
      requests: steady.length,
      clientConcurrency: policy.steadyClientConcurrency,
      succeeded: steady.filter(({ status }) => status === 200).length,
      p50Ms: percentile(steady.map(({ latencyMs }) => latencyMs), 0.5),
      p95Ms: steadyP95Ms,
    },
    runtime: {
      maximumActiveExecutions: maximumActive,
      executionCeiling: policy.maximumConcurrentExecutions,
      totalExecutorCalls: calls,
      rssGrowthBytes,
      requestTimeoutMs: server.requestTimeout,
      headersTimeoutMs: server.headersTimeout,
      maximumRequestsPerSocket: server.maxRequestsPerSocket,
    },
    recovery: {
      usefulTrafficAfterBurst: true,
      replayCausedDuplicateExecution: false,
    },
    externalEffects: {
      cloudResourcesChanged: false,
      providerCalls: 0,
      payments: 0,
      ownerCashSpentUsd: 0,
    },
    productionReady: false,
  };
} finally {
  releaseBurst();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`load qualification: PASS (${report.burst.requests} burst, ${report.steady.requests} steady)\n`);
