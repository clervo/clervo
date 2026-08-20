import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const browser = await readFile('tools/x402-browser-proof/src/main.ts', 'utf8');
const proxy = await readFile('scripts/production/serve-x402-browser-proof.mjs', 'utf8');
const manifest = JSON.parse(await readFile('package.json', 'utf8'));

test('browser proof uses pinned official x402 libraries and a MetaMask-held signer', () => {
  assert.equal(manifest.dependencies['@x402/fetch'], '2.21.0');
  assert.equal(manifest.dependencies['@x402/evm'], '2.21.0');
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
    "model: 'clervo/allam-2-7b'",
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
