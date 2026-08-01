import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const text = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const json = async (path) => JSON.parse(await text(path));
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

test('N4.27S corpus is independently frozen at 55 tasks with eleven per family', async () => {
  const corpusText = await text('benchmarks/n4.27s/staging-corpus.v1.json');
  const labelsText = await text('benchmarks/n4.27s/staging-labels.v1.json');
  const corpus = JSON.parse(corpusText); const labels = JSON.parse(labelsText); const freeze = await json('benchmarks/n4.27s/corpus-freeze.v1.json');
  assert.equal(corpus.tasks.length, 55); assert.equal(labels.labels.length, 55); assert.equal(new Set(corpus.tasks.map((task) => task.id)).size, 55);
  for (const count of Object.values(freeze.tasksPerFamily)) assert.equal(count, 11);
  assert.equal(freeze.corpusSha256, sha256(corpusText)); assert.equal(freeze.labelsSha256, sha256(labelsText));
  assert.equal(corpus.finalRunLimit, 1); assert.ok(corpus.tasks.every((task) => task.accessMode === 'official_api'));
  assert.equal(corpus.tasks.filter((task) => !task.answerable).length, 5);
  assert.ok(corpus.tasks.some((task) => task.locale.language !== 'en' || task.locale.region !== 'US'));
});

test('all labels passed independent official-interface validation before final execution', async () => {
  const validation = await json('docs/evidence/n4.27s/label-validation.v1.json');
  assert.equal(validation.tasks, 55); assert.equal(validation.passed, 55); assert.equal(validation.failed, 0);
  assert.ok(validation.observations.every((item) => item.passed));
});

test('N4.27 and N4.27R one-run artifacts and implementation hashes remain unchanged', async () => {
  const expected = new Map([
    ['benchmarks/n4.27/holdout-final-run.v1.json','sha256:226ad3da7ab5fd546ddcb7e90da0bd017698ac767d1db114c9be505ec8e97e5c'],
    ['docs/evidence/n4.27/holdout-final/raw-results.v1.json.gz','sha256:081138c69df3faecff483d46ea3a9f524cbe7ef99930777dbc48d0f8ac546a3b'],
    ['benchmarks/n4.27r/sealed-validation-run.v1.json','sha256:4de3a62e5bddbc165b9dd09335ed8e4edc05258073f9776504a7c9c42142d4d2'],
    ['docs/evidence/n4.27r/sealed-validation/raw-results.v1.json.gz','sha256:ad66d23f87da7a775f9a98fc8ec858162de4146d9367a92015bc8c2584efc56f'],
  ]);
  for (const [path, digest] of expected) assert.equal(sha256(await readFile(new URL(`../../${path}`, import.meta.url))), digest);
  const freeze = await json('benchmarks/n4.27r/implementation-freeze.v1.json');
  for (const file of freeze.files) assert.equal(sha256(await readFile(new URL(`../../${file.path}`, import.meta.url))), file.path === 'package.json' ? sha256(await readFile(new URL('../../package.json', import.meta.url))) : file.sha256);
});

test('source classes are official, independently identified, quota bounded, and zero-provider-cost', async () => {
  const module = await import('../../infra/n4.27s/source-adapters.mjs');
  assert.equal(module.sourceQualifications.length, 6);
  assert.equal(new Set(module.sourceQualifications.map((item) => item.adapterId)).size, 6);
  assert.equal(new Set(module.sourceQualifications.map((item) => item.healthIdentity)).size, 6);
  assert.equal(new Set(module.sourceQualifications.map((item) => item.circuitIdentity)).size, 6);
  assert.ok(module.sourceQualifications.every((item) => item.quota > 0 && item.providerApiCostUsd === 0 && item.officialDocumentationUrl.startsWith('https://') && item.officialTermsUrl.startsWith('https://')));
});

test('each source adapter exposes independent concurrency, quota, and circuit state', async () => {
  const source = await text('infra/n4.27s/source-adapters.mjs');
  assert.match(source, /circuitState = 'half_open'/u);
  assert.match(source, /active >= 2/u);
  assert.match(source, /consecutiveFailures >= 3/u);
});

test('focused-index staging seed normalizes official API evidence to an allowed textual MIME', async () => {
  const app = await text('apps/api/src/n427s-staging-main.mjs');
  assert.match(app, /createFocusedIndexDocument\([^;]+mime: 'text\/plain'/s);
  assert.doesNotMatch(app, /createFocusedIndexDocument\([^;]+mime: 'application\/json'/s);
});

test('staging response binds the measured operation cost without an undefined alias', async () => {
  const app = await text('apps/api/src/n427s-staging-main.mjs');
  assert.match(app, /estimatedUsd: estimatedCostUsd/u);
  assert.doesNotMatch(app, /operationCost: \{ estimatedUsd,/u);
});

test('staging cache proof can inject and reject controlled integrity corruption', async () => {
  const app = await text('apps/api/src/n427s-staging-main.mjs');
  assert.match(app, /poison_integrity/u);
  assert.match(app, /controlled-integrity-corruption/u);
  assert.match(app, /route !== 'focused' && !state\.cacheAvailable/u);
  assert.match(app, /freshnessState === 'stale' \? 'revalidation_not_completed' : null/u);
  const operations = await text('scripts/benchmarks/n4.27s/run-latency-and-operations.mjs');
  assert.match(operations, /per_page=3/u);
  assert.match(operations, /response\.body\.disclosure\.state/u);
});

test('private staging template has no public ingress and enforces browser gateway-only containment', async () => {
  const manifest = await text('infra/n4.27s/staging.yaml');
  assert.doesNotMatch(manifest, /type:\s*(?:LoadBalancer|NodePort)/u);
  assert.match(manifest, /name: clervo-n427s-default-deny/u);
  assert.match(manifest, /name: clervo-n427s-browser-network/u);
  assert.match(manifest, /app: clervo-n427s-gateway/u);
  assert.doesNotMatch(manifest.split('name: clervo-n427s-browser-network')[1], /cidr: 0\.0\.0\.0\/0/u);
  const job = await text('infra/n4.27s/browser-job.yaml');
  assert.match(job, /readOnlyRootFilesystem: true/u); assert.match(job, /runAsUser: 65534/u); assert.match(job, /automountServiceAccountToken: false/u);
  assert.match(job, /add: \[SETUID, SETGID, SYS_CHROOT\]/u);
  assert.match(job, /clervo-n427s-chromium\.json/u);
  assert.match(job, /limits: \{cpu: "1"/u);
  const seccomp = await json('infra/n4.27s/chromium-outer-seccomp.json');
  assert.equal(seccomp.defaultAction, 'SCMP_ACT_ALLOW');
  assert.ok(seccomp.syscalls[0].names.includes('mount') && seccomp.syscalls[0].names.includes('ptrace'));
  assert.ok(!seccomp.syscalls[0].names.includes('clone') && !seccomp.syscalls[0].names.includes('unshare'));
});

test('browser worker preserves one-page ephemeral no-stealth/no-login policy', async () => {
  const worker = await text('infra/n4.27s/browser-worker.mjs');
  assert.match(worker, /browserPages: 1/u); assert.match(worker, /persistentState: false/u); assert.match(worker, /downloadsAllowed: false/u); assert.match(worker, /callerScriptsAllowed: false/u); assert.match(worker, /stealthAllowed: false/u); assert.match(worker, /proxyRotationAllowed: false/u);
  assert.match(worker, /Math\.ceil\(Number\(sizeText\)\)/u);
  assert.match(worker, /preflightFields\.at\(-1\)/u);
  assert.match(worker, /Crash Reports/u);
  assert.match(worker, /--virtual-time-budget=1200/u);
  const dockerfile = await text('infra/n4.27s/browser.Dockerfile');
  assert.match(dockerfile, /chromium-sandbox/u);
  assert.match(dockerfile, /--nproc=128:128/u);
  const qualifier = await text('infra/n4.27s/qualify-browser.mjs');
  assert.match(qualifier, /browser_worker_supervisor_deadline/u);
  assert.match(qualifier, /socket\.setTimeout\(2_000/u);
  assert.match(qualifier, /browser_qualification_deadline/u);
  assert.match(qualifier, /browser_qualification_progress/u);
  assert.match(qualifier, /javascriptAttempts/u);
  assert.match(qualifier, /stoppedProbe/u);
  assert.match(qualifier, /failureCode/u);
});

test('retrieval gateway contains client resets without terminating the process', async () => {
  const gateway = await text('infra/n4.27s/retrieval-gateway.mjs');
  assert.match(gateway, /client\.once\('error'/u);
  assert.match(gateway, /gateway_target_not_authorized/u);
  assert.match(gateway, /if \(!released\)/u);
});

test('final staging execution is absent before freeze or exactly one afterward', async () => {
  try {
    const marker = await json('benchmarks/n4.27s/final-staging-run.v1.json');
    assert.equal(marker.runCount, 1); assert.equal(marker.status, 'completed'); assert.equal(marker.postRunTuningAllowed, false);
  } catch (error) { assert.equal(error.code, 'ENOENT'); }
});

test('ticket prohibits payment, prior sealed reruns, canonical npm test, N4.28 and Stage 5', async () => {
  const ticket = await text('docs/tickets/N4.27S.md');
  for (const phrase of ['Mock x402','real payment','USDC spend 0','Do not run canonical `npm test`','N4.28','Stage 5']) assert.match(ticket, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
});
