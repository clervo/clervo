import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));

test('B9 public release binds qualified value-added supply, both declared chains, exact prices, and unpaid proof truth', async () => {
  const [release, registry, discovery, pricing] = await Promise.all([
    json('infra/production/gcp/crypto-public-release.v1.json'),
    json('packages/catalog/live-registry.json'),
    json('generated/public/.well-known/clervo.json'),
    json('packages/catalog/crypto-product-pricing.v1.json'),
  ]);
  const product = registry.products.find(({ id }) => id === 'crypto_intelligence');
  assert.equal(release.releaseCommit, registry.deployment.releaseId);
  assert.equal(release.state, 'public_quote_verified_paid_outcome_pending');
  assert.deepEqual([release.supply.technicalQualification, release.supply.commercialPermission, release.supply.publicSellable, release.supply.rawApiResaleAllowed], ['qualified', 'approved_value_added', true, false]);
  assert.deepEqual(Object.keys(release.productionSourceProof).filter((key) => ['ethereum', 'base'].includes(key)).map((key) => [key, release.productionSourceProof[key].served, release.productionSourceProof[key].freshness]), [['ethereum', true, 'fresh'], ['base', true, 'fresh']]);
  assert.equal(release.productionSourceProof.thirdPartyLabelsUsed, false);
  assert.equal(release.productionSourceProof.transactionSubmissionCalls, 0);
  assert.equal(product.state, 'live');
  assert.equal(product.proof, 'quote_observed_unpaid');
  assert.equal(product.observedQuote.amountAtomic, '4000');
  assert.equal(registry.bazaar.resources.find(({ productId }) => productId === 'crypto_intelligence').valid, true);
  assert.deepEqual(release.publicOperations, pricing.products.map(({ productId, customerPriceMicrousd }) => ({ productId, amountAtomic: String(customerPriceMicrousd) })));
  assert.deepEqual(discovery.products.filter(({ productId }) => productId.startsWith('crypto.')).map(({ productId, publicAvailable, commercialProof }) => [productId, publicAvailable, commercialProof]), [
    ['crypto.wallet.balances', true, false],
    ['crypto.wallet.tokens', true, false],
    ['crypto.wallet.transactions', true, false],
    ['crypto.wallet.report', true, false],
  ]);
  assert.deepEqual([release.commerce.paymentAttempted, release.commerce.paymentEffects, release.commerce.paidOutcomeVerified, release.commerce.revenueEvidence], [false, 0, false, false]);
  assert.equal(release.cleanup.temporaryProbeJobRemoved, true);
  assert.equal(release.cleanup.failedCandidatesNeverServedTraffic, true);
});
