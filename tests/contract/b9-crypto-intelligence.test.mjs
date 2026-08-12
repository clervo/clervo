import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));

test('B9 historical paid proof remains intact while current-release public truth fails closed to quote-only', async () => {
  const [release, paidProof, registry, discovery, pricing] = await Promise.all([
    json('infra/production/gcp/crypto-public-release.v1.json'),
    json('infra/production/gcp/crypto-x402-proof.v1.json'),
    json('packages/catalog/live-registry.json'),
    json('generated/public/.well-known/clervo.json'),
    json('packages/catalog/crypto-product-pricing.v1.json'),
  ]);
  const product = registry.products.find(({ id }) => id === 'crypto_intelligence');
  assert.equal(release.releaseCommit, paidProof.releaseCommit);
  assert.notEqual(release.releaseCommit, registry.deployment.releaseId);
  assert.equal(release.state, 'public_quote_verified_paid_outcome_pending');
  assert.deepEqual([release.supply.technicalQualification, release.supply.commercialPermission, release.supply.publicSellable, release.supply.rawApiResaleAllowed], ['qualified', 'approved_value_added', true, false]);
  assert.deepEqual(Object.keys(release.productionSourceProof).filter((key) => ['ethereum', 'base'].includes(key)).map((key) => [key, release.productionSourceProof[key].served, release.productionSourceProof[key].freshness]), [['ethereum', true, 'fresh'], ['base', true, 'fresh']]);
  assert.equal(release.productionSourceProof.thirdPartyLabelsUsed, false);
  assert.equal(release.productionSourceProof.transactionSubmissionCalls, 0);
  assert.equal(product.state, 'live');
  assert.equal(product.proof, 'quote_observed_unpaid');
  assert.deepEqual(product.evidence.paidOutcome, { accepted: false, reason: 'paid_proof_invariant_failed' });
  assert.equal(product.observedQuote.amountAtomic, '4000');
  assert.deepEqual(Object.fromEntries(Object.entries(registry.bazaar.resources.find(({ productId }) => productId === 'crypto_intelligence')).filter(([key]) => ['valid', 'indexed', 'indexActive'].includes(key))), { indexActive: true, indexed: true, valid: true });
  assert.deepEqual(release.publicOperations, pricing.products.map(({ productId, customerPriceMicrousd }) => ({ productId, amountAtomic: String(customerPriceMicrousd) })));
  assert.deepEqual(discovery.products.filter(({ productId }) => productId.startsWith('crypto.')).map(({ productId, publicAvailable, commercialProof }) => [productId, publicAvailable, commercialProof]), [
    ['crypto.wallet.balances', true, undefined],
    ['crypto.wallet.tokens', true, undefined],
    ['crypto.wallet.transactions', true, undefined],
    ['crypto.wallet.report', true, undefined],
  ]);
  assert.deepEqual([release.commerce.paymentAttempted, release.commerce.paymentEffects, release.commerce.paidOutcomeVerified, release.commerce.revenueEvidence], [false, 0, false, false]);
  assert.deepEqual(paidProof.operations.map(({ productId, customerChargeAtomic, usefulResult, chainStatus, exactTransferCount }) => ({ productId, customerChargeAtomic, usefulResult, chainStatus, exactTransferCount })), [
    { productId: 'crypto.wallet.report', customerChargeAtomic: '4000', usefulResult: true, chainStatus: 'confirmed', exactTransferCount: 1 },
    { productId: 'crypto.wallet.transactions', customerChargeAtomic: '3000', usefulResult: true, chainStatus: 'confirmed', exactTransferCount: 1 },
  ]);
  assert.equal(paidProof.operations.every(({ replay }) => replay.sameOperation && replay.sameReceipt && replay.sameResult && replay.idempotencyReplayed && !replay.paymentHeaderSent && !replay.secondAuthorization && !replay.secondUpstreamExecution && !replay.secondCharge), true);
  assert.deepEqual([paidProof.observedBalances.payerDeltaAtomic, paidProof.observedBalances.receiverDeltaAtomic, paidProof.observedDurability.operationRows, paidProof.observedDurability.accountingRowsForOperations, paidProof.observedDurability.receiverLedgerChainValid, paidProof.observedDurability.receiverLedgerBalanced], ['-7000', '7000', 2, 2, true, true]);
  assert.deepEqual([paidProof.proofClassification.ownerFunded, paidProof.proofClassification.revenueEvidence, paidProof.proofClassification.demandEvidence, paidProof.proofClassification.externallyRepeatedClaimAllowed], [true, false, false, false]);
  assert.equal(release.cleanup.temporaryProbeJobRemoved, true);
  assert.equal(release.cleanup.failedCandidatesNeverServedTraffic, true);
});
