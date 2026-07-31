import assert from 'node:assert/strict';
import test from 'node:test';
import { createRetrievalSupplyDecision } from '../../dist/packages/contracts/src/index.js';

const source = (id, domain, status = 'passed') => ({
  sourceId: `source_${id}`,
  providerId: `provider_${id}`,
  failureDomain: domain,
  qualificationId: `qual_${id.replaceAll('.', '').padEnd(20, '0')}`,
  qualificationStatus: status,
  substitutionPolicy: 'exact',
});

const crawl4ai = (overrides = {}) => ({
  workerId: 'worker_crawl4ai',
  selected: false,
  qualificationStatus: 'not_run',
  safetyBoundary: 'bounded_retrieval_adapter',
  deterministicFixturesPassed: false,
  timeoutEnforced: false,
  resourceLimitsEnforced: false,
  failureIsolationPassed: false,
  substitutionPolicy: 'exact',
  ...overrides,
});

function assessment(overrides = {}) {
  return {
    decisionId: 'rsupply_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
    evaluatedAt: '2026-07-31T02:30:00.000Z',
    broker: {
      brokerId: 'broker_searxng.self_hosted',
      deployment: 'self_hosted',
      selected: true,
      upstreams: [source('engine.alpha', 'engine_alpha'), source('engine.beta', 'engine_beta')],
    },
    archive: { ...source('commoncrawl.archive', 'commoncrawl_archive'), mechanism: 'public_archive', directAccess: true },
    optionalAdapters: [source('brave.search', 'brave_api', 'not_run')],
    extractionWorkers: [crawl4ai()],
    deferredTools: [
      { toolId: 'tool_scrapegraphai', disposition: 'deferred', coreDependency: false },
      { toolId: 'tool_agent_browser', disposition: 'deferred', coreDependency: false },
      { toolId: 'tool_browser_use', disposition: 'deferred', coreDependency: false },
      { toolId: 'tool_agent_reach', disposition: 'deferred', coreDependency: false },
    ],
    ...overrides,
  };
}

test('ready free-first supply uses two qualified broker upstreams plus an independent direct archive while Brave remains optional', () => {
  const decision = createRetrievalSupplyDecision(assessment());
  assert.equal(decision.brokerReady, true);
  assert.equal(decision.archiveIndependent, true);
  assert.equal(decision.readySearchSupply, true);
  assert.equal(decision.optionalAdapters[0].providerId, 'provider_brave.search');
  assert.equal(decision.optionalAdapters[0].qualificationStatus, 'not_run');
  assert.equal(decision.selectedExtractionWorkerId, undefined);
});

test('a broker cannot be ready with one provider or shared upstream failure domains', () => {
  const one = createRetrievalSupplyDecision(assessment({ broker: { ...assessment().broker, upstreams: [source('engine.alpha', 'engine_alpha')] } }));
  assert.equal(one.readySearchSupply, false);
  assert.ok(one.failureCodes.includes('metasearch_requires_two_qualified_upstreams'));
  const shared = createRetrievalSupplyDecision(assessment({ broker: { ...assessment().broker, upstreams: [source('engine.alpha', 'shared'), source('engine.beta', 'shared')] } }));
  assert.equal(shared.readySearchSupply, false);
  assert.ok(shared.failureCodes.includes('metasearch_upstreams_not_independent'));
});

test('a public shared SearXNG deployment cannot become production supply', () => {
  const decision = createRetrievalSupplyDecision(assessment({ broker: { ...assessment().broker, deployment: 'public_shared' } }));
  assert.equal(decision.brokerReady, false);
  assert.equal(decision.readySearchSupply, false);
  assert.ok(decision.failureCodes.includes('public_metasearch_not_production_supply'));
});

test('Common Crawl must remain a directly accessed independent failure domain', () => {
  const shared = createRetrievalSupplyDecision(assessment({ archive: { ...assessment().archive, failureDomain: 'engine_alpha' } }));
  assert.equal(shared.archiveIndependent, false);
  assert.equal(shared.readySearchSupply, false);
  const indirect = createRetrievalSupplyDecision(assessment({ archive: { ...assessment().archive, directAccess: false } }));
  assert.equal(indirect.readySearchSupply, false);
  assert.ok(indirect.failureCodes.includes('archive_must_remain_direct'));
});

test('only one extraction worker is evaluated and selection fails closed until every existing safety proof passes', () => {
  assert.throws(() => createRetrievalSupplyDecision(assessment({ extractionWorkers: [] })), /requires_exactly_one_extraction_worker/u);
  assert.throws(() => createRetrievalSupplyDecision(assessment({ extractionWorkers: [crawl4ai(), { ...crawl4ai(), workerId: 'worker_other' }] })), /requires_exactly_one_extraction_worker/u);
  const unqualified = createRetrievalSupplyDecision(assessment({ extractionWorkers: [crawl4ai({ selected: true })] }));
  assert.equal(unqualified.readySearchSupply, false);
  assert.ok(unqualified.failureCodes.includes('selected_extraction_worker_not_qualified'));
  const qualified = createRetrievalSupplyDecision(assessment({ extractionWorkers: [crawl4ai({ selected: true, qualificationStatus: 'passed', deterministicFixturesPassed: true, timeoutEnforced: true, resourceLimitsEnforced: true, failureIsolationPassed: true })] }));
  assert.equal(qualified.readySearchSupply, true);
  assert.equal(qualified.selectedExtractionWorkerId, 'worker_crawl4ai');
});

test('deferred tools and named supply identities cannot silently become dependencies or substitutes', () => {
  assert.throws(() => createRetrievalSupplyDecision(assessment({ deferredTools: [{ toolId: 'tool_agent_reach', disposition: 'deferred', coreDependency: true }] })), /deferred_tool_cannot_be_core_dependency/u);
  assert.throws(() => createRetrievalSupplyDecision(assessment({ optionalAdapters: [{ ...source('brave.search', 'brave_api'), substitutionPolicy: 'qualified_equivalent' }] })), /substitution_must_be_exact/u);
  assert.throws(() => createRetrievalSupplyDecision(assessment({ broker: { ...assessment().broker, upstreams: [source('engine.alpha', 'engine_alpha'), { ...source('engine.beta', 'engine_beta'), providerId: 'provider_engine.alpha' }] } })), /duplicate_metasearch_upstream_provider/u);
});