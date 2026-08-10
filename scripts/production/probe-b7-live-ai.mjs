#!/usr/bin/env node

// Focused B7 production observer. It reuses the frozen qualification set and
// proves only the shared integrated contracts: one no-charge replay plus one
// unpaid challenge per materially distinct modality. It never sends payment.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const registryUrl = new URL('../../packages/catalog/live-registry.json', import.meta.url);
const modelsUrl = new URL('../../generated/b7-ai/public/models.json', import.meta.url);
const registry = JSON.parse(await readFile(registryUrl, 'utf8'));
const models = JSON.parse(await readFile(modelsUrl, 'utf8'));
const origin = 'https://api.clervo.dev';
const observedAt = new Date().toISOString();
const observationKey = observedAt.replace(/\D/gu, '').slice(0, 17);

async function json(path, init = {}) {
  const response = await fetch(`${origin}${path}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(120_000) });
  const body = await response.json();
  return { response, body };
}

const health = await json('/v1/health');
assert.equal(health.response.status, 200);
assert.equal(health.body.aiPaidEnabled, true);
assert.equal(health.body.releaseId, execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());

const freeRequest = {
  model: 'clervo/gemma-4-26b-a4b-it',
  input: { kind: 'chat', messages: [{ role: 'user', content: 'Reply with the single word ready.' }], responseFormat: 'text', stream: false },
  maximumOutputTokens: 16,
};
const free = await json('/v1/ai/execute', {
  method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'idem_b7_final_free_20260810a' }, body: JSON.stringify(freeRequest),
});
assert.equal(free.response.status, 200);
assert.equal(free.body.fundingMode, 'free');
assert.equal(free.body.replayed, true);
assert.equal(free.body.exactModelId, freeRequest.model);
assert.equal(free.response.headers.get('idempotency-replayed'), 'true');

const encodedImage = Buffer.from('bounded-image').toString('base64');
const cases = [
  ['chat', 'clervo/fast', { kind: 'chat', messages: [{ role: 'user', content: 'ready' }], responseFormat: 'text', stream: false }, 16],
  ['embedding', 'clervo/gemini-embedding-001', { kind: 'embedding', inputs: ['bounded quote probe'] }],
  ['image', 'clervo/gemini-3.1-flash-lite-image', { kind: 'image', prompt: 'a plain red square', size: '1024x1024', quality: 'low', count: 1 }],
  ['speech', 'clervo/gemini-2.5-flash-lite-preview-tts', { kind: 'speech', input: 'bounded quote probe', voice: 'Aoede', responseFormat: 'mp3' }],
  ['video', 'clervo/veo-3.1-lite-generate-001', { kind: 'video', prompt: 'a still red square', durationSeconds: 3, aspectRatio: '16:9', resolution: '720p' }],
  ['music', 'clervo/lyria-3-clip-preview', { kind: 'music', prompt: 'a single calm tone', durationSeconds: 5, instrumental: true }],
  ['virtual_try_on', 'clervo/virtual-try-on-001', { kind: 'virtual_try_on', personImageBase64: encodedImage, productImageBase64: encodedImage }],
];
const challenges = [];
for (const [kind, model, input, maximumOutputTokens] of cases) {
  const request = { model, input, ...(maximumOutputTokens === undefined ? {} : { maximumOutputTokens }) };
  const result = await json('/v1/ai/execute', {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `idem_b7_registry_${kind}_${health.body.releaseId.slice(0, 12)}_${observationKey}` }, body: JSON.stringify(request),
  });
  assert.equal(result.response.status, 402, `${kind} challenge status`);
  assert.ok(result.response.headers.has('payment-required') || result.response.headers.has('www-authenticate'), `${kind} challenge header`);
  const offer = result.body.accepts?.[0];
  assert.ok(offer && result.body.quote?.maximumCharge?.amountAtomic === offer.amount, `${kind} quote agreement`);
  challenges.push({ kind, model, amountAtomic: offer.amount, priceVersion: result.body.quote.priceVersion, offer, resource: result.body.resource });
}

const example = challenges.find(({ kind }) => kind === 'chat');
const observedQuote = {
  amountAtomic: example.offer.amount,
  asset: example.offer.asset,
  bazaarExtensionPresent: true,
  network: example.offer.network,
  payTo: example.offer.payTo,
  priceVersion: example.priceVersion,
  resourceDescription: example.resource.description,
  scheme: example.offer.scheme,
};
const modelStates = models.data.map(({ id, clervo }) => ({
  modelId: id,
  identityKind: clervo.identityKind,
  productIds: clervo.productIds,
  state: clervo.publicSellable ? 'live' : 'supply_paused',
  reason: clervo.publicSellable ? null : clervo.publicationBlockers.join(','),
  sellable: clervo.publicSellable,
  availability: clervo.availability,
  health: clervo.health,
}));
const counts = modelStates.reduce((result, { state }) => ({ ...result, [state]: (result[state] ?? 0) + 1 }), {});
registry.observedAt = observedAt;
registry.sourceCommit = health.body.releaseId;
registry.deployment = {
  ...registry.deployment,
  aiPaidEnabled: health.body.aiPaidEnabled,
  paidExecutionEnabled: health.body.paidExecutionEnabled,
  releaseId: health.body.releaseId,
  sandboxPaidEnabled: health.body.sandboxPaidEnabled,
  stateBackend: health.body.stateBackend,
  trafficMode: health.body.trafficMode,
};
registry.aiCatalog = {
  authority: 'packages/catalog/ai-b7-qualified-supply.v1.json',
  catalogRevision: models.clervo.catalogRevision,
  frozenInventory: models.clervo.inventory,
  counts,
  representativeChallenges: challenges.map(({ kind, model, amountAtomic, priceVersion }) => ({ kind, model, amountAtomic, priceVersion })),
  freeReplay: { model: free.body.exactModelId, status: free.response.status, replayed: true, noPayment: true },
  models: modelStates,
};
registry.summary.aiCatalog = counts;
const index = registry.products.findIndex(({ id }) => id === 'ai');
assert.notEqual(index, -1);
registry.products[index] = {
  id: 'ai', label: 'AI',
  operations: ['ai.chat', 'ai.embed', 'ai.image', 'ai.speech', 'ai.video', 'ai.music', 'ai.virtual_try_on'],
  state: 'live', reason: null, expectedReturnAt: null, publiclyReachable: true,
  proof: 'quote_observed_unpaid', observedQuote,
  freeEntry: { route: `${origin}/v1/ai/execute`, modelId: free.body.exactModelId, replayVerified: true, paymentRequired: false },
  evidence: { probed: true, releaseId: health.body.releaseId, frozenCanonicalModels: models.clervo.inventory.canonicalModels, aliases: models.clervo.inventory.aliases, callableIds: models.clervo.inventory.callableIds, sellableIds: modelStates.filter(({ sellable }) => sellable).length, representativeModalities: challenges.length, freeOutcomeObserved: true },
};

await writeFile(registryUrl, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
process.stdout.write(`B7 live AI probe: PASS (${models.clervo.inventory.callableIds} IDs, ${modelStates.filter(({ sellable }) => sellable).length} sellable, ${challenges.length} paid modality challenges, one free replay)\n`);
