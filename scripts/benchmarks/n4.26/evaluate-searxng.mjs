#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const endpoint = process.env.CLERVO_N426_SEARXNG_URL ?? 'http://127.0.0.1:18888';
const corpus = JSON.parse(await readFile(new URL('../../../benchmarks/n4.26/corpus.v1.json', import.meta.url), 'utf8'));
const rows = [];

function quantile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)] ?? 0;
}

for (const task of corpus.tasks) {
  if (['unsupported', 'bring_your_own_credentials', 'user_authorized_session', 'customer_supplied_data'].includes(task.accessMode)) continue;
  const url = new URL('/search', endpoint);
  url.search = new URLSearchParams({ q: task.query, format: 'json', engines: 'wikipedia', language: task.locale.language }).toString();
  const started = performance.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    const payload = await response.json();
    const results = Array.isArray(payload.results) ? payload.results : [];
    const terms = task.expectedTerms.map((term) => term.toLocaleLowerCase('en-US'));
    const relevant = results.filter((result) => {
      const text = `${result.title ?? ''} ${result.content ?? ''}`.toLocaleLowerCase('en-US');
      return terms.filter((term) => text.includes(term)).length >= Math.max(1, Math.ceil(terms.length / 2));
    });
    const observed = terms.filter((term) => results.some((result) => `${result.title ?? ''} ${result.content ?? ''}`.toLocaleLowerCase('en-US').includes(term)));
    rows.push({ id: task.id, family: task.family, status: response.status, durationMs: performance.now() - started, resultCount: results.length, recall: terms.length === 0 ? 0 : new Set(observed).size / terms.length, precision: results.length === 0 ? 0 : relevant.length / results.length, unresponsiveEngines: payload.unresponsive_engines ?? [], results: results.map((result) => ({ title: result.title, url: result.url, snippetSha256: `sha256:${createHash('sha256').update(result.content ?? '').digest('hex')}` })) });
  } catch (error) {
    rows.push({ id: task.id, family: task.family, status: 0, durationMs: performance.now() - started, resultCount: 0, recall: 0, precision: 0, code: error instanceof Error ? error.name : 'baseline_failed', results: [] });
  }
}

const mean = (name) => rows.reduce((sum, row) => sum + row[name], 0) / Math.max(1, rows.length);
const artifact = {
  schemaVersion: 'clervo.n4.26.searxng-baseline.v1',
  generatedAt: new Date().toISOString(),
  identity: { repository: 'https://github.com/searxng/searxng', commit: '057a77168d3175ce2e42e5b10f46a8df073886d5', packageVersion: '2026.7.31+057a77168', engine: 'wikipedia', bind: '127.0.0.1:18888', productionDependency: false },
  tasks: rows.length,
  recall: Number(mean('recall').toFixed(4)),
  precision: Number(mean('precision').toFixed(4)),
  successfulResponseRate: Number((rows.filter((row) => row.status === 200).length / Math.max(1, rows.length)).toFixed(4)),
  p95LatencyMs: Number(quantile(rows.map((row) => row.durationMs), 0.95).toFixed(2)),
  providerChargeUsd: 0,
  observedFailure: rows.some((row) => row.unresponsiveEngines?.flat().some((value) => String(value).includes('Suspended'))) ? 'wikimedia_upstream_suspended_after_bounded_requests' : null,
  rows,
};
await writeFile(new URL('../../../docs/evidence/n4.26/searxng-baseline.v1.json', import.meta.url), `${JSON.stringify(artifact, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ tasks: artifact.tasks, recall: artifact.recall, precision: artifact.precision, p95LatencyMs: artifact.p95LatencyMs })}\n`);
