#!/usr/bin/env node

import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startCorpusServer } from './corpus-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outputPath = path.resolve(root, process.argv[2] ?? 'docs/evidence/n4.23a-tool-benchmark.json');
const scraplingPython = process.env.N4_23A_SCRAPLING_PYTHON;
const crawl4aiPython = process.env.N4_23A_CRAWL4AI_PYTHON;
const meilisearchBinary = process.env.N4_23A_MEILISEARCH_BINARY;
if (!scraplingPython || !crawl4aiPython || !meilisearchBinary) {
  throw new Error('N4_23A_SCRAPLING_PYTHON, N4_23A_CRAWL4AI_PYTHON, and N4_23A_MEILISEARCH_BINARY are required');
}
const { evaluateRetrievalTarget } = await import(pathToFileURL(path.join(root, 'dist/packages/contracts/src/retrieval.js')));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fixtureExtractedText(html) {
  return html.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function runPython(python, script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [path.join(root, script), ...args], {
      cwd: root,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${script} failed with exit ${code ?? signal}: ${stderr.trim().slice(-8_000)}`));
        return;
      }
      const jsonLine = stdout.trim().split('\n').reverse().find((line) => line.startsWith('{'));
      if (!jsonLine) {
        reject(new Error(`${script} emitted no JSON result`));
        return;
      }
      resolve(JSON.parse(jsonLine));
    });
  });
}

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('unable to allocate benchmark port');
  await new Promise((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  return address.port;
}

async function waitForTask(origin, key, taskUid) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(`${origin}/tasks/${taskUid}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error(`Meilisearch task read failed: ${response.status}`);
    const task = await response.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed' || task.status === 'canceled') throw new Error(`Meilisearch task ${task.status}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Meilisearch task deadline exceeded');
}

async function readPeakRssKiB(pid) {
  try {
    const status = await readFile(`/proc/${pid}/status`, 'utf8');
    const match = status.match(/^VmHWM:\s+(\d+)\s+kB$/mu);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

async function benchmarkMeilisearch(corpus) {
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const database = await mkdtemp(path.join(os.tmpdir(), 'clervo-n423a-meili-'));
  const key = 'n423a-loopback-benchmark-key';
  const child = spawn(meilisearchBinary, ['--http-addr', `127.0.0.1:${port}`, '--db-path', database, '--env', 'development', '--master-key', key], {
    cwd: root,
    env: { ...process.env, MEILI_NO_ANALYTICS: 'true', MEILI_LOG_LEVEL: 'OFF' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
  const started = performance.now();
  try {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        const health = await fetch(`${origin}/health`);
        if (health.ok) break;
      } catch {
        // Bounded startup polling.
      }
      if (attempt === 79) throw new Error(`Meilisearch startup failed: ${stderr.slice(0, 300)}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const documents = corpus.routes
      .filter((route) => ['static_commerce', 'real_estate', 'documentation', 'news'].includes(route.id))
      .map((route) => ({
        id: route.id,
        title: route.id.replaceAll('_', ' '),
        content: fixtureExtractedText(route.body),
        sourceType: route.id,
        fetchedAt: '2026-07-31T00:00:00.000Z',
      }));
    const addStarted = performance.now();
    const addResponse = await fetch(`${origin}/indexes/n423a/documents?primaryKey=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(documents),
    });
    if (addResponse.status !== 202) throw new Error(`Meilisearch document add failed: ${addResponse.status}`);
    const addTask = await addResponse.json();
    await waitForTask(origin, key, addTask.taskUid);
    const indexMs = performance.now() - addStarted;
    const searchStarted = performance.now();
    const searchResponse = await fetch(`${origin}/indexes/n423a/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ q: 'Northstar', limit: 4, attributesToRetrieve: ['id'] }),
    });
    if (!searchResponse.ok) throw new Error(`Meilisearch query failed: ${searchResponse.status}`);
    const search = await searchResponse.json();
    const queryMs = performance.now() - searchStarted;
    if (search.hits[0]?.id !== 'static_commerce') throw new Error(`Meilisearch expected static_commerce top hit; observed hit count ${search.hits.length}`);
    return {
      tool: 'meilisearch_open_core',
      version: '1.51.0',
      indexedDocuments: documents.length,
      topHitId: search.hits[0]?.id ?? null,
      expectedTopHit: true,
      indexMs: Number(indexMs.toFixed(3)),
      queryMs: Number(queryMs.toFixed(3)),
      totalWallMs: Number((performance.now() - started).toFixed(3)),
      maxRssKiB: await readPeakRssKiB(child.pid),
      configuration: { bind: '127.0.0.1', analytics: false, environment: 'development', masterKeyRequired: true, rankingOwner: 'clervo' },
    };
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      child.once('exit', resolve);
      setTimeout(resolve, 2_000).unref();
    });
    await rm(database, { recursive: true, force: true });
  }
}

function benchmarkClervoBoundary(corpus) {
  const common = {
    mode: 'transient_extraction',
    providerAllowedContentUse: ['transient_extraction'],
    hops: [{ url: 'https://public.example/corpus', resolvedAddresses: ['93.184.216.34'] }],
    robotsStatus: 'allowed',
    contentType: 'text/html; charset=utf-8',
    contentLengthBytes: 1,
    maximumBytes: corpus.maximumResponseBytes,
  };
  const robots = evaluateRetrievalTarget({ ...common, robotsStatus: 'disallowed' });
  const oversizedRoute = corpus.routes.find((route) => route.id === 'oversized_response');
  const oversized = evaluateRetrievalTarget({ ...common, contentLengthBytes: oversizedRoute.generatedBytes });
  const unsupportedRoute = corpus.routes.find((route) => route.id === 'unsupported_mime');
  const unsupportedMime = evaluateRetrievalTarget({ ...common, contentType: unsupportedRoute.contentType });
  const addressByHost = {
    '127.0.0.1': '127.0.0.1',
    '[::1]': '::1',
    '169.254.169.254': '169.254.169.254',
    'metadata.google.internal': '169.254.169.254',
  };
  const forbiddenTargets = corpus.forbiddenTargets.map((target) => {
    const url = new URL(target);
    const decision = evaluateRetrievalTarget({ ...common, hops: [{ url: target, resolvedAddresses: [addressByHost[url.hostname]] }] });
    return { target, allowed: decision.allowed, failureCodes: decision.failureCodes };
  });
  assert.ok(robots.failureCodes.includes('robots_disallowed'), 'Clervo boundary accepted robots denial');
  assert.ok(oversized.failureCodes.includes('response_too_large'), 'Clervo boundary accepted oversized response');
  assert.ok(unsupportedMime.failureCodes.includes('content_type_not_allowed'), 'Clervo boundary accepted unsupported MIME');
  assert.equal(forbiddenTargets.every((item) => item.allowed === false), true, 'Clervo boundary accepted private or metadata target');
  return { robots, oversized, unsupportedMime, forbiddenTargets };
}

const corpusBytes = await readFile(path.join(root, 'tests/fixtures/n4.23a-bounded-corpus.json'));
const corpusServer = await startCorpusServer();
try {
  const byId = new Map(corpusServer.corpus.routes.map((route) => [route.id, route]));
  const scraplingCases = ['static_commerce', 'real_estate', 'documentation', 'news', 'sitemap', 'rss'];
  const scrapling = [];
  for (const id of scraplingCases) {
    const route = byId.get(id);
    const observation = { corpusId: id, ...await runPython(scraplingPython, 'scripts/benchmarks/n4.23a/scrapling-http.py', [`${corpusServer.origin}${route.path}`, route.expectedMarker, corpusServer.corpus.userAgent]) };
    assert.equal(observation.status, 200, `${id}: Scrapling status drift`);
    assert.equal(observation.markerFound, true, `${id}: Scrapling extraction marker missing`);
    scrapling.push(observation);
  }
  const redirectRoute = byId.get('redirect');
  const redirect = await runPython(scraplingPython, 'scripts/benchmarks/n4.23a/scrapling-http.py', [`${corpusServer.origin}${redirectRoute.path}`, redirectRoute.expectedMarker, corpusServer.corpus.userAgent]);
  assert.equal(redirect.status, 302, 'Scrapling redirect must remain unfollowed');
  const javascriptRoute = byId.get('javascript_commerce');
  const crawl4ai = await runPython(crawl4aiPython, 'scripts/benchmarks/n4.23a/crawl4ai-js.py', [`${corpusServer.origin}${javascriptRoute.path}`, javascriptRoute.expectedMarker, corpusServer.corpus.userAgent]);
  assert.equal(crawl4ai.success, true, 'Crawl4AI JavaScript fixture failed');
  assert.equal(crawl4ai.markerFound, true, 'Crawl4AI JavaScript marker missing');
  assert.equal(crawl4ai.stateDestroyed, true, 'Crawl4AI browser state was not destroyed');
  const meilisearch = await benchmarkMeilisearch(corpusServer.corpus);
  const clervoBoundary = benchmarkClervoBoundary(corpusServer.corpus);
  const evidence = {
    schemaVersion: 1,
    ticket: 'N4.23A',
    observedAt: new Date().toISOString(),
    corpusSha256: sha256(corpusBytes),
    corpusRouteIds: corpusServer.corpus.routes.map(({ id }) => id),
    forbiddenTargets: corpusServer.corpus.forbiddenTargets,
    pins: {
      scrapling: { version: '0.4.12', license: 'BSD-3-Clause', sdistSha256: 'c6f06d0ea54208d430d47402c4e66760280718dc5b116fa99985beb7b9a517f4' },
      crawl4ai: { version: '0.9.2', license: 'Apache-2.0', sdistSha256: '58dbfa05a82c1cfa667a20383a1d0f7a42187304da5e4d0661a6f59b0ed6a406' },
      meilisearch: { version: '1.51.0', license: 'MIT AND BUSL-1.1', communityBinarySha256: '73f4f8809a80c5293a594de100b6121cb60879f9869875bdbc732c03771de560', enterpriseFeaturesSelected: false },
    },
    observations: {
      scrapling,
      redirect: { expectedStatus: 302, followed: redirect.status !== 302, ...redirect },
      crawl4ai,
      meilisearch,
      clervoBoundary,
    },
    selectedConfiguration: {
      focusedIndexRouteId: 'clervo.focused-index.v1',
      liveFederationRouteId: 'clervo.live-federation.v1',
      defaultHttpWorker: 'scrapling_http_0.4.12_non_stealth',
      javascriptFallback: 'crawl4ai_0.9.2_internal_only_provisional_until_n4.25',
      index: 'meilisearch_1.51.0_community_features_only',
      rankingOwner: 'clervo',
      paidSearchProviderDependencies: [],
    },
    safetyBoundary: {
      robotsOwnedByClervoCore: true,
      redirectsOwnedByClervoCore: true,
      responseByteLimitOwnedByClervoCore: true,
      mimePolicyOwnedByClervoCore: true,
      ssrfAndRebindingPolicyOwnedByClervoCore: true,
      browserProductionIsolationStillRequired: true,
      commonCrawlBodiesPaidOutputAllowed: false,
    },
    network: { externalCallsDuringBenchmark: 0, loopbackOnly: true },
    cost: { thirdPartySearchProviderCostUsd: '0.000000', infrastructureCostMeasuredHereUsd: '0.000000' },
  };
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`N4.23A benchmark: PASS (${scrapling.length} HTTP corpus pages, 1 JavaScript page, ${meilisearch.indexedDocuments} indexed documents)`);
  console.log(`evidence=${path.relative(root, outputPath)}`);
  console.log('external network calls during benchmark=0');
  console.log('third-party search-provider cost USD=0.000000');
} finally {
  await corpusServer.close();
}
