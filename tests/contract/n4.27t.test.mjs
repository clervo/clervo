import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createDeveloperRegistryAdapter,
  planDeveloperRegistryLookup,
} from '../../infra/n4.27t/developer-registry.mjs';
import {
  browserRuntimePolicy,
  buildDevelopmentBrowserPlan,
  frozenPolicyDigest,
  validateBrowserRuntimePolicy,
} from '../../infra/n4.27t/browser-runtime.mjs';
import { evaluateExclusiveResourceAdmission } from '../../infra/n4.27t/resource-exclusivity.mjs';

const bytes = (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url));
const text = async (relativePath) => (await bytes(relativePath)).toString('utf8');
const json = async (relativePath) => JSON.parse(await text(relativePath));
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

test('new development and validation material was pre-split and hash-bound before repair', async () => {
  const freeze = await json('benchmarks/n4.27t/split-freeze.v1.json');
  assert.equal(freeze.sequence, 'split_and_hash_before_repair_implementation');
  assert.equal(freeze.n427sFinalMaterialUsed, false);
  assert.deepEqual(freeze.development, { developerTasks: 12, javascriptFixtures: 4, hostileFixtures: 2 });
  assert.deepEqual(freeze.validation, { developerTasks: 10, javascriptFixtures: 12, hostileFixtures: 8, maximumExecutions: 1, executed: false });
  for (const [name, expected] of Object.entries(freeze.artifactSha256)) assert.equal(sha256(await bytes(`benchmarks/n4.27t/${name}`)), expected);

  const development = await json('benchmarks/n4.27t/development-corpus.v1.json');
  const labels = await json('benchmarks/n4.27t/development-labels.v1.json');
  assert.equal(development.split, 'development');
  assert.equal(development.status, 'development_only');
  assert.equal(development.n427sFinalMaterialUsed, false);
  assert.equal(development.tasks.length, 12);
  assert.equal(labels.labels.length, 12);
  assert.equal(new Set(development.tasks.map(({ id }) => id)).size, 12);
  assert.ok(development.tasks.every(({ providerApiCostUsd, accessMode }) => providerApiCostUsd === 0 && accessMode === 'official_api'));
});

test('developer registry prefers exact identities and creates bounded normalized searches', () => {
  const npm = planDeveloperRegistryLookup('npm package ajv current version', 5);
  assert.equal(npm.mode, 'npm_exact');
  assert.equal(npm.url.href, 'https://registry.npmjs.org/ajv');
  const github = planDeveloperRegistryLookup('GitHub repository denoland/deno current release', 5);
  assert.equal(github.mode, 'github_exact');
  assert.equal(github.url.href, 'https://api.github.com/repos/denoland/deno');
  const npmSearch = planDeveloperRegistryLookup('npm package JSON web token JOSE', 5);
  assert.equal(npmSearch.mode, 'npm_search');
  assert.equal(npmSearch.url.searchParams.get('size'), '5');
  assert.equal(npmSearch.url.searchParams.get('maintenance'), '0.4');
  const githubSearch = planDeveloperRegistryLookup('GitHub repository SvelteKit web framework SDK', 5);
  assert.equal(githubSearch.mode, 'github_search');
  assert.match(githubSearch.url.searchParams.get('q'), /in:name,description archived:false/u);
  assert.throws(() => planDeveloperRegistryLookup('npm package', 5), /search_terms_missing/u);
  assert.throws(() => planDeveloperRegistryLookup('npm package ajv current version', 11), /result_limit_invalid/u);
});

test('developer registry normalizes metadata only and opens its circuit after bounded failures', async () => {
  const responses = new Map([
    ['https://registry.npmjs.org/ajv', { status: 200, body: JSON.stringify({ name: 'ajv', description: '<b>JSON schema validator</b>', 'dist-tags': { latest: '9.0.0' }, versions: { '9.0.0': { description: 'JSON schema validator' } }, time: { '9.0.0': '2026-07-01T00:00:00.000Z' } }) }],
    ['https://api.github.com/repos/denoland/deno', { status: 200, body: JSON.stringify({ full_name: 'denoland/deno', html_url: 'https://github.com/denoland/deno', description: '<i>runtime</i>', default_branch: 'main', updated_at: '2026-07-01T00:00:00.000Z', archived: false }) }],
  ]);
  const adapter = createDeveloperRegistryAdapter({
    userAgent: 'Clervo N4.27T (security@clervo.dev)',
    transport: async ({ url }) => responses.get(url.href) ?? { status: 503, body: '{}' },
    quota: 8,
  });
  const request = { retrievedAt: '2026-08-01T19:11:00.000Z', deadlineAt: '2026-08-01T19:12:00.000Z', language: 'en', region: 'US', maximumResults: 5, signal: new AbortController().signal };
  const npmResults = await adapter.search({ ...request, query: 'npm package ajv current version' });
  assert.equal(npmResults[0].currentUrl, 'https://www.npmjs.com/package/ajv');
  assert.doesNotMatch(npmResults[0].snippet, /[<>]/u);
  const githubResults = await adapter.search({ ...request, query: 'GitHub repository denoland/deno current release' });
  assert.equal(githubResults[0].currentUrl, 'https://github.com/denoland/deno');
  assert.equal(githubResults[0].attribution.sourceId, 'developer_registry');
  for (let attempt = 0; attempt < 3; attempt += 1) await assert.rejects(() => adapter.search({ ...request, query: 'npm package missing-one current version' }), /unavailable/u);
  await assert.rejects(() => adapter.search({ ...request, query: 'npm package ajv current version' }), /circuit_open/u);
  assert.equal(adapter.telemetry().circuitState, 'open');
  assert.equal(adapter.providerApiCostUsd, 0);
});

test('every development developer-registry task resolves through recorded official metadata fixtures', async () => {
  const development = await json('benchmarks/n4.27t/development-corpus.v1.json');
  const labels = await json('benchmarks/n4.27t/development-labels.v1.json');
  const expectedById = new Map(labels.labels.map((label) => [label.id, label.expectedCanonicalUrls[0]]));
  for (const task of development.tasks) {
    const expectedUrl = expectedById.get(task.id);
    const plan = planDeveloperRegistryLookup(task.query, task.maximumResults);
    const expectedIdentity = expectedUrl.replace(/^https:\/\/(?:www\.npmjs\.com\/package|github\.com)\//u, '');
    const response = plan.mode === 'npm_exact'
      ? { name: plan.identity, description: 'recorded package metadata', 'dist-tags': { latest: '1.2.3' }, versions: { '1.2.3': { description: 'recorded package metadata' } }, time: { '1.2.3': '2026-07-01T00:00:00.000Z' } }
      : plan.mode === 'npm_search'
        ? { objects: [{ package: { name: expectedIdentity, version: '1.2.3', description: 'recorded package search metadata', date: '2026-07-01T00:00:00.000Z' } }] }
        : plan.mode === 'github_exact'
          ? { full_name: plan.identity, html_url: `https://github.com/${plan.identity}`, description: 'recorded repository metadata', default_branch: 'main', updated_at: '2026-07-01T00:00:00.000Z', archived: false }
          : { items: [{ full_name: expectedIdentity, html_url: expectedUrl, description: 'recorded repository search metadata', default_branch: 'main', updated_at: '2026-07-01T00:00:00.000Z', archived: false }] };
    const adapter = createDeveloperRegistryAdapter({
      userAgent: 'Clervo N4.27T (security@clervo.dev)',
      transport: async () => ({ status: 200, body: JSON.stringify(response) }),
      quota: 1,
    });
    const results = await adapter.search({
      query: task.query,
      retrievedAt: '2026-08-01T19:11:00.000Z',
      deadlineAt: '2026-08-01T19:12:00.000Z',
      language: 'en',
      region: 'US',
      maximumResults: task.maximumResults,
      signal: new AbortController().signal,
    });
    assert.equal(results.some(({ currentUrl }) => currentUrl === expectedUrl), true, task.id);
  }
});

test('N4.27T staging wiring replaces only the developer adapter and preserves the frozen source shell', async () => {
  const module = await import('../../infra/n4.27t/source-adapters.mjs');
  const options = { transport: async () => ({ status: 503, body: '{}' }), userAgent: 'Clervo N4.27T (security@clervo.dev)', mailto: 'security@clervo.dev' };
  const adapters = module.createN427tSourceAdapters(options);
  assert.equal(adapters.length, 6);
  assert.equal(new Set(adapters.map(({ sourceClass }) => sourceClass)).size, 6);
  const developer = adapters.find(({ sourceClass }) => sourceClass === 'developer_registry');
  assert.equal(developer.adapterId, 'adapter_developer_registries_n427t_v1');
  assert.equal(module.sourceQualifications.find(({ sourceClass }) => sourceClass === 'developer_registry').providerApiCostUsd, 0);
  assert.equal(sha256(await bytes('apps/api/src/n427s-staging-main.mjs')), 'sha256:fd79d4a650675e89d98e1375f5545a0f98296c9edd1de487b058c94930e4c492');
  const staging = await text('apps/api/src/n427t-staging-main.mjs');
  assert.match(staging, /createN427tSourceAdapters/u);
  assert.match(staging, /npm package ajv current version/u);
  assert.doesNotMatch(staging, /createN427sSourceAdapters|CLERVO_N427S|clervo\.n4\.27s/u);
  const dockerfile = await text('infra/n4.27t/search.Dockerfile');
  assert.match(dockerfile, /n427t-staging-main\.mjs/u);
  assert.match(dockerfile, /infra\/n4\.27t\/source-adapters\.mjs/u);
});

test('browser plan is development-only and runtime keeps reaping, shared-memory and hostile boundaries', async () => {
  assert.equal(validateBrowserRuntimePolicy(), browserRuntimePolicy);
  assert.throws(() => validateBrowserRuntimePolicy({ ...browserRuntimePolicy, supervisorTimeoutMs: 9_000 }), /phase_budget/u);
  assert.throws(() => validateBrowserRuntimePolicy({ ...browserRuntimePolicy, minimumSuccessRate: 0.5 }), /gate_weakened/u);
  const development = await json('benchmarks/n4.27t/development-corpus.v1.json');
  const plan = buildDevelopmentBrowserPlan(development, 'https://fixtures.example.test/');
  assert.equal(plan.length, 6);
  assert.equal(plan.filter(({ markerMode }) => markerMode === 'hostile_evidence').length, 2);
  assert.ok(plan.every(({ policyDigest }) => policyDigest === frozenPolicyDigest()));
  assert.throws(() => buildDevelopmentBrowserPlan({ ...development, split: 'validation' }, 'https://fixtures.example.test/'), /development_corpus_required/u);

  const dockerfile = await text('infra/n4.27t/browser.Dockerfile');
  assert.match(dockerfile, /tini/u);
  assert.match(dockerfile, /USER 65534:65534/u);
  const job = await text('infra/n4.27t/browser-job.yaml');
  assert.match(job, /mountPath: \/dev\/shm/u);
  assert.match(job, /readOnlyRootFilesystem: true/u);
  assert.match(job, /automountServiceAccountToken: false/u);
  assert.match(job, /CLERVO_N427T_GATEWAY/u);
  const worker = await text('infra/n4.27t/browser-worker.mjs');
  assert.doesNotMatch(worker, /--disable-dev-shm-usage/u);
  assert.match(worker, /process\.kill\(-child\.pid/u);
  assert.match(worker, /outputReturned: false/u);
  assert.match(worker, /untrusted_evidence_only/u);
  const seccomp = await json('infra/n4.27t/chromium-outer-seccomp.json');
  assert.equal(seccomp.defaultAction, 'SCMP_ACT_ALLOW');
  assert.ok(seccomp.syscalls[0].names.includes('mount'));
  assert.ok(seccomp.syscalls[0].names.includes('ptrace'));
  assert.ok(!seccomp.syscalls[0].names.includes('clone'));
});

function resourceInput(overrides = {}) {
  return {
    schemaVersion: 'clervo.n4.27t.resource-admission.v1',
    ticket: 'N4.27T',
    inventory: {
      observedAt: '2026-08-01T19:11:00.000Z',
      expiresAt: '2026-08-01T19:13:00.000Z',
      complete: true,
      unknownResourceCount: 0,
      zeroResourceVerification: { proven: true, evidenceRef: 'owner-controlled-read-only-inventory' },
      resources: [],
      operations: [],
    },
    candidateResources: [
      { ticket: 'N4.27T', environment: 'isolated_qualification', resourceId: 'vm-clervo-n427t', exactlyNamed: true, chargeable: true, dailyExposureUsd: 4.2 },
    ],
    dailyExposureCeilingUsd: 5,
    deleteCommandMayUseAsync: false,
    createMayBeginBeforeZeroInventory: false,
    unknownOutcomeAction: 'stop_reconcile_and_do_not_create',
    ...overrides,
  };
}

test('resource admission permits only fresh zero-inventory non-overlapping plans', () => {
  const now = new Date('2026-08-01T19:12:00.000Z');
  const receipt = evaluateExclusiveResourceAdmission(resourceInput(), { now });
  assert.equal(receipt.candidateDailyExposureUsd, 4.2);
  assert.equal(receipt.externalActionAuthorized, false);

  const active = resourceInput();
  active.inventory.resources.push({ ticket: 'N4.27T', resourceId: 'old-gke', state: 'active', chargeable: true, dailyExposureUsd: 1.49248 });
  assert.throws(() => evaluateExclusiveResourceAdmission(active, { now }), /resource_overlap_present/u);
  const pending = resourceInput();
  pending.inventory.operations.push({ ticket: 'N4.27T', operationId: 'delete-old-gke', state: 'running' });
  assert.throws(() => evaluateExclusiveResourceAdmission(pending, { now }), /pending_or_unknown/u);
  const unknown = resourceInput();
  unknown.inventory.unknownResourceCount = 1;
  assert.throws(() => evaluateExclusiveResourceAdmission(unknown, { now }), /not_zero_and_complete/u);
  const expensive = resourceInput({ candidateResources: [{ ticket: 'N4.27T', environment: 'isolated_qualification', resourceId: 'expensive-vm', exactlyNamed: true, chargeable: true, dailyExposureUsd: 5.01 }] });
  assert.throws(() => evaluateExclusiveResourceAdmission(expensive, { now }), /ceiling_exceeded/u);
  assert.throws(() => evaluateExclusiveResourceAdmission(resourceInput({ deleteCommandMayUseAsync: true }), { now }), /policy_weakened/u);
  assert.throws(() => evaluateExclusiveResourceAdmission(resourceInput(), { now: new Date('2026-08-01T19:14:00.000Z') }), /stale_or_invalid/u);
});

test('ticket and dispatch state keep cloud, payment and later stages fail closed', async () => {
  const ticket = await text('docs/tickets/N4.27T.md');
  for (const phrase of ['blocked_owner', 'Do not run canonical `npm test`', 'USDC spend: 0', 'N4.28', 'Stage 5']) assert.match(ticket, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  const state = await json('infra/control-plane/autonomous-dispatch-state.json');
  assert.equal(state.activeTicket.id, 'N4.27T');
  assert.equal(state.activeTicket.state, 'blocked_owner');
  assert.equal(state.nextTicket.cloudAdmission, 'blocked_owner_input_and_authority');
  assert.equal(state.nextTicket.paymentAdmission, 'not_in_scope');
  assert.equal(state.currentTruth.stage5Authorized, false);
  assert.equal(state.currentTruth.realPaymentAuthorized, false);
});
