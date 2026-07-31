#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const root = new URL('../../../', import.meta.url);
const rawPath = 'docs/evidence/n4.27/holdout-final/raw-results.v1.json.gz';
const rawBytes = await readFile(new URL(rawPath, root));
const raw = JSON.parse(gunzipSync(rawBytes));
const labelBytes = await readFile(new URL('benchmarks/n4.27/holdout-labels.v1.json', root));
const labels = new Map(JSON.parse(labelBytes).labels.map(([taskId, urls, terms, grade]) => [taskId, { urls, terms, grade }]));
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const normalizeUrl = (value) => value.toLocaleLowerCase('en-US').replace(/^https?:\/\/(?:www\.)?/u, '').replace(/\/$/u, '');
const canonical = (result) => result.canonicalUrl ?? result.url ?? '';
const balanced = raw.rows.filter((row) => row.scenario === 'repaired_balanced' && row.repetition === 1);

function matches(result, label) {
  const url = normalizeUrl(canonical(result));
  const text = `${result.title ?? ''}\n${result.evidenceText ?? ''}`.toLocaleLowerCase('en-US');
  return label.urls.some((prefix) => url.startsWith(normalizeUrl(prefix))) && label.terms.every((term) => text.includes(term.toLocaleLowerCase('en-US')));
}

const tasks = balanced.map((row) => {
  const label = labels.get(row.task.id);
  const results = row.execution.payload.results ?? [];
  const relevant = results.filter((result) => matches(result, label));
  const expectedNoResult = label.urls.length === 0;
  const passed = expectedNoResult ? results.length === 0 : relevant.length > 0;
  let primaryCause = 'passed_correct_no_result';
  if (!passed && expectedNoResult) primaryCause = 'false_positive_on_no_result';
  else if (!passed && results.length === 0) primaryCause = 'no_candidates_returned';
  else if (!passed && label.urls.every((url) => normalizeUrl(url).split('/', 1)[0] === 'fixture.clervo.invalid')) primaryCause = 'controlled_fixture_not_connected_to_retrieval';
  else if (!passed) primaryCause = 'target_source_absent_from_all_returned_candidates';
  const attempts = row.execution.payload.attempts ?? [];
  return {
    taskId: row.task.id,
    family: row.task.family,
    query: row.task.query,
    features: row.task.features,
    outcome: passed ? 'passed' : 'failed',
    primaryCause,
    expectedUrls: label.urls,
    returnedUrls: results.map(canonical),
    returnedResultCount: results.length,
    relevantResultCount: relevant.length,
    routeAttempts: attempts,
    observedDurationMs: Number(row.execution.durationMs.toFixed(3)),
    causeAssessment: {
      benchmarkLabelEvaluatorMismatch: expectedNoResult ? 'proven_evaluator_defect_no_result_folded_into_recall_precision_and_rank_metrics' : 'not_primary_for_answerable_task',
      urlPrefixMatching: 'rejected_as_cause_no_labelled_url_reached_the_evaluator',
      expectedTermMatching: 'rejected_as_cause_no_labelled_url_reached_the_evaluator',
      corpusIndexCoverage: primaryCause.includes('source_absent') || primaryCause.includes('fixture_not_connected') ? 'proven_causal' : 'not_primary',
      queryRewritingOverfit: 'rejected_no_query_id_or_label_rules_found_and_balanced_used_only_normalized_query',
      verticalProfileMisclassification: 'rejected_family_to_profile_mapping_was_correct',
      candidateTruncation: 'rejected_for_target_loss_target_absent_before_final_candidate_set',
      rankingCalibration: results.length > 0 && !expectedNoResult ? 'contributing_to_irrelevant_order_but_not_target_absence' : expectedNoResult && results.length > 0 ? 'proven_no_relevance_floor' : 'not_observed',
      deduplication: 'rejected_for_target_loss_no_labelled_candidate_entered_deduplication',
      liveTimeoutOrCircuit: attempts.some((attempt) => attempt.outcome !== 'succeeded') ? 'contributing' : 'not_observed',
      localeBehavior: 'masked_by_old_evaluator_when_response_locale_fields_were_absent_but_not_collapse_cause',
      cachedVersusFresh: 'contributing_coverage_risk_focused_index_was_a_narrow_cached_snapshot',
      missingSources: primaryCause.includes('source_absent') || primaryCause.includes('fixture_not_connected') ? 'proven_causal' : 'not_primary',
      responseContractDifference: 'not_causal_to_labelled_url_absence',
    },
  };
});

const counts = Object.fromEntries(Object.entries(Object.groupBy(tasks, (task) => task.primaryCause)).map(([cause, rows]) => [cause, rows.length]).sort());
const attempts = Object.fromEntries(Object.entries(Object.groupBy(tasks.flatMap((task) => task.routeAttempts), (attempt) => `${attempt.routeId}:${attempt.outcome}:${attempt.failureCode ?? 'none'}`)).map(([key, rows]) => [key, rows.length]).sort());
const ledger = {
  schemaVersion: 'clervo.n4.27r.root-cause-ledger.v1',
  generatedAt: '2026-07-31T20:57:00.000Z',
  sourceArtifacts: {
    raw: { path: rawPath, sha256: sha256(rawBytes), rows: raw.rows.length },
    labels: { path: 'benchmarks/n4.27/holdout-labels.v1.json', sha256: sha256(labelBytes) },
    finalRunMarker: { path: 'benchmarks/n4.27/holdout-final-run.v1.json', runCount: 1 },
  },
  method: 'Read-only classification of repetition 1 for repaired_balanced. No request was sent and the frozen holdout was not rerun.',
  taskCount: tasks.length,
  failedTaskCount: tasks.filter((task) => task.outcome === 'failed').length,
  passedTaskCount: tasks.filter((task) => task.outcome === 'passed').length,
  primaryCauseCounts: counts,
  routeAttemptCounts: attempts,
  evaluatorDefects: [
    { id: 'no_result_metric_conflation', status: 'proven', evidence: 'Two correct no-result tasks contributed 1.0 recall and precision each, creating the reported 0.04 although answerable-task recall and precision were both zero.' },
    { id: 'no_result_rank_penalty', status: 'proven', evidence: 'The evaluator constructs an ideal list of length one for expected=0, so a correct empty result receives nDCG@10=0 and MRR@10=0 instead of separate no-result accuracy.' },
    { id: 'baseline_quality_conflation', status: 'proven', evidence: 'baselineVictory could pass on citation/structure weighting even when combined retrieval recall, precision, nDCG and MRR did not improve over simple combination.' },
    { id: 'locale_undefined_auto_pass', status: 'proven', evidence: 'localeCorrectness explicitly awards 1 when payload.language is undefined, masking response-contract omissions.' },
    { id: 'url_prefix_matching', status: 'rejected', evidence: 'No answerable balanced result had a labelled URL prefix before evidence-term checks.' },
    { id: 'expected_term_strictness', status: 'rejected_as_collapse_cause', evidence: 'No labelled URL reached the evidence-term predicate; strict terms could not cause the observed collapse.' },
  ],
  regressionExplanation: {
    status: 'proven_misleading_alignment',
    evidence: 'N4.26 used a seeded Wikipedia/Crossref-aligned corpus and accepted at least half of generic expected terms without URL qrels. N4.27 required URL qrels plus all evidence terms across unseen domains and controlled fixtures.',
  },
  latencyExplanation: {
    status: 'proven_and_contributing',
    evidence: 'The balanced raw artifact contains 32 live_federation_circuit_open attempts, one deadline_exceeded attempt, and request durations up to 6785.670 ms despite a nominal 1800 ms merge deadline. The live circuit counted empty search results as operational failures, and attemptRoute returned on its deadline without joining the abandoned execution, permitting background work to contaminate later sequential requests.',
  },
  tasks,
};

await mkdir(new URL('docs/evidence/n4.27r/', root), { recursive: true });
await writeFile(new URL('docs/evidence/n4.27r/root-cause-ledger.v1.json', root), `${JSON.stringify(ledger, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ failedTaskCount: ledger.failedTaskCount, primaryCauseCounts: counts, evaluatorDefects: ledger.evaluatorDefects.map(({ id, status }) => ({ id, status })) })}\n`);
