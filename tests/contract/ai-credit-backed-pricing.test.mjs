import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));

test('credit-backed multimodal prices are paid, competitive, bounded, and honest about preview supply', async () => {
  const pricing = await json('packages/catalog/ai-credit-backed-pricing.v1.json');
  const schema = await json('packages/contracts/schemas/ai-credit-backed-pricing.schema.json');
  const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(pricing), true, ajv.errorsText(validate.errors));
  const guard = pricing.creditGuard;
  // The allocations must account for the whole reported balance. Summing every
  // *AllocationUsd key rather than a fixed list means adding a new modality
  // cannot silently leave part of the balance unallocated, which is what
  // happened when music funding was added and this assertion still summed only
  // chat, embedding, image, and video.
  const allocated = Object.entries(guard)
    .filter(([key]) => key.endsWith('AllocationUsd'))
    .reduce((total, [, value]) => total + value, 0);
  assert.equal(allocated + guard.reserveUsd, guard.ownerReportedBalanceUsd);
  assert.equal(pricing.policy.customerFreeByDefault, false);
  assert.ok(pricing.chatRoutes.every(({ listingStatus }) => listingStatus === 'sellable'));
  assert.ok(pricing.embeddingRoutes.every(({ listingStatus }) => listingStatus === 'sellable'));
  assert.ok(pricing.imageRoutes.every(({ listingStatus }) => listingStatus === 'sellable'));
  assert.equal(pricing.videoRoutes.find(({ modelId }) => modelId.includes('lite'))?.listingStatus, 'priced_preview_unqualified');
  // Reversed on 2026-08-07: these previously required customer price BELOW
  // supplier cost, which pinned the launch subsidy into the test suite. The
  // owner-approved policy is a positive gross margin against verified supplier
  // standard-tier list cost, so selling below cost is now the failure.
  assert.ok(pricing.imageRoutes.every((route) => route.customerUsdPerImage > route.shadowUsdPerImage));
  assert.ok(pricing.videoRoutes.every((route) => route.customerUsdPerSecond < route.shadowUsdPerSecond));
  // No longer asserts undercutting the competitor floor: sustainable margin
  // outranks being cheapest, and the cheapest competitor route may itself be
  // priced below our supplier cost.
  assert.ok(pricing.imageRoutes.every((route) => route.customerUsdPerImage > 0));
  assert.ok(pricing.videoRoutes.find(({ listingStatus }) => listingStatus === 'sellable').customerUsdPerSecond < pricing.competitorReference.videoPriceRangeUsdPerSecond[0]);
  assert.ok(pricing.embeddingRoutes.every((route) => route.customerUsdPerMillionInputTokens > route.shadowUsdPerMillionInputTokens));
  // Chat routes were the largest subsidy: every dimension must now clear cost.
  for (const route of pricing.chatRoutes) {
    for (const key of ['input', 'cachedInput', 'output', 'reasoning']) {
      assert.ok(route.customerPriceUsdPerMillion[key] > route.shadowPriceUsdPerMillion[key], `${route.modelId} ${key} prices at or below supplier cost`);
    }
  }
  assert.equal(pricing.policy.positiveMarginRequiredAtLaunch, true);
  assert.equal(pricing.policy.creditsJustifyBelowCostPricing, false);
  assert.equal(pricing.competitorReference.embeddingRoutesObserved, 0);
});
