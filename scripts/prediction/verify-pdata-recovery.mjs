#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../..', import.meta.url);
const registry = JSON.parse(await readFile(new URL('infra/prediction/source-routes.v1.json', root), 'utf8'));
const evidence = JSON.parse(await readFile(new URL('docs/evidence/prediction/pdata-live-conformance.v1.json', root), 'utf8'));
const nowMs = Date.now();
const maximumEvidenceAgeMs = 60 * 60 * 1_000;
const expectedTtlMs = 7 * 24 * 60 * 60 * 1_000;
const productionVenues = ['polymarket', 'kalshi', 'manifold', 'limitless'];

assert.equal(evidence.schemaVersion, 'clervo.pdata-live-conformance.v1');
assert.equal(evidence.qualified, true);
assert.equal(evidence.ownerCashSpentUsd, 0);
assert.equal(evidence.mutationCount, 0);
assert.equal(evidence.authenticationRequired, false);
assert.ok(evidence.externalCalls >= 39);
const observedAtMs = Date.parse(evidence.qualification?.technicalObservedAt);
const expiresAtMs = Date.parse(evidence.qualification?.technicalExpiresAt);
assert.ok(Number.isFinite(observedAtMs) && observedAtMs <= nowMs && nowMs - observedAtMs <= maximumEvidenceAgeMs);
assert.equal(expiresAtMs - observedAtMs, expectedTtlMs);
assert.ok(expiresAtMs > nowMs);
assert.equal(evidence.qualification.ttlMs, expectedTtlMs);
assert.deepEqual(evidence.productionSellableVenueIds, productionVenues);
assert.equal(evidence.runtimeProbe?.passed, true);
assert.equal(evidence.runtimeProbe?.searchPassed, true);
assert.equal(evidence.search?.passed, true);
assert.equal(evidence.search?.runtimeClientSideFilteringQualified, true);
for (const venueId of productionVenues) {
  const source = evidence.sources.find((item) => item.venueId === venueId);
  assert.deepEqual({ repeatedCalls: source?.repeatedCalls, successes: source?.successes, failures: source?.failures, normalizationPassed: source?.normalizationPassed }, { repeatedCalls: 3, successes: 3, failures: 0, normalizationPassed: true });
  const history = evidence.history?.results?.find((item) => item.status === 'fulfilled' && item.value?.venueId === venueId);
  assert.ok(history, `${venueId}_history_qualification_missing`);
}
const pdata = registry.sources.find(({ adapterId }) => adapterId === 'adapter_prediction.pdata_rest');
assert.ok(pdata);
assert.equal(pdata.qualificationId, evidence.qualification.qualificationId);
assert.equal(pdata.technicalQualification, 'qualified');
assert.equal(pdata.technicalObservedAt, evidence.qualification.technicalObservedAt);
assert.equal(pdata.technicalExpiresAt, evidence.qualification.technicalExpiresAt);
assert.deepEqual(pdata.venueIds, productionVenues);
assert.equal(pdata.commercialPermission, 'approved');
assert.equal(pdata.publicSellable, true);
assert.equal(pdata.customerRoutingEnabled, true);

process.stdout.write(`expired Prediction qualification recovery: PASS (${pdata.qualificationId}, expires ${pdata.technicalExpiresAt})\n`);
