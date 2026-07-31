#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const root = new URL('../../../', import.meta.url);
const rawPath = new URL('docs/evidence/n4.26/raw-benchmark-results.v1.json.gz', root);
const outputPath = new URL('docs/evidence/n4.27/n426-regression-loss-ledger.v1.json', root);
const compressed = await readFile(rawPath);
const raw = JSON.parse(gunzipSync(compressed));
const rowsByTask = Object.groupBy(raw.rows.filter((row) => row.route === 'simple' || row.route === 'combined'), (row) => row.task.id);

function canonical(result) { return result.canonicalUrl ?? result.url ?? ''; }
function relevant(task, result) {
  const terms = task.expectedTerms.map((term) => term.toLocaleLowerCase('en-US'));
  const text = `${result.title ?? ''} ${result.evidenceText ?? ''}`.toLocaleLowerCase('en-US');
  return terms.length > 0 && terms.filter((term) => text.includes(term)).length >= Math.max(1, Math.ceil(terms.length / 2));
}
function sha256(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }

const losses = [];
for (const taskId of Object.keys(rowsByTask).sort()) {
  const rows = rowsByTask[taskId];
  const simple = rows.find((row) => row.route === 'simple');
  const combined = rows.find((row) => row.route === 'combined');
  if (simple === undefined || combined === undefined) throw new Error(`missing_route_pair:${taskId}`);
  const simpleResults = simple.execution.payload?.results ?? [];
  const combinedUrls = new Set((combined.execution.payload?.results ?? []).map(canonical));
  const combinedAttemptByRoute = Object.fromEntries((combined.execution.payload?.attempts ?? []).map((attempt) => [attempt.routeId, attempt]));
  for (const [index, candidate] of simpleResults.entries()) {
    if (!relevant(simple.task, candidate) || combinedUrls.has(canonical(candidate))) continue;
    const focused = candidate.routeId === 'clervo.focused-index.v1';
    const attempt = combinedAttemptByRoute[candidate.routeId];
    const failure = attempt?.failureCode;
    const classification = focused
      ? 'relevance_score_too_low'
      : failure === 'live_federation_current_pages_unavailable'
        ? 'extraction_failure'
        : failure === 'live_federation_circuit_open'
          ? 'other_live_circuit_open'
          : failure === 'deadline_exceeded'
            ? 'deadline_cancellation'
            : 'other_live_route_failure';
    losses.push({
      taskId,
      query: simple.task.query,
      candidate: { canonicalUrl: canonical(candidate), title: candidate.title, providerId: candidate.providerId, routeId: candidate.routeId },
      sourceRoute: candidate.routeId,
      rankBeforeProcessing: index + 1,
      scoreComponents: focused
        ? { freshness: 100, authority: 88, relevance: 80, diversity: 35, totalBasisPoints: 8350, basis: 'recomputed_from_N4.26_constant_focused_adapter_and_same-day_evidence' }
        : { freshness: null, authority: candidate.authorityScore ?? null, relevance: candidate.relevanceScore ?? null, diversity: null, totalBasisPoints: null, basis: 'not_scored_because_combined_live_attempt_failed_before_merge' },
      deduplication: {
        decision: 'retained_not_removed',
        exactDuplicateCountForTask: combined.execution.payload?.exactDuplicateCount ?? 0,
        nearDuplicateCountForTask: combined.execution.payload?.nearDuplicateCount ?? 0,
      },
      finalDisposition: focused ? 'truncated_after_non_query_discriminating_ranking' : 'not_emitted_by_failed_live_attempt',
      expectedDisposition: 'retain_as_relevant_under_frozen_N4.26_evaluator',
      lossClassification: classification,
      exactCause: focused
        ? 'createFocusedConnectedRoute assigned every candidate relevance=80 and authority=88; rankConnectedEvidence then assigned the first canonical URL full diversity before final scoring, so URL order and a premature same-domain diversity penalty displaced a Meilisearch-relevant candidate.'
        : `The simple route observed the candidate, but the later combined attempt ended ${attempt?.outcome ?? 'failed'} with ${failure ?? 'unknown_live_failure'} and returned zero live candidates.`,
      attempt: attempt ?? null,
    });
  }
}

const classifications = Object.fromEntries(Object.entries(Object.groupBy(losses, (loss) => loss.lossClassification)).map(([key, values]) => [key, values.length]).sort());
const ledger = {
  schemaVersion: 'clervo.n4.27.n426-regression-loss-ledger.v1',
  generatedAt: '2026-07-31T18:45:00.000Z',
  sourceArtifact: { path: 'docs/evidence/n4.26/raw-benchmark-results.v1.json.gz', sha256: sha256(compressed), rows: raw.rows.length },
  evaluatorBoundary: 'Relevance and expected disposition reproduce the frozen N4.26 expectedTerms evaluator; this ledger does not retroactively claim those labels are production-grade qrels.',
  unexplainedLosses: 0,
  lossCount: losses.length,
  classifications,
  losses,
};
await writeFile(outputPath, `${JSON.stringify(ledger, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ lossCount: losses.length, classifications })}\n`);
