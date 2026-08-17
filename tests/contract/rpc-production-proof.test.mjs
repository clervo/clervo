import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function json(pathname) {
  return JSON.parse(await readFile(pathname, 'utf8'));
}

test('B14 RPC proof binds one paid execution to one durable accounting entry and a no-payment replay', async () => {
  const proof = await json('infra/production/gcp/rpc-x402-proof.v1.json');
  assert.equal(proof.schemaVersion, 'clervo.rpc-x402-proof.v1');
  assert.equal(proof.state, 'settled_reconciled');
  assert.equal(proof.observedChallenge.status, 402);
  assert.equal(proof.observedChallenge.amountAtomic, '1000');
  assert.equal(proof.ownerAuthorization.maximumSpendAtomic, '10000');
  assert.equal(proof.ownerAuthorization.maximumExecutionCount, 1);
  assert.equal(proof.ownerAuthorization.paymentEffects, 1);
  assert.equal(proof.operation.productId, 'rpc.call');
  assert.equal(proof.operation.chainId, 'eip155:1');
  assert.equal(proof.operation.method, 'eth_chainId');
  assert.equal(proof.operation.customerChargeAtomic, '1000');
  assert.equal(proof.operation.supplierCostAtomic, '0');
  assert.equal(proof.operation.settlementStatus, 'settled');
  assert.equal(proof.operation.resultSummary.result, '0x1');
  assert.equal(proof.operation.onchain.exactReceiverTransferCount, 1);
  assert.deepEqual(proof.operation.replay, {
    sameOperation: true,
    sameReceipt: true,
    sameResult: true,
    idempotencyReplayed: true,
    paymentHeaderSent: false,
    secondAuthorization: false,
    secondUpstreamExecution: false,
    secondSettlement: false,
    secondCharge: false,
  });
  assert.equal(proof.operation.durable.state, 'completed');
  assert.equal(proof.operation.durable.operationRows, 1);
  assert.equal(proof.operation.durable.accountingRows, 1);
  assert.equal(proof.observedDurability.receiverLedgerChainValid, true);
  assert.equal(proof.observedDurability.receiverLedgerBalanced, true);
  assert.equal(proof.cleanup.paymentAuthorizationMaterialRetained, false);
  assert.equal(proof.cleanup.transactionMaterialRetained, false);
});

test('B14 RPC canonical and generated public truth agree on the live two-operation offer', async () => {
  const [launchState, liveRegistry, catalog, pricing, openapi] = await Promise.all([
    json('packages/catalog/launch-state.v1.json'),
    json('packages/catalog/live-registry.json'),
    json('generated/public/catalog.json'),
    json('generated/public/pricing.json'),
    json('generated/public/openapi.json'),
  ]);
  const launch = launchState.products.find(({ id }) => id === 'rpc');
  const observed = liveRegistry.products.find(({ id }) => id === 'rpc');
  assert.equal(launch.customerLifecycle, 'publicly_callable_paid_outcome_verified');
  assert.deepEqual(launch.operations, ['rpc.call', 'rpc.batch']);
  assert.equal(observed.state, 'live');
  assert.equal(observed.proof, 'paid_outcome_verified');
  assert.equal(observed.evidence.chainHealth.advertisedChains, 8);
  assert.equal(observed.evidence.chainHealth.healthyChains, 8);
  assert.deepEqual(observed.operations, ['rpc.batch', 'rpc.call']);
  assert.deepEqual(catalog.products.filter(({ productId }) => productId.startsWith('rpc.')).map(({ productId, lifecycle, publicAvailable }) => ({ productId, lifecycle, publicAvailable })), [
    { productId: 'rpc.call', lifecycle: 'available', publicAvailable: true },
    { productId: 'rpc.batch', lifecycle: 'available', publicAvailable: true },
  ]);
  assert.deepEqual(pricing.offers.filter(({ productId }) => productId.startsWith('rpc.')).map(({ productId, publicAvailable, displayPrice }) => ({ productId, publicAvailable, displayPrice })), [
    { productId: 'rpc.call', publicAvailable: true, displayPrice: { asset: 'USDC', amountAtomic: '1000', decimals: 6 } },
    { productId: 'rpc.batch', publicAvailable: true, displayPrice: { asset: 'USDC', amountAtomic: '1000', decimals: 6 } },
  ]);
  assert.equal(openapi.paths['/v1/rpc/execute'].post.operationId, 'rpcExecute');
  assert.equal(openapi.paths['/v1/rpc/chains'].get.operationId, 'rpcListChains');
});
