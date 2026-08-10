import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { hashJson } from '../../dist/packages/contracts/src/index.js';

const browser = await readFile('tools/x402-browser-proof/src/main.ts', 'utf8');
const proxy = await readFile('scripts/production/serve-x402-browser-proof.mjs', 'utf8');
const deploy = await readFile('scripts/production/gcp-x402-proof-deploy.mjs', 'utf8');
const proof = JSON.parse(await readFile('infra/production/gcp/x402-proof.v1.json', 'utf8'));
const manifest = JSON.parse(await readFile('package.json', 'utf8'));

test('browser proof uses pinned official x402 libraries and a MetaMask-held signer', () => {
  assert.equal(manifest.dependencies['@x402/fetch'], '2.20.0');
  assert.equal(manifest.dependencies['@x402/evm'], '2.20.0');
  assert.match(browser, /registerExactEvmScheme/u);
  assert.match(browser, /createWalletClient/u);
  assert.match(browser, /custom\(provider/u);
  assert.doesNotMatch(browser, /privateKeyToAccount|mnemonic|seedPhrase/u);
});

test('browser proof refuses drift and allows exactly one authorization attempt', () => {
  for (const guard of [
    "network: 'eip155:8453'",
    "chainIdHex: '0x2105'",
    'payer and receiver must be different',
    'USDC EIP-712 domain mismatch',
    'quote expiry outside bounded window',
    'verified challenge expired; stop and reconcile before using another key',
    'payment was already attempted; reconcile instead of retrying',
    "replay.headers.get('idempotency-replayed') !== 'true'",
  ]) assert.ok(browser.includes(guard), `missing browser guard: ${guard}`);
  for (const guard of [
    "'search.web'",
    "resource: 'https://api.clervo.dev/v1/search/paid'",
    "amountAtomic: '6000'",
    "'ai.chat'",
    "model: 'clervo/gpt-5.6-luna'",
    "'ai.image'",
    "resource: 'https://api.clervo.dev/v1/ai/execute'",
    "amountAtomic: '1000'",
    "amountAtomic: '25500'",
    "supplierCostCeilingAtomic: '0'",
    "model: 'clervo/gemini-3.1-flash-lite-image'",
    "'prediction.markets'",
    "'prediction.market'",
    "resource: 'https://api.clervo.dev/v1/prediction/execute'",
    "request: { kind: 'markets', status: 'open', limit: 3 }",
    "request: { kind: 'market', marketRef: predictionMarketRef }",
    "supplierCostCeilingAtomic: '0'",
    "'crypto.wallet.report'",
    "'crypto.wallet.transactions'",
    "resource: 'https://api.clervo.dev/v1/crypto/execute'",
    "amountAtomic: '4000'",
    "amountAtomic: '3000'",
    "request: { kind: 'report'",
    "request: { kind: 'transactions'",
  ]) assert.ok(proxy.includes(guard), `missing proxy bound: ${guard}`);
  assert.match(browser, /approved payer balance exceeds the bounded proof cap/u);
  assert.match(browser, /receipt\?\.receiptId !== paidBody\?\.receipt\?\.receiptId/u);
  assert.match(browser, /paymentAttempted = true/u);
  assert.match(browser, /client\.createPaymentPayload\(verifiedPaymentRequired\)/u);
  assert.match(browser, /decodePaymentResponseHeader\(encodedSettlement\)/u);
  assert.match(browser, /PAYMENT-RESPONSE settlement evidence mismatch/u);
  assert.match(browser, /proofFetch\('\/api\/paid-operation', \{ \.\.\.paidRequest, headers \}\)/u);
  assert.doesNotMatch(browser, /wrapFetchWithPayment/u);
  assert.match(browser, /Do not sign or retry again/u);
  assert.match(browser, /adapter_prediction\.pdata_rest/u);
  assert.match(browser, /item\?\.sourceId === 'pdata' && item\?\.license === 'CC BY 4\.0'/u);
  assert.match(browser, /adapter_crypto\.blockscout_value_added/u);
  assert.match(browser, /sourceClass === 'indexed_public_blockchain_data'/u);
});

test('local proof proxy is loopback-only, exact-route, bounded, and credential-redacting', () => {
  assert.match(proxy, /server\.listen\(port, '127\.0\.0\.1'/u);
  assert.match(proxy, /new URL\(profile\.route, target\)/u);
  assert.match(proxy, /public proof must not use a Cloud Run identity token/u);
  assert.match(proxy, /redirect: 'manual'/u);
  assert.match(proxy, /response too large/u);
  assert.match(proxy, /request body drift/u);
  assert.match(proxy, /idempotency key drift/u);
  assert.match(proxy, /payer and receiver must differ/u);
  assert.match(proxy, /wallet values: not printed; payment: not authorized/u);
  assert.match(proxy, /url\.pathname === '\/proof-result'/u);
  assert.match(proxy, /state: 'settled_replayed'/u);
  assert.match(proxy, /decodePaymentResponseHeader\(encodedSettlement\)/u);
  assert.doesNotMatch(proxy, /console\.(?:log|error)|payment-signature.*stdout/u);
});

test('private proof deployment is exact, zero-traffic, removable, and separate from payment approval', () => {
  assert.equal(proof.state, 'settled_reconciled');
  assert.equal(proof.network, 'eip155:8453');
  assert.equal(proof.amountAtomic, '6000');
  assert.equal(proof.maximumExecutionCount, 1);
  assert.equal(proof.secretVersions.payerSourceReceiver, 1);
  assert.equal(proof.secretVersions.payTo, 2);
  assert.equal(proof.deployment.private, true);
  assert.equal(proof.deployment.trafficPercent, 0);
  assert.equal(proof.ownerPaymentApprovalRequired, true);
  assert.equal(proof.ownerPaymentApprovalObserved, true);
  assert.equal(proof.paymentAuthorized, true);
  assert.equal(proof.paymentEffects, 1);
  assert.deepEqual(proof.observedPreflight, {
    observedAt: '2026-08-03T22:57:00Z',
    revision: 'clervo-api-production-00009-qay',
    tag: 'x402-proof-92dc26cdbedf',
    trafficPercent: 0,
    publicInvoker: false,
    artifactCritical: 0,
    artifactHigh: 0,
    healthStatus: 200,
    challengeStatus: 402,
    challengeStableOnRepeat: true,
    receiverFingerprintMatched: true,
    payerBalanceAtomic: '32000',
    receiverBalanceAtomic: '0',
    payerWithinApprovedCap: true,
    separateAddresses: true,
    paymentHeaderSent: false,
    paymentAuthorized: false,
    usdcSpent: '0',
    superseded: true,
    supersededReason: 'Base USDC EIP-712 domain metadata missing from challenge',
  });
  assert.deepEqual(proof.observedBuild, {
    buildId: 'aeeeee32-3c59-4f6a-bf62-99992fd95318',
    releaseCommit: '647a9066a65f3dc7656f3f1381e388a8fd826bc8',
    status: 'SUCCESS',
  });
  assert.equal(proof.nonSettlementAttempts.length, 2);
  assert.ok(proof.nonSettlementAttempts.every(({ paymentEffects }) => paymentEffects === 0));
  assert.match(deploy, /--no-allow-unauthenticated/u);
  assert.match(deploy, /--no-traffic/u);
  assert.match(deploy, /payer and receiver must differ/u);
  assert.match(deploy, /serving traffic changed during proof deploy/u);
  assert.match(deploy, /--remove-tags/u);
  assert.match(deploy, /paymentAuthorized: false/u);
  assert.match(deploy, /paymentEffects: 0/u);
});

test('settled proof binds one useful execution, exact chain transfer, durable accounting, and no-charge replay', () => {
  const settlement = proof.observedSettlement;
  assert.equal(settlement.productId, proof.productId);
  assert.equal(settlement.customerChargeAtomic, proof.amountAtomic);
  assert.equal(settlement.exactTransferCount, 1);
  assert.equal(settlement.settledAuthorizationCount, 1);
  assert.equal(settlement.executionCount, 1);
  assert.equal(settlement.usefulResult, true);
  assert.equal(settlement.ownerFunded, true);
  assert.equal(settlement.revenueEvidence, false);
  assert.equal(settlement.demandEvidence, false);
  assert.equal(hashJson({ network: proof.network, transaction: settlement.transactionHash }), settlement.settlementReferenceHash);

  assert.deepEqual(proof.observedBalances, {
    payerBeforeAtomic: '32000',
    payerAfterAtomic: '26000',
    payerDeltaAtomic: '-6000',
    receiverBeforeAtomic: '0',
    receiverAfterAtomic: '6000',
    receiverDeltaAtomic: '6000',
  });
  assert.deepEqual(proof.observedReplay, {
    sameOperation: true,
    sameReceipt: true,
    idempotencyReplayed: true,
    secondAuthorization: false,
    secondExecution: false,
    secondCharge: false,
  });
  assert.equal(proof.observedDurability.operationState, 'completed');
  assert.equal(proof.observedDurability.operationRows, 1);
  assert.equal(proof.observedDurability.accountingRowsForOperation, 1);
  assert.equal(proof.observedDurability.receiverLedgerChainValid, true);
  assert.equal(proof.observedDurability.targetBalanced, true);
  assert.equal(proof.observedDurability.temporaryJobRemoved, true);
  assert.equal(proof.proofAccessCleanup.removedTags.length, 2);
  assert.equal(proof.proofAccessCleanup.servingTrafficUnchanged, true);
  assert.equal(proof.proofAccessCleanup.publicInvoker, false);
  assert.equal(proof.proofAccessCleanup.loopbackProxyStopped, true);
});
