import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';
import { x402Client } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { CONTRACT_VERSION, sealQuote } from '../../dist/packages/contracts/src/index.js';
import { createCdpFacilitatorAuth, createX402ChallengeService } from '../../apps/api/src/x402-resource.mjs';

const network = 'eip155:8453';
const asset = `0x${'1'.repeat(40)}`;
const payTo = `0x${'2'.repeat(40)}`;
const issuedAt = '2026-08-03T12:00:00.000Z';
const expiresAt = '2026-08-03T12:05:00.000Z';
const execute = promisify(execFile);
const quote = sealQuote({
  contractVersion: CONTRACT_VERSION,
  quoteId: 'quote_stage15challenge00000000000000',
  operationId: 'op_stage15challenge000000000000000',
  productId: 'search.web',
  requestHash: `sha256:${'a'.repeat(64)}`,
  priceVersion: 'search-2026-08-01.1',
  maximumCharge: { asset: 'USDC', amountAtomic: '1000', decimals: 6 },
  issuedAt,
  expiresAt,
});

test('CDP facilitator auth is short-lived, path-bound, and never returns key material', async () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const keySecret = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const createHeaders = createCdpFacilitatorAuth({
    keyId: 'organizations/test/apiKeys/stage15',
    keySecret,
    url: 'https://api.cdp.coinbase.com/platform/v2/x402',
    now: () => Date.parse(issuedAt),
    nonce: () => '0123456789abcdef0123456789abcdef',
  });
  const headers = await createHeaders();
  assert.deepEqual(Object.keys(headers).sort(), ['settle', 'supported', 'verify']);
  for (const [path, method] of [['supported', 'GET'], ['verify', 'POST'], ['settle', 'POST']]) {
    const token = headers[path].Authorization.slice('Bearer '.length);
    const [, payload] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    assert.equal(claims.uri, `${method} api.cdp.coinbase.com/platform/v2/x402/${path}`);
    assert.equal(claims.exp - claims.nbf, 120);
  }
  assert.equal(JSON.stringify(headers).includes('PRIVATE KEY'), false);
});

test('real x402 challenge is quote-bound while verify and settle remain unavailable', async () => {
  const calls = { supported: 0, verify: 0, settle: 0 };
  const facilitator = {
    async getSupported() {
      calls.supported += 1;
      return { kinds: [{ x402Version: 2, scheme: 'exact', network }], extensions: [], signers: {} };
    },
    async verify() { calls.verify += 1; throw new Error('verify_must_not_run'); },
    async settle() { calls.settle += 1; throw new Error('settle_must_not_run'); },
  };
  const service = await createX402ChallengeService({
    facilitator,
    network,
    asset,
    payTo,
    publicOrigin: 'https://api.clervo.dev/',
  });
  const result = await service.challenge({ quote, description: 'Bounded search.web execution', now: issuedAt });
  assert.equal(service.mode, 'challenge_only');
  assert.equal(result.status, 402);
  assert.match(result.headers['PAYMENT-REQUIRED'], /^[A-Za-z0-9+/]+=*$/u);
  assert.equal(result.body.x402Version, 2);
  assert.equal(result.body.accepts.length, 1);
  const requirement = result.body.accepts[0];
  assert.equal(requirement.scheme, 'exact');
  assert.equal(requirement.network, network);
  assert.equal(requirement.asset, asset);
  assert.equal(requirement.payTo, payTo);
  assert.equal(requirement.amount, quote.maximumCharge.amountAtomic);
  assert.equal(requirement.extra.name, 'USD Coin');
  assert.equal(requirement.extra.version, '2');
  assert.equal(result.body.resource.url, 'https://api.clervo.dev/v1/search/paid');
  assert.deepEqual(requirement.extra.clervo, {
    quoteId: quote.quoteId,
    quoteHash: quote.quoteHash,
    requestHash: quote.requestHash,
    operationId: quote.operationId,
    priceVersion: quote.priceVersion,
    quoteExpiresAt: quote.expiresAt,
  });
  const signer = {
    address: `0x${'3'.repeat(40)}`,
    async signTypedData(message) {
      assert.deepEqual(message.domain, { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: asset });
      assert.equal(message.primaryType, 'TransferWithAuthorization');
      return `0x${'4'.repeat(130)}`;
    },
  };
  const buyer = new x402Client();
  registerExactEvmScheme(buyer, { signer, networks: [network] });
  const payment = await buyer.createPaymentPayload(result.body);
  assert.equal(payment.accepted.amount, quote.maximumCharge.amountAtomic);
  assert.equal(payment.payload.authorization.value, quote.maximumCharge.amountAtomic);
  assert.deepEqual(calls, { supported: 1, verify: 0, settle: 0 });
});

test('challenge service binds AI payments to the exact public AI resource', async () => {
  const facilitator = {
    async getSupported() { return { kinds: [{ x402Version: 2, scheme: 'exact', network }], extensions: [], signers: {} }; },
  };
  const service = await createX402ChallengeService({ facilitator, network, asset, payTo, publicOrigin: 'https://api.clervo.dev/' });
  const result = await service.challenge({ quote, description: 'Bounded ai.chat execution', now: issuedAt, resourcePath: '/v1/ai/execute' });
  assert.equal(result.body.resource.url, 'https://api.clervo.dev/v1/ai/execute');
  await assert.rejects(
    service.challenge({ quote, description: 'Invalid route', now: issuedAt, resourcePath: '/v1/unknown' }),
    /resource_path_invalid/u,
  );
});

test('challenge service rejects the protected model gateway and non-Base configuration', async () => {
  const facilitator = { async getSupported() { return { kinds: [], extensions: [], signers: {} }; } };
  await assert.rejects(createX402ChallengeService({ facilitator, network, asset, payTo, publicOrigin: 'https://ai.clervo.dev/' }), /invalid x402 public origin/u);
  await assert.rejects(createX402ChallengeService({ facilitator, network: 'eip155:84532', asset, payTo, publicOrigin: 'https://api.clervo.dev/' }), /unsupported x402 production network/u);
});

test('payment processing verifies once, settles once, and quarantines unknown settlement', async () => {
  const calls = { supported: 0, verify: 0, settle: 0 };
  const facilitator = {
    async getSupported() {
      calls.supported += 1;
      return { kinds: [{ x402Version: 2, scheme: 'exact', network }], extensions: [], signers: {} };
    },
    async verify(payload, requirements) {
      calls.verify += 1;
      assert.deepEqual(payload.accepted, requirements);
      return { isValid: true, payer: `0x${'3'.repeat(40)}` };
    },
    async settle(payload, requirements) {
      calls.settle += 1;
      assert.deepEqual(payload.accepted, requirements);
      return { success: true, transaction: `0x${'4'.repeat(64)}`, network, payer: `0x${'3'.repeat(40)}` };
    },
  };
  const service = await createX402ChallengeService({
    facilitator, network, asset, payTo, publicOrigin: 'https://api.clervo.dev/', paymentMode: 'settlement_enabled',
  });
  const challenge = await service.challenge({ quote, description: 'Bounded search.web execution', now: issuedAt });
  const paymentPayload = { x402Version: 2, accepted: challenge.body.accepts[0], payload: { signature: 'opaque-test-value' } };
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload), 'utf8').toString('base64');
  const authorization = await service.authorize({ paymentHeader, challenge });
  assert.match(authorization.fingerprint, /^sha256:[a-f0-9]{64}$/u);
  const settled = await service.settle(authorization);
  assert.equal(settled.kind, 'settled');
  assert.match(settled.headers['PAYMENT-RESPONSE'], /^[A-Za-z0-9+/]+=*$/u);
  assert.deepEqual(calls, { supported: 1, verify: 1, settle: 1 });

  const uncertain = await createX402ChallengeService({
    facilitator: { ...facilitator, async settle() { throw new Error('timeout'); } },
    network,
    asset,
    payTo,
    publicOrigin: 'https://api.clervo.dev/',
    paymentMode: 'settlement_enabled',
  });
  const uncertainChallenge = await uncertain.challenge({ quote, description: 'Bounded search.web execution', now: issuedAt });
  const uncertainPayload = { ...paymentPayload, accepted: uncertainChallenge.body.accepts[0] };
  const uncertainAuthorization = await uncertain.authorize({
    paymentHeader: Buffer.from(JSON.stringify(uncertainPayload), 'utf8').toString('base64'),
    challenge: uncertainChallenge,
  });
  assert.deepEqual(await uncertain.settle(uncertainAuthorization), {
    kind: 'unknown', reason: 'settlement_transport_or_state_unknown',
  });
});

test('challenge-only mode rejects payment headers before facilitator verification', async () => {
  const facilitator = {
    async getSupported() { return { kinds: [{ x402Version: 2, scheme: 'exact', network }], extensions: [], signers: {} }; },
    async verify() { throw new Error('must_not_run'); },
  };
  const service = await createX402ChallengeService({ facilitator, network, asset, payTo, publicOrigin: 'https://api.clervo.dev/' });
  const challenge = await service.challenge({ quote, description: 'Bounded search.web execution', now: issuedAt });
  await assert.rejects(service.authorize({ paymentHeader: 'opaque', challenge }), /x402 settlement is disabled/u);
});

test('production x402 secret bootstrap is challenge-only, payer-free, and confirmation guarded', async () => {
  const { stdout } = await execute(process.execPath, ['scripts/production/gcp-x402-bootstrap.mjs', 'plan'], {
    env: { PATH: process.env.PATH },
  });
  const plan = JSON.parse(stdout);
  assert.equal(plan.project, 'bloxsniper-prod');
  assert.equal(plan.paymentMode, 'challenge_only');
  assert.equal(plan.settlementEnabled, false);
  assert.equal(plan.payerSignerRequired, false);
  assert.equal(plan.paymentEffects, 0);
  assert.deepEqual(plan.secretNames.sort(), [
    'clervo-production-x402-key-id',
    'clervo-production-x402-key-secret',
    'clervo-production-x402-pay-to',
  ]);
  const policy = JSON.parse(await readFile('infra/production/gcp/x402-preflight.v1.json', 'utf8'));
  assert.equal(policy.network, 'eip155:8453');
  assert.equal(policy.asset.toLowerCase(), '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
  assert.equal(policy.settlementEnabled, false);
  assert.deepEqual(policy.observed, {
    observedAt: '2026-08-03T11:34:00.000Z',
    secretVersions: { keyId: 1, keySecret: 1, payTo: 1 },
    revision: 'clervo-api-production-00005-ruv',
    trafficPercent: 0,
    ready: true,
    challengeStatus: 402,
    productId: 'search.web',
    amountAtomic: '6000',
    challengeStableOnRepeat: true,
    paymentHeaderRejectedBeforeVerification: true,
    settlementEnabled: false,
    payerSignerRead: false,
    paymentAuthorized: false,
    usdcSpent: '0',
  });
  assert.deepEqual(policy.receiverRotation, {
    observedAt: '2026-08-03T22:53:05Z',
    previousVersion: 1,
    nextVersion: 2,
    receiverFingerprint: 'sha256:bfac3cf6636433f2acef19162dc8332c9f08f4602c92944bd758f541d341f4c8',
    oldVersionRetained: true,
    deploymentChanged: false,
    settlementEnabled: false,
    paymentEffects: 0,
  });
  const release = await readFile('scripts/production/gcp-release.mjs', 'utf8');
  assert.match(release, /deploy-x402-preflight/u);
  assert.match(release, /x402_preflight_must_be_challenge_only/u);
  assert.match(release, /CLERVO_X402_MODE=\$\{x402Mode\}/u);
});

test('receiver rotation is versioned, rollback-safe, and cannot enable settlement or move funds', async () => {
  const { stdout } = await execute(process.execPath, ['scripts/production/gcp-x402-receiver-rotation.mjs', 'plan'], {
    env: { PATH: process.env.PATH },
  });
  const plan = JSON.parse(stdout);
  assert.deepEqual(plan, {
    action: 'plan',
    project: 'bloxsniper-prod',
    service: 'clervo-api-production',
    secretName: 'clervo-production-x402-pay-to',
    network: 'eip155:8453',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    mutation: false,
    oldVersionRetained: true,
    deploymentChanged: false,
    settlementEnabled: false,
    paymentEffects: 0,
  });
  const source = await readFile('scripts/production/gcp-x402-receiver-rotation.mjs', 'utf8');
  assert.match(source, /new receiver must differ from current receiver/u);
  assert.match(source, /oldVersionRetained: true/u);
  assert.match(source, /deploymentChanged: false/u);
  assert.match(source, /settlementEnabled: false/u);
  assert.match(source, /paymentEffects: 0/u);
  assert.doesNotMatch(source, /privateKey|seedPhrase|mnemonic/u);
});
