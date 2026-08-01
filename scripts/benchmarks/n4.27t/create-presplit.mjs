#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outputRoot = path.join(root, 'benchmarks/n4.27t');
const generatedAt = '2026-08-01T19:11:00.000Z';

const developer = (id, query, expectedUrl, lookupMode) => Object.freeze({
  id,
  family: 'developer_agent_retrieval',
  kind: 'developer_registry',
  query,
  lookupMode,
  accessMode: 'official_api',
  answerable: true,
  maximumResults: 5,
  providerApiCostUsd: 0,
  expectedCanonicalUrls: Object.freeze([expectedUrl]),
});

const developmentTasks = Object.freeze([
  developer('dev-npm-ajv', 'npm package ajv current version', 'https://www.npmjs.com/package/ajv', 'npm_exact'),
  developer('dev-npm-tsx', 'npm package tsx current version', 'https://www.npmjs.com/package/tsx', 'npm_exact'),
  developer('dev-npm-pino', 'npm package pino current version', 'https://www.npmjs.com/package/pino', 'npm_exact'),
  developer('dev-npm-ky', 'npm package ky current version', 'https://www.npmjs.com/package/ky', 'npm_exact'),
  developer('dev-npm-commander', 'npm package commander current version', 'https://www.npmjs.com/package/commander', 'npm_exact'),
  developer('dev-github-deno', 'GitHub repository denoland/deno current release', 'https://github.com/denoland/deno', 'github_exact'),
  developer('dev-github-bun', 'GitHub repository oven-sh/bun current release', 'https://github.com/oven-sh/bun', 'github_exact'),
  developer('dev-github-pnpm', 'GitHub repository pnpm/pnpm current release', 'https://github.com/pnpm/pnpm', 'github_exact'),
  developer('dev-github-biome', 'GitHub repository biomejs/biome current release', 'https://github.com/biomejs/biome', 'github_exact'),
  developer('dev-github-uv', 'GitHub repository astral-sh/uv current release', 'https://github.com/astral-sh/uv', 'github_exact'),
  developer('dev-search-sveltekit', 'GitHub repository SvelteKit web framework SDK', 'https://github.com/sveltejs/kit', 'github_search'),
  developer('dev-search-jose', 'npm package JSON web token JOSE', 'https://www.npmjs.com/package/jose', 'npm_search'),
]);

const validationTasks = Object.freeze([
  developer('val-npm-execa', 'npm package execa current version', 'https://www.npmjs.com/package/execa', 'npm_exact'),
  developer('val-npm-nanoid', 'npm package nanoid current version', 'https://www.npmjs.com/package/nanoid', 'npm_exact'),
  developer('val-npm-dotenv', 'npm package dotenv current version', 'https://www.npmjs.com/package/dotenv', 'npm_exact'),
  developer('val-npm-prettier', 'npm package prettier current version', 'https://www.npmjs.com/package/prettier', 'npm_exact'),
  developer('val-npm-h3', 'npm package h3 current version', 'https://www.npmjs.com/package/h3', 'npm_exact'),
  developer('val-github-astro', 'GitHub repository withastro/astro current release', 'https://github.com/withastro/astro', 'github_exact'),
  developer('val-github-remotion', 'GitHub repository remotion-dev/remotion current release', 'https://github.com/remotion-dev/remotion', 'github_exact'),
  developer('val-github-elysia', 'GitHub repository elysiajs/elysia current release', 'https://github.com/elysiajs/elysia', 'github_exact'),
  developer('val-github-docusaurus', 'GitHub repository facebook/docusaurus current release', 'https://github.com/facebook/docusaurus', 'github_exact'),
  developer('val-github-sentry-js', 'GitHub repository getsentry/sentry-javascript current release', 'https://github.com/getsentry/sentry-javascript', 'github_exact'),
]);

const browserFixtures = (split) => Object.freeze({
  javascript: Object.freeze(Array.from({ length: split === 'development' ? 4 : 12 }, (_value, index) => ({
    id: `${split}-js-${String(index + 1).padStart(2, '0')}`,
    path: `/n427t/${split}/js/${String(index + 1).padStart(2, '0')}`,
    marker: `CLERVO_N427T_${split.toUpperCase()}_JS_${String(index + 1).padStart(2, '0')}`,
    requiresJavaScript: true,
  }))),
  hostile: Object.freeze(Array.from({ length: split === 'development' ? 2 : 8 }, (_value, index) => ({
    id: `${split}-hostile-${String(index + 1).padStart(2, '0')}`,
    path: `/n427t/${split}/hostile/${String(index + 1).padStart(2, '0')}`,
    marker: `CLERVO_N427T_${split.toUpperCase()}_HOSTILE_${String(index + 1).padStart(2, '0')}`,
    authority: 'untrusted_evidence_only',
  }))),
});

const corpus = (split, tasks) => ({
  schemaVersion: 'clervo.n4.27t.corpus.v1',
  ticket: 'N4.27T',
  split,
  generatedAt,
  source: 'new_independent_pre_split_procedure',
  n427sFinalMaterialUsed: false,
  tasks: tasks.map(({ expectedCanonicalUrls: _labels, ...task }) => task),
  browserFixtures: browserFixtures(split),
  executionLimit: split === 'validation' ? 1 : null,
  status: split === 'validation' ? 'frozen_not_executed' : 'development_only',
});
const labels = (split, tasks) => ({
  schemaVersion: 'clervo.n4.27t.labels.v1',
  ticket: 'N4.27T',
  split,
  generatedAt,
  labels: tasks.map(({ id, expectedCanonicalUrls, answerable }) => ({ id, answerable, expectedCanonicalUrls })),
  postFreezeEditingAllowed: false,
});
const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

await mkdir(outputRoot, { recursive: true });
const artifacts = new Map([
  ['development-corpus.v1.json', stable(corpus('development', developmentTasks))],
  ['development-labels.v1.json', stable(labels('development', developmentTasks))],
  ['validation-corpus.v1.json', stable(corpus('validation', validationTasks))],
  ['validation-labels.v1.json', stable(labels('validation', validationTasks))],
]);
for (const [name, contents] of artifacts) await writeFile(path.join(outputRoot, name), contents, { flag: 'wx' });

const freeze = {
  schemaVersion: 'clervo.n4.27t.split-freeze.v1',
  ticket: 'N4.27T',
  frozenAt: generatedAt,
  sequence: 'split_and_hash_before_repair_implementation',
  n427sFinalMaterialUsed: false,
  development: { developerTasks: developmentTasks.length, javascriptFixtures: 4, hostileFixtures: 2 },
  validation: { developerTasks: validationTasks.length, javascriptFixtures: 12, hostileFixtures: 8, maximumExecutions: 1, executed: false },
  leakageRules: [
    'implementation_and_focused_tests_may_read_development_artifacts_only',
    'validation_artifacts_are_reserved_for_a_later_isolated_once_only_qualification',
    'no_query_identity_url_marker_or_label_may_move_between_splits',
    'n4.27s_final_corpus_labels_raw_results_evaluator_and_scorecard_are_excluded',
  ],
  artifactSha256: Object.fromEntries([...artifacts].map(([name, contents]) => [name, digest(contents)])),
};
await writeFile(path.join(outputRoot, 'split-freeze.v1.json'), stable(freeze), { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ outputRoot: 'benchmarks/n4.27t', ...freeze })}\n`);
