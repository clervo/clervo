import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('Clervo gateway quality corpus is fixed, deterministic, and payload-safe', async () => {
  const corpus = JSON.parse(await readFile(path.join(root, 'benchmarks/stage6/clervo-gateway-quality-screen.v1.json'), 'utf8'));
  assert.equal(corpus.schemaVersion, 'clervo.stage6.gateway-quality-corpus.v1');
  assert.equal(corpus.tasks.length, 10);
  assert.equal(new Set(corpus.tasks.map(({ taskId }) => taskId)).size, 10);
  assert.deepEqual([...new Set(corpus.tasks.map(({ category }) => category))].sort(), ['coding', 'commerce_safety', 'grounding', 'instruction_following', 'multilingual', 'reasoning', 'security', 'structured_output']);
  assert.ok(corpus.tasks.every(({ messages, expected }) => Array.isArray(messages) && messages.length > 0 && expected !== undefined));
  assert.equal(JSON.stringify(corpus).includes('API_KEY'), false);
});

test('quality screen keeps calibration history and supports sellable provisional positioning', async () => {
  const evidence = JSON.parse(await readFile(path.join(root, 'docs/evidence/stage6/clervo-gateway-quality-screen.v1.json'), 'utf8'));
  assert.equal(evidence.ownerCashSpentUsd, 0);
  assert.equal(evidence.supplierBalanceDebitKnown, false);
  assert.equal(evidence.secretValuesRecorded, false);
  assert.equal(evidence.promptOrOutputPayloadsRecorded, false);
  assert.deepEqual(evidence.finalResults.map(({ model, scoreBasisPoints }) => [model, scoreBasisPoints]), [
    ['gpt-5.6-luna', 10000],
    ['gpt-5.6-terra', 9000],
    ['gpt-5.6-sol', 10000],
  ]);
  assert.equal(evidence.calibration.finalRunComplete, true);
  assert.match(evidence.decision, /^sellable_/u);
});
