import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  SEARCH_PRODUCT_PRICING,
  assertPromotionalCreditPolicy,
  evaluateUnitEconomics,
} from '../../dist/packages/contracts/src/index.js';

const policy = JSON.parse(await readFile('infra/production/post-credit-economics.v1.json', 'utf8'));

test('search candidate prices remain competitive after credits end without hiding bounded costs', () => {
  const decisions = policy.products.map((product) => evaluateUnitEconomics(product));
  assert.deepEqual(decisions.map(({ productId, requiredPriceMicrousd, customerPriceMicrousd }) => [
    productId,
    requiredPriceMicrousd,
    customerPriceMicrousd,
  ]), [
    ['search.web', 6000, 6000],
    ['search.answer', 12000, 12000],
  ]);
  assert.ok(decisions.every(({ postCreditViable, competitivelyPriced, paidActivationAllowed, failureCodes }) =>
    postCreditViable && competitivelyPriced && paidActivationAllowed && failureCodes.length === 0));
  assert.deepEqual(decisions.map(({ productId, contributionAtCeilingsMicrousd }) => [
    productId,
    contributionAtCeilingsMicrousd,
  ]), [
    ['search.web', 400],
    ['search.answer', 1500],
  ]);
  assert.deepEqual(policy.products.map(({ productId, customerPriceMicrousd, priceVersion }) => [
    productId,
    customerPriceMicrousd,
    priceVersion,
  ]), Object.entries(SEARCH_PRODUCT_PRICING).map(([productId, pricing]) => [
    productId,
    Number(pricing.maximumCharge.amountAtomic),
    pricing.priceVersion,
  ]));
});

test('promotional credits are never represented as withdrawable money or used to pass economics', () => {
  assert.doesNotThrow(() => assertPromotionalCreditPolicy(policy.promotionalCredits));
  assert.equal(policy.promotionalCredits.withdrawable, false);
  assert.equal(policy.promotionalCredits.equivalentToUsdOrUsdc, false);
  assert.equal(policy.promotionalCredits.paidSupplierBudgetSeparate, true);
  assert.throws(
    () => assertPromotionalCreditPolicy({ ...policy.promotionalCredits, equivalentToUsdOrUsdc: true }),
    /promotional_credit_policy_unsafe/u,
  );
  const unsafe = evaluateUnitEconomics({ ...policy.products[0], promotionalCreditsExcluded: false });
  assert.equal(unsafe.paidActivationAllowed, false);
  assert.ok(unsafe.failureCodes.includes('promotional_credit_subsidy_included'));
});

test('unknown supplier ceilings, underpricing, and uncompetitive pricing fail closed independently', () => {
  const bounded = policy.products[0];
  const unknown = evaluateUnitEconomics({ ...bounded, supplierCostBounded: false });
  assert.equal(unknown.paidActivationAllowed, false);
  assert.ok(unknown.failureCodes.includes('supplier_cost_unbounded'));

  const underpriced = evaluateUnitEconomics({ ...bounded, customerPriceMicrousd: 5999 });
  assert.equal(underpriced.paidActivationAllowed, false);
  assert.ok(underpriced.failureCodes.includes('price_below_post_credit_floor'));

  const overpriced = evaluateUnitEconomics({ ...bounded, customerPriceMicrousd: 12001 });
  assert.equal(overpriced.paidActivationAllowed, false);
  assert.ok(overpriced.failureCodes.includes('price_above_competitive_ceiling'));
});

test('competitive references are current context, not a quality-equivalence claim, and payment stays disabled', () => {
  assert.equal(policy.observedAt, '2026-08-02T16:30:00.000Z');
  assert.deepEqual(policy.competitiveReferences.map(({ priceMicrousd }) => priceMicrousd), [264500, 12000, 12000]);
  assert.ok(policy.competitiveReferences.every(({ source }) => new URL(source).hostname === 'blockrun.ai'));
  assert.equal(policy.competitiveReferences[0].use, 'context_only_not_quality_equivalence');
  assert.equal(policy.customerPaymentEnabled, false);
  assert.equal(policy.ownerCashSpentUsd, 0);
});
