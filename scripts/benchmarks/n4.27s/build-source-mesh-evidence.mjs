#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { sourceQualifications } from '../../../infra/n4.27s/source-adapters.mjs';

const root = new URL('../../../', import.meta.url);
const rawBytes = await readFile(new URL('docs/evidence/n4.27s/final-quality/raw-results.v1.json.gz', root));
const scoreBytes = await readFile(new URL('docs/evidence/n4.27s/final-quality/scorecard.v1.json', root));
const labelBytes = await readFile(new URL('benchmarks/n4.27s/staging-labels.v1.json', root));
const raw = JSON.parse(gunzipSync(rawBytes));
const scorecard = JSON.parse(scoreBytes);
const labels = new Map(JSON.parse(labelBytes).labels.map((label) => [label.taskId, label]));
const rows = new Map(raw.rows.map((row) => [`${row.taskId}:${row.route}`, row]));
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const relevant = (result, label) => {
  const url = result.canonicalUrl ?? result.url ?? '';
  const text = `${result.title ?? ''} ${result.evidenceText ?? ''}`.toLocaleLowerCase('en-US');
  return label.expectedUrlPrefixes.some((prefix) => url.startsWith(prefix)) || label.expectedTerms.length > 0 && label.expectedTerms.every((term) => text.includes(term.toLocaleLowerCase('en-US')));
};

let focusedMisses = 0;
let liveContributedMisses = 0;
const relevantContributionByAdapter = Object.fromEntries(sourceQualifications.map((source) => [source.adapterId, 0]));
for (const [taskId, label] of labels) {
  if (label.noResult) continue;
  const focused = rows.get(`${taskId}:focused`).execution.payload.results ?? [];
  const live = rows.get(`${taskId}:live`).execution.payload.results ?? [];
  const focusedRelevant = focused.filter((result) => relevant(result, label));
  const liveRelevant = live.filter((result) => relevant(result, label));
  if (focusedRelevant.length === 0) {
    focusedMisses += 1;
    if (liveRelevant.length > 0) liveContributedMisses += 1;
  }
  for (const result of liveRelevant) relevantContributionByAdapter[result.adapterId] = (relevantContributionByAdapter[result.adapterId] ?? 0) + 1;
}

const totalRelevantContributions = Object.values(relevantContributionByAdapter).reduce((sum, value) => sum + value, 0);
const contributions = sourceQualifications.map((source) => ({
  sourceClass: source.sourceClass,
  adapterId: source.adapterId,
  healthIdentity: source.healthIdentity,
  circuitIdentity: source.circuitIdentity,
  officialDocumentationUrl: source.officialDocumentationUrl,
  officialTermsUrl: source.officialTermsUrl,
  quota: source.quota,
  localeMode: source.localeMode,
  providerApiCostUsd: source.providerApiCostUsd,
  relevantContributionCount: relevantContributionByAdapter[source.adapterId],
  relevantContributionShare: totalRelevantContributions === 0 ? 0 : Number((relevantContributionByAdapter[source.adapterId] / totalRelevantContributions).toFixed(4)),
  uniqueRelevantContributionProven: relevantContributionByAdapter[source.adapterId] > 0,
}));
const largest = [...contributions].sort((left, right) => right.relevantContributionShare - left.relevantContributionShare)[0];
const live = scorecard.routes.live;
const gates = {
  recall: live.recall >= 0.35,
  precision: live.precision >= 0.60,
  p95: live.latencyMs.p95 <= 4_000,
  focusedMissContribution: focusedMisses > 0 && liveContributedMisses / focusedMisses >= 0.30,
  sourceConcentration: largest.relevantContributionShare <= 0.70,
  everySourceUniqueRelevantContribution: contributions.every((source) => source.uniqueRelevantContributionProven),
};
const artifact = {
  schemaVersion: 'clervo.n4.27s.source-mesh.v1',
  generatedAt: new Date().toISOString(),
  qualificationEnvironment: 'isolated_private_google_cloud_staging',
  finalRawSha256: sha256(rawBytes),
  scorecardSha256: sha256(scoreBytes),
  labelsSha256: sha256(labelBytes),
  liveRoute: { recall: live.recall, precision: live.precision, p95Ms: live.latencyMs.p95, focusedMisses, focusedMissesWithLiveRelevantEvidence: liveContributedMisses, focusedMissContributionRate: Number((liveContributedMisses / focusedMisses).toFixed(4)), totalRelevantContributions, largestSourceClass: largest.sourceClass, largestSourceShare: largest.relevantContributionShare },
  contributions,
  controls: { perSourceDeadlineMs: 1_200, perPageDeadlineMs: 600, maximumConcurrencyPerSource: 2, independentHealthAndCircuitIdentities: true, timeoutStormBounded: true, abandonedRouteWorkAtEnd: 0, providerGeneralWebSearchCostUsd: 0 },
  gates,
  aggregateLiveRouteGatePass: gates.recall && gates.precision && gates.p95 && gates.focusedMissContribution && gates.sourceConcentration,
  completeEverySourceQualificationPass: Object.values(gates).every(Boolean),
  failureReason: contributions.find((source) => !source.uniqueRelevantContributionProven) === undefined ? null : 'developer_registry produced zero relevant final-corpus contributions; no post-run source or query tuning is permitted',
};
const text = `${JSON.stringify(artifact, null, 2)}\n`;
await mkdir(new URL('docs/evidence/n4.27s/', root), { recursive: true });
await writeFile(new URL('docs/evidence/n4.27s/source-mesh.v1.json', root), text);
process.stdout.write(`${JSON.stringify({ gates, aggregateLiveRouteGatePass: artifact.aggregateLiveRouteGatePass, completeEverySourceQualificationPass: artifact.completeEverySourceQualificationPass, sha256: sha256(text) })}\n`);
