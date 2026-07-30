import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  assembleRetrievalCandidates,
  createRetrievalQualificationSnapshot,
  createRetrievalQueryPlan,
  createQueryRewritePlan,
  runRetrievalFederation,
  verifySearchCitation,
} from '../../dist/packages/contracts/src/index.js';

const ids = {
  qualification: 'rqual_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  plan: 'plan_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  operation: 'op_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  federation: 'fed_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  assembly: 'asm_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
};

function sha256(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }

function qualification(evaluatedAt) {
  const checkedAt = new Date(Date.parse(evaluatedAt) - 1_000).toISOString();
  const expiresAt = new Date(Date.parse(evaluatedAt) + 120_000).toISOString();
  const checks = ['terms', 'authentication', 'quota', 'response_contract', 'content_use', 'failure_isolation'].map((name) => ({ name, status: 'passed', evidence: [{ url: `https://evidence.example/${name}`, observedAt: checkedAt, sha256: `sha256:${'a'.repeat(64)}` }] }));
  return createRetrievalQualificationSnapshot(ids.qualification, evaluatedAt, [
    { pathId: 'retrieval_primary', providerId: 'provider_primary', failureDomain: 'operator_primary', role: 'primary', mechanism: 'provider_api', selected: true, checkedAt, expiresAt, termsStatus: 'approved', allowedContentUse: ['search_metadata', 'transient_extraction'], restrictionsAcknowledged: true, checks },
    { pathId: 'retrieval_fallback', providerId: 'provider_fallback', failureDomain: 'operator_fallback', role: 'fallback', mechanism: 'public_archive', selected: true, checkedAt, expiresAt, termsStatus: 'approved', allowedContentUse: ['search_metadata', 'transient_extraction'], restrictionsAcknowledged: true, checks },
  ]);
}

async function federation(candidateSets = {}) {
  const createdAt = new Date().toISOString();
  const qualificationValue = qualification(createdAt);
  const rewrite = createQueryRewritePlan({ rewriteId: 'rewrite_01JZ8Q5Y4QFD48Q24H6M5F4K9P', operationId: ids.operation, query: 'clervo deterministic search', createdAt });
  const plan = createRetrievalQueryPlan({ planId: ids.plan, operationId: ids.operation, rewrite, createdAt, deadlineAt: new Date(Date.parse(createdAt) + 5_000).toISOString(), qualification: qualificationValue });
  const adapter = (pathId) => ({ async execute() { return { rawResponse: { pathId }, candidates: candidateSets[pathId] ?? [] }; } });
  const report = await runRetrievalFederation({ federationId: ids.federation, plan, qualification: qualificationValue, adapters: { retrieval_primary: adapter('retrieval_primary'), retrieval_fallback: adapter('retrieval_fallback') } });
  return { qualification: qualificationValue, report };
}

function successfulFetch(bodyByUrl, rejected = new Set()) {
  return async (request) => {
    if (rejected.has(request.url)) return { receipt: { contractVersion: '2026-07-29.1', fetchId: request.fetchId, outcome: 'rejected', requestedUrl: request.url, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), hops: [], robots: [], failureCode: 'robots_disallowed' } };
    const body = new TextEncoder().encode(bodyByUrl[request.url]);
    const now = new Date().toISOString();
    return {
      receipt: {
        contractVersion: '2026-07-29.1', fetchId: request.fetchId, outcome: 'succeeded', requestedUrl: request.url, finalUrl: request.url,
        startedAt: now, completedAt: now,
        hops: [{ kind: 'content', url: request.url, resolvedAddresses: ['93.184.216.34'], connectedAddress: '93.184.216.34', status: 200 }],
        robots: [{ status: 'allowed', cacheHit: false, robotsUrl: new URL('/robots.txt', request.url).href, fetchedAt: now, expiresAt: new Date(Date.now() + 60_000).toISOString() }],
        contentType: 'text/html', contentLengthBytes: body.byteLength, bodySha256: sha256(body),
      },
      body,
    };
  };
}

function assemblyInput(report, qualificationValue, fetch, overrides = {}) {
  const createdAt = new Date().toISOString();
  return {
    assemblyId: ids.assembly, federation: report, qualification: qualificationValue, createdAt,
    deadlineAt: new Date(Date.parse(createdAt) + 5_000).toISOString(), maximumCandidates: 20, maximumResults: 10,
    maximumBytesPerCandidate: 100_000, maximumOutputCharacters: 100_000, workerTimeoutMs: 2_000,
    nearDuplicateThresholdBasisPoints: 8_000, userAgent: 'ClervoBot/0.1', dependencies: { fetch }, ...overrides,
  };
}

test('assembles real extracted evidence, ranks deterministically, binds exact citations, and preserves full path provenance without synthesis', async () => {
  const retrievedAt = new Date().toISOString();
  const { qualification: qualificationValue, report } = await federation({
    retrieval_primary: [{ url: 'https://primary.example/article', title: 'Clervo deterministic search', snippet: 'Primary evidence', retrievedAt }],
    retrieval_fallback: [{ url: 'https://fallback.example/article', title: 'Other source', snippet: 'Independent evidence', retrievedAt }],
  });
  const fetch = successfulFetch({
    'https://primary.example/article': '<main><h1>Clervo deterministic search</h1><p>Bounded evidence with exact citation offsets.</p></main>',
    'https://fallback.example/article': '<main><p>Independent archive evidence for search verification.</p></main>',
  });
  const result = await assembleRetrievalCandidates(assemblyInput(report, qualificationValue, fetch));
  assert.deepEqual(result.searchResponse.results.map((item) => item.rank), [1, 2]);
  assert.equal(result.searchResponse.results[0].canonicalUrl, 'https://primary.example/article');
  assert.equal(result.searchResponse.citations.every((citation) => verifySearchCitation(citation, result.searchResponse.results).valid), true);
  assert.deepEqual(result.provenance.map((item) => item.pathId).sort(), ['retrieval_fallback', 'retrieval_primary']);
  assert.equal(result.candidateRecords.every((item) => item.outcome === 'ranked'), true);
  assert.equal(result.synthesisPerformed, false);
});

test('exact and near duplicate content never enters ranking and remains provenance-accounted', async () => {
  const retrievedAt = new Date().toISOString();
  const common = 'alpha beta gamma delta epsilon zeta eta theta';
  const { qualification: qualificationValue, report } = await federation({
    retrieval_primary: [{ url: 'https://a.example/doc', title: 'Clervo search', snippet: common, retrievedAt }, { url: 'https://b.example/doc', title: 'Duplicate', snippet: common, retrievedAt }],
    retrieval_fallback: [{ url: 'https://c.example/doc', title: 'Near duplicate', snippet: common, retrievedAt }],
  });
  const result = await assembleRetrievalCandidates(assemblyInput(report, qualificationValue, successfulFetch({
    'https://a.example/doc': `<p>${common}</p>`,
    'https://b.example/doc': `<p>${common}</p>`,
    'https://c.example/doc': `<p>${common} iota</p>`,
  })));
  assert.equal(result.retainedCount, 1);
  assert.equal(result.rankedCount, 1);
  assert.deepEqual(result.candidateRecords.map((item) => item.outcome).sort(), ['exact_duplicate', 'near_duplicate', 'ranked']);
  assert.equal(result.candidateRecords.filter((item) => item.outcome.includes('duplicate')).every((item) => item.duplicateOfExtractionId !== undefined && item.resultId === undefined), true);
});

test('fetch rejection and extraction failure are candidate-local and use fixed safe failure codes', async () => {
  const retrievedAt = new Date().toISOString();
  const { qualification: qualificationValue, report } = await federation({ retrieval_primary: [
    { url: 'https://good.example/doc', title: 'Clervo search', snippet: 'good', retrievedAt },
    { url: 'https://blocked.example/doc', title: 'blocked', snippet: 'blocked', retrievedAt },
    { url: 'https://broken.example/doc', title: 'broken', snippet: 'broken', retrievedAt },
  ] });
  const baseFetch = successfulFetch({ 'https://good.example/doc': '<p>clervo deterministic search evidence</p>', 'https://broken.example/doc': '<p>broken</p>' }, new Set(['https://blocked.example/doc']));
  const extract = async (request) => {
    if (request.receipt.finalUrl === 'https://broken.example/doc') throw new Error('secret provider parser detail');
    const { extractRetrieval } = await import('../../dist/packages/contracts/src/index.js');
    return extractRetrieval(request);
  };
  const result = await assembleRetrievalCandidates(assemblyInput(report, qualificationValue, baseFetch, { dependencies: { fetch: baseFetch, extract } }));
  assert.deepEqual(result.candidateRecords.map((item) => item.outcome), ['ranked', 'fetch_rejected', 'extraction_failed']);
  assert.equal(JSON.stringify(result).includes('secret provider parser detail'), false);
  assert.equal(result.rankedCount, 1);
});

test('assembly-owned deadline contains a fetch implementation that ignores its request deadline', async () => {
  const retrievedAt = new Date().toISOString();
  const { qualification: qualificationValue, report } = await federation({ retrieval_primary: [{ url: 'https://hang.example/doc', title: 'Clervo', snippet: 'search', retrievedAt }] });
  const hanging = async () => new Promise(() => {});
  const createdAt = new Date().toISOString();
  const result = await assembleRetrievalCandidates(assemblyInput(report, qualificationValue, hanging, { createdAt, deadlineAt: new Date(Date.parse(createdAt) + 30).toISOString() }));
  assert.equal(result.candidateRecords[0].outcome, 'fetch_rejected');
  assert.equal(result.rankedCount, 0);
});

test('candidate and result limits are deterministic and every omitted observation receives a terminal record', async () => {
  const retrievedAt = new Date().toISOString();
  const candidates = Array.from({ length: 5 }, (_, index) => ({ url: `https://limit${index}.example/doc`, title: `Clervo ${index}`, snippet: 'deterministic search', retrievedAt }));
  const { qualification: qualificationValue, report } = await federation({ retrieval_primary: candidates });
  const bodies = Object.fromEntries(candidates.map((candidate, index) => [candidate.url, `<p>clervo deterministic search unique evidence ${index}</p>`]));
  const result = await assembleRetrievalCandidates(assemblyInput(report, qualificationValue, successfulFetch(bodies), { maximumCandidates: 3, maximumResults: 2 }));
  assert.equal(result.selectedCandidateCount, 3);
  assert.equal(result.omittedCandidateCount, 2);
  assert.equal(result.rankedCount, 2);
  assert.deepEqual(result.candidateRecords.map((item) => item.outcome), ['ranked', 'ranked', 'retained_unranked', 'candidate_limit', 'candidate_limit']);
});

test('forged federation provenance and substituted qualification fail before fetch', async () => {
  const retrievedAt = new Date().toISOString();
  const { qualification: qualificationValue, report } = await federation({ retrieval_primary: [{ url: 'https://safe.example/doc', title: 'Clervo', snippet: 'search', retrievedAt }] });
  let calls = 0;
  const fetch = async () => { calls += 1; throw new Error('must not run'); };
  const forged = structuredClone(report);
  forged.candidates[0].rawResponseSha256 = `sha256:${'b'.repeat(64)}`;
  await assert.rejects(() => assembleRetrievalCandidates(assemblyInput(forged, qualificationValue, fetch)), /invalid_assembly_federation/u);
  const substituted = structuredClone(qualificationValue);
  substituted.paths[0].checks[0].evidence[0].sha256 = `sha256:${'c'.repeat(64)}`;
  await assert.rejects(() => assembleRetrievalCandidates(assemblyInput(report, substituted, fetch)), /assembly_qualification_mismatch/u);
  assert.equal(calls, 0);
});

test('closed content-use gates and unsafe assembly bounds fail closed before fetch', async () => {
  const retrievedAt = new Date().toISOString();
  const { qualification: qualificationValue, report } = await federation({ retrieval_primary: [{ url: 'https://safe.example/doc', title: 'Clervo', snippet: 'search', retrievedAt }] });
  let calls = 0;
  const fetch = async () => { calls += 1; throw new Error('must not run'); };
  const closed = structuredClone(qualificationValue);
  closed.paths.forEach((path) => { path.allowedContentUse = ['search_metadata']; });
  await assert.rejects(() => assembleRetrievalCandidates(assemblyInput(report, closed, fetch)), /assembly_qualification_mismatch|assembly_content_use_not_allowed/u);
  await assert.rejects(() => assembleRetrievalCandidates(assemblyInput(report, qualificationValue, fetch, { maximumCandidates: 21 })), /invalid_assembly_candidate_limit/u);
  await assert.rejects(() => assembleRetrievalCandidates(assemblyInput(report, qualificationValue, fetch, { deadlineAt: new Date(Date.now() + 31_000).toISOString() })), /invalid_assembly_deadline/u);
  assert.equal(calls, 0);
});

test('assembly reports and nested evidence/provenance structures are deeply immutable', async () => {
  const retrievedAt = new Date().toISOString();
  const { qualification: qualificationValue, report } = await federation({ retrieval_primary: [{ url: 'https://immutable.example/doc', title: 'Clervo search', snippet: 'evidence', retrievedAt }] });
  const result = await assembleRetrievalCandidates(assemblyInput(report, qualificationValue, successfulFetch({ 'https://immutable.example/doc': '<p>clervo deterministic search immutable evidence</p>' })));
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.candidateRecords), true);
  assert.equal(Object.isFrozen(result.candidateRecords[0]), true);
  assert.equal(Object.isFrozen(result.provenance), true);
  assert.equal(Object.isFrozen(result.provenance[0]), true);
  assert.equal(Object.isFrozen(result.searchResponse.results[0]), true);
  assert.equal(Object.isFrozen(result.searchResponse.citations[0]), true);
});