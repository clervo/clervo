import { createHash } from 'node:crypto';

export const browserRuntimePolicy = Object.freeze({
  schemaVersion: 'clervo.n4.27t.browser-runtime-policy.v1',
  preflightTimeoutMs: 2_500,
  renderTimeoutMs: 6_500,
  cleanupTimeoutMs: 1_000,
  supervisorTimeoutMs: 11_000,
  maximumRenderedBytes: 2_097_152,
  maximumPreflightBytes: 2_097_152,
  maximumOutputCharacters: 100_000,
  maximumProcesses: 128,
  maximumOpenFiles: 256,
  startupAttemptsInFinalQualification: 20,
  minimumJavascriptFixtures: 10,
  hostileFixturesInFinalQualification: 8,
  minimumSuccessRate: 0.95,
  maximumP95Ms: 6_000,
});

export function validateBrowserRuntimePolicy(policy = browserRuntimePolicy) {
  for (const key of ['preflightTimeoutMs', 'renderTimeoutMs', 'cleanupTimeoutMs', 'supervisorTimeoutMs']) {
    if (!Number.isInteger(policy[key]) || policy[key] <= 0) throw new Error(`browser_policy_${key}_invalid`);
  }
  if (policy.preflightTimeoutMs + policy.renderTimeoutMs + policy.cleanupTimeoutMs > policy.supervisorTimeoutMs) {
    throw new Error('browser_policy_phase_budget_exceeds_supervisor');
  }
  if (policy.minimumJavascriptFixtures < 10 || policy.startupAttemptsInFinalQualification !== 20 || policy.hostileFixturesInFinalQualification !== 8) {
    throw new Error('browser_policy_qualification_shape_invalid');
  }
  if (policy.minimumSuccessRate < 0.95 || policy.maximumP95Ms > 6_000) throw new Error('browser_policy_gate_weakened');
  return policy;
}

export function frozenPolicyDigest() {
  return `sha256:${createHash('sha256').update('routing=frozen;ranking=frozen;payment=disabled;tools=none;citations=bound;secrets=none;policy=fixed').digest('hex')}`;
}

export function buildDevelopmentBrowserPlan(corpus, fixtureBaseUrl) {
  if (corpus?.schemaVersion !== 'clervo.n4.27t.corpus.v1' || corpus.split !== 'development' || corpus.status !== 'development_only') {
    throw new Error('browser_development_corpus_required');
  }
  const base = new URL(fixtureBaseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('browser_fixture_base_invalid');
  const policyDigest = frozenPolicyDigest();
  return Object.freeze([
    ...corpus.browserFixtures.javascript.map((fixture) => Object.freeze({ ...fixture, url: new URL(fixture.path, base).href, markerMode: 'body', policyDigest })),
    ...corpus.browserFixtures.hostile.map((fixture) => Object.freeze({ ...fixture, url: new URL(fixture.path, base).href, markerMode: 'hostile_evidence', policyDigest })),
  ]);
}
