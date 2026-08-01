#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createN427sSourceAdapters } from '../../../infra/n4.27s/source-adapters.mjs';

const corpus = JSON.parse(await readFile(new URL('../../../benchmarks/n4.27s/staging-corpus.v1.json', import.meta.url)));
const labels = JSON.parse(await readFile(new URL('../../../benchmarks/n4.27s/staging-labels.v1.json', import.meta.url)));
const userAgent = 'Clervo-N4.27S-Staging/1.0 (mo@clervo.dev)';

async function transport(request) {
  const remaining = Math.max(1, Date.parse(request.deadlineAt) - Date.now());
  const controller = new AbortController();
  const cancel = () => controller.abort();
  request.signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(), remaining);
  try {
    const response = await fetch(request.url, { headers: request.headers, redirect: 'error', signal: controller.signal });
    const body = await response.text();
    return { status: response.status, headers: Object.fromEntries(response.headers), body };
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', cancel);
  }
}

const adapters = createN427sSourceAdapters({ transport, userAgent, mailto: 'mo@clervo.dev' });
const byClass = new Map(adapters.map((adapter) => [adapter.sourceClass, adapter]));
byClass.set('woocommerce_store_api', byClass.get('public_catalog'));
byClass.set('sec_edgar', byClass.get('corporate_disclosure'));
byClass.set('crossref', byClass.get('research_registry'));
const labelByTask = new Map(labels.labels.map((label) => [label.taskId, label]));
const observations = [];
for (const task of corpus.tasks) {
  const label = labelByTask.get(task.id);
  const adapter = byClass.get(task.sourceClass);
  const started = performance.now();
  let results = [];
  let error;
  try {
    const generatedAt = new Date().toISOString();
    results = await adapter.search({ query: task.query, language: task.locale.language, region: task.locale.region, maximumResults: 5, retrievedAt: generatedAt, deadlineAt: new Date(Date.now() + 8_000).toISOString(), signal: new AbortController().signal });
  } catch (caught) { error = caught instanceof Error ? caught.message : 'source_probe_failed'; }
  const relevant = results.filter((result) => label.expectedUrlPrefixes.some((prefix) => result.currentUrl.startsWith(prefix)) || label.expectedTerms.length > 0 && label.expectedTerms.every((term) => `${result.title} ${result.snippet}`.toLocaleLowerCase('en-US').includes(term.toLocaleLowerCase('en-US'))));
  observations.push({ taskId: task.id, sourceClass: task.sourceClass, answerable: task.answerable, durationMs: Number((performance.now() - started).toFixed(3)), resultCount: results.length, relevantCount: relevant.length, observedUrls: results.map((result) => result.currentUrl), error, passed: task.answerable ? relevant.length > 0 : relevant.length === 0 });
  await new Promise((resolve) => setTimeout(resolve, task.sourceClass === 'research_registry' ? 120 : 40));
}
const artifact = { schemaVersion: 'clervo.n4.27s.label-validation.v1', validatedAt: new Date().toISOString(), method: 'deterministic_official_interface_probe_before_implementation_freeze', tasks: observations.length, passed: observations.filter((item) => item.passed).length, failed: observations.filter((item) => !item.passed).length, observations };
const text = `${JSON.stringify(artifact, null, 2)}\n`;
await mkdir(new URL('../../../docs/evidence/n4.27s/', import.meta.url), { recursive: true });
await writeFile(new URL('../../../docs/evidence/n4.27s/label-validation.v1.json', import.meta.url), text);
process.stdout.write(`${JSON.stringify({ tasks: artifact.tasks, passed: artifact.passed, failed: artifact.failed, sha256: `sha256:${createHash('sha256').update(text).digest('hex')}` })}\n`);
