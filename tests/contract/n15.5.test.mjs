import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
    "amountAtomic: '6000'",
    "productId: 'search.web'",
    "resource: 'https://api.clervo.dev/v1/search/paid'",
    'payer and receiver must be different',
    'quote expiry outside bounded window',
    'challenge changed after approval review',
    'payment was already attempted; reconcile instead of retrying',
    "replay.headers.get('idempotency-replayed') !== 'true'",
  ]) assert.ok(browser.includes(guard), `missing browser guard: ${guard}`);
  assert.match(browser, /paymentAttempted = true/u);
  assert.match(browser, /Do not sign or retry again/u);
});

test('local proof proxy is loopback-only, exact-route, bounded, and credential-redacting', () => {
  assert.match(proxy, /server\.listen\(port, '127\.0\.0\.1'/u);
  assert.match(proxy, /new URL\('\/v1\/search\/paid', target\)/u);
  assert.match(proxy, /redirect: 'manual'/u);
  assert.match(proxy, /response too large/u);
  assert.match(proxy, /request body drift/u);
  assert.match(proxy, /idempotency key drift/u);
  assert.match(proxy, /payer and receiver must differ/u);
  assert.match(proxy, /wallet values: not printed; payment: not authorized/u);
  assert.doesNotMatch(proxy, /console\.(?:log|error)|payment-signature.*stdout/u);
});

test('private proof deployment is exact, zero-traffic, removable, and separate from payment approval', () => {
  assert.equal(proof.state, 'prepared_no_payment');
  assert.equal(proof.network, 'eip155:8453');
  assert.equal(proof.amountAtomic, '6000');
  assert.equal(proof.maximumExecutionCount, 1);
  assert.equal(proof.secretVersions.payerSourceReceiver, 1);
  assert.equal(proof.secretVersions.payTo, 2);
  assert.equal(proof.deployment.private, true);
  assert.equal(proof.deployment.trafficPercent, 0);
  assert.equal(proof.ownerPaymentApprovalRequired, true);
  assert.equal(proof.paymentAuthorized, false);
  assert.equal(proof.paymentEffects, 0);
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
  });
  assert.match(deploy, /--no-allow-unauthenticated/u);
  assert.match(deploy, /--no-traffic/u);
  assert.match(deploy, /payer and receiver must differ/u);
  assert.match(deploy, /serving traffic changed during proof deploy/u);
  assert.match(deploy, /--remove-tags/u);
  assert.match(deploy, /paymentAuthorized: false/u);
  assert.match(deploy, /paymentEffects: 0/u);
});
