#!/usr/bin/env node

// Focused B7 production observer. It reuses the frozen qualification set and
// proves only the shared integrated contracts: one no-charge replay plus one
// unpaid challenge per materially distinct modality. It never sends payment.

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const registryUrl = new URL('../../packages/catalog/live-registry.json', import.meta.url);
const modelsUrl = new URL('../../generated/b7-ai/public/models.json', import.meta.url);
const paidProofUrl = new URL('../../infra/production/gcp/ai-x402-proof.v1.json', import.meta.url);
const registry = JSON.parse(await readFile(registryUrl, 'utf8'));
const models = JSON.parse(await readFile(modelsUrl, 'utf8'));
const paidProof = JSON.parse(await readFile(paidProofUrl, 'utf8'));
const currentPaidChatModel = models.data
  .filter(({ clervo }) => clervo.identityKind === 'canonical'
    && clervo.publicSellable === true
    && clervo.availability === 'available'
    && clervo.billingMode === 'metered'
    && clervo.productIds.includes('ai.chat'))
  .map(({ id }) => id)
  .sort()[0];
assert.equal(typeof currentPaidChatModel, 'string', 'current paid chat model missing');
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

const freeRequest = {
  model: 'clervo/gemma-4-26b-a4b-it',
  input: { kind: 'chat', messages: [{ role: 'user', content: 'Reply with the single word ready.' }], responseFormat: 'text', stream: false },
  maximumOutputTokens: 16,
};
const freeKey = 'idem_b7_final_free_20260811b';
const freeInitial = await json('/v1/ai/execute', {
  method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': freeKey }, body: JSON.stringify(freeRequest),
});
assert.equal(freeInitial.response.status, 200);
assert.equal(freeInitial.body.fundingMode, 'free');
assert.equal(freeInitial.body.exactModelId, freeRequest.model);
const free = await json('/v1/ai/execute', {
  method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': freeKey }, body: JSON.stringify(freeRequest),
});
assert.equal(free.response.status, 200);
assert.equal(free.body.fundingMode, 'free');
assert.equal(free.body.replayed, true);
assert.equal(free.body.exactModelId, freeRequest.model);
assert.equal(free.body.operationId, freeInitial.body.operationId);
assert.equal(free.response.headers.get('idempotency-replayed'), 'true');

const encodedImage = Buffer.from('bounded-image').toString('base64');
const cases = [
  ['chat', currentPaidChatModel, { kind: 'chat', messages: [{ role: 'user', content: 'Reply with the single word ready.' }], responseFormat: 'text', stream: false }, 16],
  ['embedding', 'clervo/gemini-embedding-001', { kind: 'embedding', inputs: ['bounded quote probe'] }],
  ['image', 'clervo/gemini-3.1-flash-lite-image', { kind: 'image', prompt: 'A plain red square on a white background.', size: '1024x1024', quality: 'low', count: 1 }],
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

function paidProofValidation() {
  const expectedProducts = ['ai.chat'];
  const expectedModels = [currentPaidChatModel];
  const expectedCharges = ['1000'];
  const operations = Array.isArray(paidProof.operations) ? paidProof.operations : [];
  const unique = (field) => new Set(operations.map((operation) => operation[field])).size === operations.length;
  const proofChallenges = expectedProducts.map((productId) => paidProof.observedChallenges?.[productId]);
  const liveChallenges = [challenges.find(({ kind }) => kind === 'chat')];
  const accepted = paidProof.schemaVersion === 'clervo.ai-x402-proof.v1'
    && paidProof.state === 'settled_reconciled'
    && paidProof.publicOrigin === `${origin}/`
    && paidProof.endpoint === `${origin}/v1/ai/execute`
    && paidProof.releaseCommit === health.body.releaseId
    && paidProof.network === 'eip155:8453'
    && paidProof.asset === '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
    && paidProof.payTo === '0xBd11d82d8Dbd01Ba3eed279d3bACf74659fFca28'
    && paidProof.facilitatorUrl === 'https://api.cdp.coinbase.com/platform/v2/x402'
    && paidProof.ownerAuthorization?.maximumSpendAtomic === '1000'
    && paidProof.ownerAuthorization?.maximumExecutionCount === 1
    && JSON.stringify(paidProof.ownerAuthorization?.operationsInOrder) === JSON.stringify(expectedProducts)
    && JSON.stringify(paidProof.ownerAuthorization?.amountAtomicByOperation) === JSON.stringify(Object.fromEntries(expectedProducts.map((productId, index) => [productId, expectedCharges[index]])))
    && paidProof.ownerAuthorization?.payerBalanceCapAtomic === '300000'
    && paidProof.ownerAuthorization?.supplierCostCeilingAtomic === '0'
    && paidProof.ownerAuthorization?.paymentEffects === 1
    && paidProof.ownerAuthorization?.automaticRetry === false
    && paidProof.ownerAuthorization?.immediateReconciliationAfterNon200OrUnknown === true
    && operations.length === 1
    && JSON.stringify(operations.map(({ productId }) => productId)) === JSON.stringify(expectedProducts)
    && JSON.stringify(operations.map(({ model }) => model)) === JSON.stringify(expectedModels)
    && JSON.stringify(operations.map(({ customerChargeAtomic }) => customerChargeAtomic)) === JSON.stringify(expectedCharges)
    && ['operationId', 'receiptId', 'requestHash', 'resultHash', 'transactionHash'].every(unique)
    && operations.every((operation) => operation.supplierCostAtomic === '0'
      && operation.settlementStatus === 'settled'
      && operation.chainStatus === 'confirmed'
      && operation.exactTransferCount === 1
      && operation.usefulResult === true
      && operation.resultSummary?.kind === 'chat'
      && operation.resultSummary?.contentNonEmpty === true
      && operation.replay?.sameOperation === true
      && operation.replay?.sameReceipt === true
      && operation.replay?.sameResult === true
      && operation.replay?.idempotencyReplayed === true
      && operation.replay?.paymentHeaderSent === false
      && operation.replay?.secondAuthorization === false
      && operation.replay?.secondUpstreamExecution === false
      && operation.replay?.secondSettlement === false
      && operation.replay?.secondCharge === false
      && operation.durable?.state === 'completed'
      && operation.durable?.operationRows === 1
      && operation.durable?.accountingRows === 1)
    && proofChallenges.every((challenge, index) => challenge?.status === 402
      && challenge?.model === expectedModels[index]
      && challenge?.amountAtomic === expectedCharges[index]
      && challenge?.networkMatched === true && challenge?.assetMatched === true && challenge?.payToMatched === true
      && challenge?.facilitatorMatched === true && challenge?.productMatched === true && challenge?.modelMatched === true
      && challenge?.freshAtAuthorization === true && challenge?.paymentAttemptedBeforeOwnerAuthorization === false)
    && liveChallenges.every((challenge, index) => challenge?.model === expectedModels[index]
      && challenge?.amountAtomic === expectedCharges[index]
      && challenge?.offer?.network === paidProof.network && challenge?.offer?.asset === paidProof.asset && challenge?.offer?.payTo === paidProof.payTo)
    && operations.reduce((sum, operation) => sum + BigInt(operation.customerChargeAtomic), 0n) === 1000n
    && paidProof.observedBalances?.payerDeltaAtomic === '-1000'
    && paidProof.observedBalances?.receiverDeltaAtomic === '1000'
    && paidProof.observedBalances?.authorizedAllowanceRemainingAtomic === '0'
    && paidProof.observedDurability?.databaseIdentityVerified === true
    && paidProof.observedDurability?.operationRows === 1
    && paidProof.observedDurability?.accountingRowsForOperations === 1
    && paidProof.observedDurability?.receiverLedgerChainValid === true
    && paidProof.observedDurability?.receiverLedgerBalanced === true
    && paidProof.observedDurability?.ambiguousOperations === 0
    && paidProof.proofClassification?.proofLevel === 'paid_outcome_verified'
    && paidProof.proofClassification?.ownerFunded === true
    && paidProof.proofClassification?.commercialMechanismVerified === true
    && paidProof.proofClassification?.revenueEvidence === false
    && paidProof.proofClassification?.demandEvidence === false
    && paidProof.proofClassification?.unrelatedCustomerEvidence === false
    && paidProof.proofClassification?.externallyRepeatedClaimAllowed === false
    && paidProof.cleanup?.proofSurfacesQuarantined === true
    && paidProof.cleanup?.temporaryReconciliationJobRemoved === true;
  return accepted ? {
    accepted: true, reason: null, proofLevel: 'paid_outcome_verified', source: 'infra/production/gcp/ai-x402-proof.v1.json',
    releaseCommit: paidProof.releaseCommit, operationCount: operations.length, totalChargeAtomic: '1000', usefulResultCount: 1,
    replayNoSecondChargeCount: 1, ownerFunded: true, revenueEvidence: false, demandEvidence: false, externallyRepeated: false,
  } : { accepted: false, reason: 'paid_proof_invariant_failed' };
}

const paidOutcome = paidProofValidation();

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
  paidOutcome,
  models: modelStates,
};
registry.summary.aiCatalog = counts;
const index = registry.products.findIndex(({ id }) => id === 'ai');
assert.notEqual(index, -1);
registry.products[index] = {
  id: 'ai', label: 'AI',
  operations: ['ai.chat', 'ai.embed', 'ai.image', 'ai.speech', 'ai.video', 'ai.music', 'ai.virtual_try_on'],
  state: 'live', reason: null, expectedReturnAt: null, publiclyReachable: true,
  proof: paidOutcome.accepted ? paidOutcome.proofLevel : 'quote_observed_unpaid', observedQuote,
  freeEntry: { route: `${origin}/v1/ai/execute`, modelId: free.body.exactModelId, replayVerified: true, paymentRequired: false },
  evidence: { probed: true, releaseId: health.body.releaseId, frozenCanonicalModels: models.clervo.inventory.canonicalModels, aliases: models.clervo.inventory.aliases, callableIds: models.clervo.inventory.callableIds, sellableIds: modelStates.filter(({ sellable }) => sellable).length, representativeModalities: challenges.length, freeOutcomeObserved: true, paidOutcome },
};

await writeFile(registryUrl, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
process.stdout.write(`B7 live AI probe: PASS (${models.clervo.inventory.callableIds} IDs, ${modelStates.filter(({ sellable }) => sellable).length} sellable, ${challenges.length} paid modality challenges, one free replay, ${paidOutcome.proofLevel ?? 'quote_observed_unpaid'})\n`);
