import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRetrievalQualificationSnapshot,
  evaluateRetrievalTarget,
  retrievalCheckNames,
} from '../../dist/packages/contracts/src/index.js';

const evaluatedAt = '2026-07-30T20:00:00.000Z';
const qualificationId = 'rqual_01JZ8Q5Y4QFD48Q24H6M5F4K9P';
const hash = `sha256:${'a'.repeat(64)}`;

function checks(overrides = {}) {
  return retrievalCheckNames.map((name) => ({
    name,
    status: 'passed',
    evidence: [{ url: `https://evidence.example/${name}`, observedAt: '2026-07-30T19:00:00.000Z', sha256: hash }],
    ...(overrides[name] ?? {}),
  }));
}

function path(pathId, role, failureDomain, overrides = {}) {
  return {
    pathId,
    providerId: `provider_${pathId.replace('retrieval_', '')}`,
    failureDomain,
    role,
    mechanism: role === 'primary' ? 'provider_api' : 'public_archive',
    selected: true,
    checkedAt: '2026-07-30T19:30:00.000Z',
    expiresAt: '2026-08-06T19:30:00.000Z',
    termsStatus: 'restricted',
    allowedContentUse: role === 'primary' ? ['search_metadata', 'transient_extraction', 'retained_evidence'] : ['archive_replay', 'transient_extraction', 'retained_evidence'],
    restrictionsAcknowledged: true,
    checks: checks(),
    ...overrides,
  };
}

function snapshot(paths) {
  return createRetrievalQualificationSnapshot(qualificationId, evaluatedAt, paths);
}

test('two independently operated selected paths pass only with complete evidence-dated checks', () => {
  const result = snapshot([
    path('retrieval_brave.search', 'primary', 'brave_api'),
    path('retrieval_commoncrawl.archive', 'fallback', 'commoncrawl_archive'),
  ]);
  assert.equal(result.independentFailureDomains, true);
  assert.equal(result.twoPathGatePassed, true);
  assert.equal(result.paths.every((candidate) => candidate.routeEligible), true);
  assert.equal(Object.isFrozen(result.paths[0].checks[0].evidence[0]), true);
});

test('provider selection does not imply live route eligibility when checks are incomplete', () => {
  const result = snapshot([
    path('retrieval_brave.search', 'primary', 'brave_api', { checks: checks({ quota: { status: 'not_run', evidence: [] } }) }),
    path('retrieval_commoncrawl.archive', 'fallback', 'commoncrawl_archive'),
  ]);
  assert.equal(result.paths[0].selected, true);
  assert.equal(result.paths[0].routeEligible, false);
  assert.deepEqual(result.paths[0].failureCodes, ['check_not_run_quota']);
  assert.equal(result.twoPathGatePassed, false);
});

test('expired qualification and unacknowledged restrictions fail closed', () => {
  const result = snapshot([
    path('retrieval_brave.search', 'primary', 'brave_api', { expiresAt: evaluatedAt }),
    path('retrieval_commoncrawl.archive', 'fallback', 'commoncrawl_archive', { restrictionsAcknowledged: false }),
  ]);
  assert.ok(result.paths[0].failureCodes.includes('qualification_expired'));
  assert.ok(result.paths[1].failureCodes.includes('terms_restrictions_unacknowledged'));
  assert.equal(result.twoPathGatePassed, false);
});

test('shared failure domains do not satisfy the independent two-path gate', () => {
  const result = snapshot([
    path('retrieval_brave.search', 'primary', 'shared_cloud'),
    path('retrieval_commoncrawl.archive', 'fallback', 'shared_cloud'),
  ]);
  assert.equal(result.paths.every((candidate) => candidate.routeEligible), true);
  assert.equal(result.independentFailureDomains, false);
  assert.equal(result.twoPathGatePassed, false);
});

test('qualification rejects missing paths, duplicate checks, future evidence, and non-HTTPS evidence', () => {
  assert.throws(() => snapshot([path('retrieval_brave.search', 'primary', 'brave_api')]), /retrieval_requires_exactly_two_paths/);
  const duplicate = checks();
  duplicate.push(duplicate[0]);
  assert.throws(() => snapshot([path('retrieval_brave.search', 'primary', 'brave_api', { checks: duplicate }), path('retrieval_commoncrawl.archive', 'fallback', 'commoncrawl_archive')]), /duplicate_retrieval_check/);
  assert.throws(() => snapshot([path('retrieval_brave.search', 'primary', 'brave_api', { checks: checks({ terms: { evidence: [{ url: 'https://evidence.example/terms', observedAt: '2026-07-30T20:00:00.000Z', sha256: hash }] } }) }), path('retrieval_commoncrawl.archive', 'fallback', 'commoncrawl_archive')]), /retrieval_evidence_from_future/);
  assert.throws(() => snapshot([path('retrieval_brave.search', 'primary', 'brave_api', { checks: checks({ terms: { evidence: [{ url: 'http://evidence.example/terms', observedAt: '2026-07-30T19:00:00.000Z', sha256: hash }] } }) }), path('retrieval_commoncrawl.archive', 'fallback', 'commoncrawl_archive')]), /invalid_retrieval_evidence_url/);
});

test('target policy accepts a bounded public HTTP(S) retrieval with an allowed MIME type', () => {
  const result = evaluateRetrievalTarget({
    mode: 'transient_extraction',
    providerAllowedContentUse: ['transient_extraction'],
    hops: [{ url: 'https://example.com/article', resolvedAddresses: ['93.184.216.34'] }],
    robotsStatus: 'allowed',
    contentType: 'text/html; charset=utf-8',
    contentLengthBytes: 4096,
    maximumBytes: 1_000_000,
  });
  assert.deepEqual(result, { allowed: true, finalUrl: 'https://example.com/article', failureCodes: [] });
});

test('target policy validates every redirect hop and rejects local, metadata, private, and rebinding destinations', () => {
  for (const unsafe of [
    { url: 'http://localhost/admin', resolvedAddresses: ['127.0.0.1'] },
    { url: 'http://metadata.google.internal/', resolvedAddresses: ['169.254.169.254'] },
    { url: 'http://[::1]/', resolvedAddresses: ['::1'] },
    { url: 'https://public.example/', resolvedAddresses: ['10.0.0.1'] },
    { url: 'https://public.example/', resolvedAddresses: ['2001:db8::1'] },
    { url: 'https://public.example/', resolvedAddresses: [] },
  ]) {
    const result = evaluateRetrievalTarget({ mode: 'transient_extraction', providerAllowedContentUse: ['transient_extraction'], hops: [unsafe], robotsStatus: 'allowed', contentType: 'text/html', contentLengthBytes: 1, maximumBytes: 100 });
    assert.equal(result.allowed, false);
  }
  const redirect = evaluateRetrievalTarget({ mode: 'transient_extraction', providerAllowedContentUse: ['transient_extraction'], hops: [{ url: 'https://public.example/', resolvedAddresses: ['93.184.216.34'] }, { url: 'http://127.0.0.1/', resolvedAddresses: ['127.0.0.1'] }], robotsStatus: 'allowed', contentType: 'text/html', contentLengthBytes: 1, maximumBytes: 100 });
  assert.ok(redirect.failureCodes.includes('unsafe_url_hop_1'));
  assert.ok(redirect.failureCodes.includes('unsafe_address_hop_1'));
});

test('target policy rejects disallowed or unavailable robots, unsupported use/MIME, oversize bodies, and redirect excess', () => {
  const result = evaluateRetrievalTarget({
    mode: 'retained_evidence',
    providerAllowedContentUse: ['search_metadata'],
    hops: Array.from({ length: 7 }, (_, index) => ({ url: `https://example.com/${index}`, resolvedAddresses: ['93.184.216.34'] })),
    robotsStatus: 'unavailable',
    contentType: 'application/octet-stream',
    contentLengthBytes: 101,
    maximumBytes: 100,
  });
  assert.deepEqual(result.failureCodes, ['content_use_not_allowed', 'redirect_limit_exceeded', 'robots_unavailable', 'response_too_large', 'content_type_not_allowed']);
});