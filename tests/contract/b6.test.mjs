/*
 * B6 — ClervoRouter customer path v0.
 *
 * These cover the launch-critical list for B6: wallet creation is not
 * destructive, key material is written with restrictive permissions and never
 * logged, spend limits are enforced on this machine before anything is signed,
 * a retry does not double-charge, a replay returns the same operation, and
 * `doctor` detects a broken configuration.
 *
 * Nothing here signs against the live network or spends money. The paid leg is
 * driven by a stub transport that speaks the real wire contract, so the client's
 * ordering and fail-closed behaviour is exercised without a real settlement.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, chmodSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createWallet,
  loadWalletFile,
  replaceWallet,
  walletExists,
  walletPermissionsSecure,
} from '../../packages/router/dist/wallet.js';
import { assertWithinLimits, loadLimits, saveLimits, usdcToAtomic } from '../../packages/router/dist/limits.js';
import {
  assertNothingUnreconciled,
  listOperations,
  readOperation,
  spentTodayAtomic,
  unreconciledOperations,
  writeOperation,
  OPERATION_SCHEMA_VERSION,
} from '../../packages/router/dist/store.js';
import { callFree, callPaid, replayPaid, reconcileOperation, requestQuote, RouterError } from '../../packages/router/dist/client.js';
import { diagnose } from '../../packages/router/dist/doctor.js';
import { formatUsdc } from '../../packages/router/dist/chain.js';

/*
 * Every test runs against a throwaway CLERVO_HOME. process.env is also pointed
 * at one, so a call that forgets to pass `env` writes into a temporary directory
 * rather than the operator's real `~/.clervo`. A test suite must not be able to
 * create or overwrite a wallet that might hold funds.
 */
process.env.CLERVO_HOME = join(mkdtempSync(join(tmpdir(), 'clervo-b6-default-')), 'clervo');

function freshHome() {
  const home = join(mkdtempSync(join(tmpdir(), 'clervo-b6-')), 'clervo');
  return { CLERVO_HOME: home };
}

const PAY_TO = '0xBd11d82d8Dbd01Ba3eed279d3bACf74659fFca28';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

/* A registry object shaped exactly like the one loadRegistry() produces, so the
 * client is exercised without depending on the network for these tests. */
function stubRegistry() {
  return Object.freeze({
    origin: 'https://api.clervo.dev',
    contractVersion: '2026-07-29.1',
    releaseId: 'test',
    observedAt: '2026-08-07T00:00:00.000Z',
    capabilities: Object.freeze([
      Object.freeze({
        productId: 'search.web',
        family: 'search',
        title: 'Web search evidence',
        summary: '',
        lifecycleState: 'live',
        proofLevel: 'settled',
        reason: null,
        freeRoute: '/v1/search/free',
        paidRoute: '/v1/search/paid',
        priceAtomic: '6000',
        priceVersion: 'test-1',
        priceIsBinding: true,
        paidCallable: true,
        freeCallable: true,
      }),
    ]),
  });
}

function challengeBody(amount = '6000') {
  return {
    x402Version: 2,
    accepts: [{
      scheme: 'exact',
      network: 'eip155:8453',
      amount,
      asset: USDC,
      payTo: PAY_TO,
      maxTimeoutSeconds: 60,
      extra: {
        name: 'USD Coin',
        version: '2',
        clervo: {
          quoteId: 'q_test',
          quoteHash: `sha256:${'a'.repeat(64)}`,
          requestHash: `sha256:${'b'.repeat(64)}`,
          operationId: 'op_test',
          priceVersion: 'test-1',
          quoteExpiresAt: '2099-01-01T00:00:00.000Z',
        },
      },
    }],
    quote: { amountAtomic: amount, asset: USDC, decimals: 6, operationId: 'op_test' },
  };
}

function jsonResponse(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

test('B6 wallet creation is not destructive and refuses to replace a funded wallet', () => {
  const env = freshHome();
  assert.equal(walletExists(env), false);

  const created = createWallet({}, env);
  assert.match(created.view.address, /^0x[0-9a-fA-F]{40}$/u);
  assert.equal(created.mnemonic.split(' ').length, 12);
  assert.equal(created.view.network, 'eip155:8453');
  assert.equal(created.view.derivationPath, "m/44'/60'/0'/0/0");
  assert.equal(walletExists(env), true);

  /* A second create must fail rather than overwrite, and the wallet on disk must
   * still be the original one. This is the guarantee that protects funds. */
  assert.throws(() => createWallet({}, env), (error) => {
    assert.equal(error.code, 'wallet_already_exists');
    return true;
  });
  assert.equal(loadWalletFile(env).file.address, created.view.address);

  /* Replacement without proof of an empty balance is refused outright. */
  const other = createWallet({}, freshHome()).mnemonic;
  assert.throws(() => replaceWallet({ mnemonic: other, outgoingIsEmpty: false }, env), (error) => {
    assert.equal(error.code, 'wallet_replace_refused_funded');
    return true;
  });
  assert.equal(loadWalletFile(env).file.address, created.view.address, 'a refused replacement must not modify the wallet');

  /* With explicit proof the wallet is empty, replacement is allowed. */
  const replaced = replaceWallet({ mnemonic: other, outgoingIsEmpty: true }, env);
  assert.notEqual(replaced.address, created.view.address);
});

test('B6 wallet key material is written with restrictive permissions and never printed', () => {
  const env = freshHome();
  const created = createWallet({}, env);

  assert.equal(statSync(env.CLERVO_HOME).mode & 0o777, 0o700);
  assert.equal(statSync(created.view.path).mode & 0o777, 0o600);
  assert.equal(walletPermissionsSecure(created.view.path), true);

  /* The view is what every command is allowed to render. It must not carry the
   * phrase, or a --json caller would leak it into logs. */
  assert.equal(JSON.stringify(created.view).includes(created.mnemonic), false);
  assert.equal('mnemonic' in created.view, false);

  /* A wallet that has become world-readable is detected on every load, not only
   * by doctor. */
  chmodSync(created.view.path, 0o644);
  assert.equal(walletPermissionsSecure(created.view.path), false);
  assert.throws(() => loadWalletFile(env), (error) => {
    assert.equal(error.code, 'wallet_permissions_insecure');
    return true;
  });
  chmodSync(created.view.path, 0o600);

  /* A wallet file whose recorded address disagrees with its phrase is refused
   * rather than used, since one of the two has been tampered with. */
  const file = JSON.parse(readFileSync(created.view.path, 'utf8'));
  writeFileSync(created.view.path, JSON.stringify({ ...file, address: '0x' + '1'.repeat(40) }), { mode: 0o600 });
  assert.throws(() => loadWalletFile(env), (error) => {
    assert.equal(error.code, 'wallet_address_mismatch');
    return true;
  });
});

test('B6 spend limits are enforced on this machine before anything is signed', async () => {
  const env = freshHome();
  const limits = loadLimits(env);
  assert.equal(limits.perOperationAtomic, '20000');
  assert.equal(limits.dailyAtomic, '100000');

  /* Per-operation ceiling. */
  assert.throws(() => assertWithinLimits({ limits, quotedAtomic: '20001', spentTodayAtomic: '0' }), (error) => {
    assert.equal(error.code, 'spend_limit_per_operation_exceeded');
    return true;
  });
  /* Daily ceiling, counting what already settled today. */
  assert.throws(() => assertWithinLimits({ limits, quotedAtomic: '6000', spentTodayAtomic: '99000' }), (error) => {
    assert.equal(error.code, 'spend_limit_daily_exceeded');
    return true;
  });
  assertWithinLimits({ limits, quotedAtomic: '6000', spentTodayAtomic: '0' });

  /* A per-operation limit above the daily limit is incoherent and refused. */
  assert.throws(() => saveLimits({ perOperationAtomic: '200000', dailyAtomic: '100000' }, env));

  assert.equal(usdcToAtomic('0.006'), '6000');
  assert.equal(usdcToAtomic('1'), '1000000');
  assert.equal(formatUsdc('6000'), '0.006');

  /*
   * The limit must stop the call before any payment header is produced. A wallet
   * is created first on purpose: with a usable wallet present, a missing wallet
   * cannot be the reason the call is refused, so this asserts the limit itself
   * and not an earlier failure that happens to look the same.
   */
  createWallet({}, env);
  saveLimits({ perOperationAtomic: '1000', dailyAtomic: '1000' }, env);
  let paidCalls = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes('/v1/search/paid')) {
      paidCalls += 1;
      return jsonResponse(402, challengeBody('6000'));
    }
    throw new Error(`unexpected ${url}`);
  };
  await assert.rejects(
    callPaid({
      registry: stubRegistry(),
      productId: 'search.web',
      body: { query: 'x' },
      idempotencyKey: 'limit-test-key-0001',
      env,
      fetchImpl,
      approve: async () => { throw new Error('approval must not be requested for a call over the limit'); },
    }),
    (error) => {
      assert.equal(error.code, 'spend_limit_per_operation_exceeded');
      return true;
    },
  );
  /* The quote is fetched (it is free and carries no authorization), but nothing
   * was signed and no second request went out. */
  assert.equal(paidCalls, 1);
  assert.equal(listOperations(env).length, 0, 'a refused call must not leave an authorizing record');
});

test('B6 a retry does not double-charge and a replay returns the same operation', async () => {
  const env = freshHome();
  createWallet({}, env);
  saveLimits({ perOperationAtomic: '20000', dailyAtomic: '100000' }, env);

  const key = 'replay-test-key-0001';
  const settled = {
    state: 'RECEIPTED',
    operationId: 'op_test',
    fundingMode: 'x402',
    result: { results: [{ title: 'a' }] },
    receipt: {
      receiptId: 'rcpt_test',
      customerCharge: { amountAtomic: '6000', asset: USDC, decimals: 6 },
      settlement: { referenceHash: `0x${'c'.repeat(64)}` },
    },
  };

  let authorizedSends = 0;
  let replaySends = 0;
  const fetchImpl = async (url, init = {}) => {
    const headers = init.headers ?? {};
    const hasPayment = Object.keys(headers).some((name) => name.toLowerCase() === 'payment-signature');
    if (!String(url).includes('/v1/search/paid')) throw new Error(`unexpected ${url}`);
    if (hasPayment) {
      authorizedSends += 1;
      return jsonResponse(200, settled);
    }
    /* No payment header: this is either the quote or a replay probe. Once the
     * operation has settled the server answers 200 with the stored result, which
     * is exactly how a replay avoids a second charge. */
    if (authorizedSends > 0) {
      replaySends += 1;
      return jsonResponse(200, settled, { 'idempotency-replayed': 'true' });
    }
    return jsonResponse(402, challengeBody('6000'));
  };

  const first = await callPaid({
    registry: stubRegistry(), productId: 'search.web', body: { query: 'x' },
    idempotencyKey: key, env, fetchImpl, approve: async () => true,
  });
  assert.equal(first.chargedAtomic, '6000');
  assert.equal(first.replayed, false);
  assert.equal(authorizedSends, 1);
  assert.equal(spentTodayAtomic(env), '6000');

  const record = readOperation(key, env);
  assert.equal(record.state, 'settled');
  assert.equal(record.schemaVersion, OPERATION_SCHEMA_VERSION);
  assert.equal(record.settlementReferenceHash, `0x${'c'.repeat(64)}`);
  assert.notEqual(record.receiptId, null);

  /* Running the same key and body again must not produce a second
   * authorization. */
  const retried = await callPaid({
    registry: stubRegistry(), productId: 'search.web', body: { query: 'x' },
    idempotencyKey: key, env, fetchImpl, approve: async () => { throw new Error('a settled operation must not ask for approval again'); },
  });
  assert.equal(authorizedSends, 1, 'a retry must not sign a second authorization');
  assert.equal(retried.replayed, true);
  assert.equal(retried.operationId, first.operationId);

  /* An explicit replay sends no payment header at all and returns the same
   * operation. */
  const replayed = await replayPaid({
    registry: stubRegistry(), productId: 'search.web', body: { query: 'x' },
    idempotencyKey: key, env, fetchImpl,
  });
  assert.equal(replayed.operationId, first.operationId);
  assert.equal(authorizedSends, 1);
  assert.ok(replaySends >= 1);

  /* However many times the result is fetched again, the charge counts once. */
  assert.equal(spentTodayAtomic(env), '6000', 'a replay must never add to the day\'s spend');
  assert.equal(listOperations(env).length, 1);

  /* Reusing the key with a different body is refused rather than silently
   * charged as something else. */
  await assert.rejects(
    callPaid({
      registry: stubRegistry(), productId: 'search.web', body: { query: 'different' },
      idempotencyKey: key, env, fetchImpl, approve: async () => true,
    }),
    (error) => {
      assert.equal(error.code, 'idempotency_key_reused_with_different_body');
      return true;
    },
  );
  assert.equal(authorizedSends, 1);
});

test('B6 an unknown settlement fails closed, blocks further spend, and reconciles', async () => {
  const env = freshHome();
  createWallet({}, env);
  const key = 'unknown-test-key-0001';

  /* The transport dies after the authorization was sent. Whether it settled is
   * genuinely unknown, so the operation must be recorded as unknown and the
   * caller must be told, not given a cheerful failure. */
  let sends = 0;
  const dyingFetch = async (url, init = {}) => {
    const hasPayment = Object.keys(init.headers ?? {}).some((name) => name.toLowerCase() === 'payment-signature');
    if (hasPayment) {
      sends += 1;
      throw Object.assign(new Error('socket hang up'), { name: 'FetchError' });
    }
    return jsonResponse(402, challengeBody('6000'));
  };

  await assert.rejects(
    callPaid({
      registry: stubRegistry(), productId: 'search.web', body: { query: 'x' },
      idempotencyKey: key, env, fetchImpl: dyingFetch, approve: async () => true,
    }),
    (error) => {
      assert.equal(error.code, 'settlement_unknown');
      return true;
    },
  );
  assert.equal(sends, 1);

  const record = readOperation(key, env);
  assert.equal(record.state, 'unknown');
  assert.equal(unreconciledOperations(env).length, 1);

  /* While anything is unreconciled, no new authorization may be created. This is
   * the fail-closed boundary. */
  assert.throws(() => assertNothingUnreconciled(env), (error) => {
    assert.equal(error.code, 'unreconciled_operation_blocks_spend');
    return true;
  });
  await assert.rejects(
    callPaid({
      registry: stubRegistry(), productId: 'search.web', body: { query: 'other' },
      idempotencyKey: 'another-key-00000001', env, fetchImpl: dyingFetch, approve: async () => true,
    }),
    (error) => {
      assert.equal(error.code, 'unreconciled_operation_blocks_spend');
      return true;
    },
  );

  /* Reconciliation probes with a replay that carries no payment header, so it
   * cannot charge even if the local record is wrong. Here the server reports it
   * never settled. */
  /* A server that still quotes the request has not been paid for it, so a 402 to
   * a replay is proof no payment settled. */
  const notSettledFetch = async (url, init = {}) => {
    const hasPayment = Object.keys(init.headers ?? {}).some((name) => name.toLowerCase() === 'payment-signature');
    assert.equal(hasPayment, false, 'reconciliation must never send a payment header');
    return jsonResponse(402, challengeBody('6000'));
  };
  const resolution = await reconcileOperation({
    registry: stubRegistry(), record: readOperation(key, env), env, fetchImpl: notSettledFetch,
  });
  assert.equal(resolution.resolved, 'not_settled');
  assert.equal(readOperation(key, env).state, 'refused');
  assert.equal(unreconciledOperations(env).length, 0);
  assert.equal(spentTodayAtomic(env), '0', 'an operation that never settled must not count as spend');

  /* With the ambiguity resolved, spending is allowed again. */
  assertNothingUnreconciled(env);
});

test('B6 reconciliation records a settlement it discovers and counts it once', async () => {
  const env = freshHome();
  createWallet({}, env);
  const key = 'discovered-key-00001';

  writeOperation({
    schemaVersion: OPERATION_SCHEMA_VERSION,
    idempotencyKey: key,
    productId: 'search.web',
    resource: '/v1/search/paid',
    requestBodyHash: `sha256:${'d'.repeat(64)}`,
    requestBody: { query: 'x' },
    state: 'unknown',
    startedAt: new Date().toISOString(),
    completedAt: null,
    quotedAtomic: '6000',
    chargedAtomic: null,
    operationId: 'op_test',
    receiptId: null,
    settlementReferenceHash: null,
    replayed: false,
    reason: 'transport_failed_after_authorization',
  }, env);

  const settledFetch = async () => jsonResponse(200, {
    state: 'RECEIPTED',
    operationId: 'op_test',
    fundingMode: 'x402',
    result: { results: [] },
    receipt: {
      receiptId: 'rcpt_discovered',
      customerCharge: { amountAtomic: '6000', asset: USDC, decimals: 6 },
      settlement: { referenceHash: `0x${'e'.repeat(64)}` },
    },
  }, { 'idempotency-replayed': 'true' });

  const resolution = await reconcileOperation({
    registry: stubRegistry(), record: readOperation(key, env), env, fetchImpl: settledFetch,
  });
  assert.equal(resolution.resolved, 'settled');
  assert.equal(resolution.chargedAtomic, '6000');

  const record = readOperation(key, env);
  assert.equal(record.state, 'settled');
  assert.equal(record.replayed, false, 'the discovered settlement is the real charge, so it counts');
  assert.equal(spentTodayAtomic(env), '6000');
  assert.equal(unreconciledOperations(env).length, 0);
});

test('B6 a record stuck in authorizing is treated as unreconciled', () => {
  const env = freshHome();
  writeOperation({
    schemaVersion: OPERATION_SCHEMA_VERSION,
    idempotencyKey: 'stuck-key-000000001',
    productId: 'search.web',
    resource: '/v1/search/paid',
    requestBodyHash: `sha256:${'f'.repeat(64)}`,
    requestBody: { query: 'x' },
    state: 'authorizing',
    startedAt: new Date().toISOString(),
    completedAt: null,
    quotedAtomic: '6000',
    chargedAtomic: null,
    operationId: 'op_stuck',
    receiptId: null,
    settlementReferenceHash: null,
    replayed: false,
    reason: null,
  }, env);

  /* A process that died between signing and hearing back is the same ambiguity
   * as an explicit unknown, so it must block spending too. */
  assert.equal(unreconciledOperations(env).length, 1);
  assert.throws(() => assertNothingUnreconciled(env), (error) => {
    assert.equal(error.code, 'unreconciled_operation_blocks_spend');
    return true;
  });
});

test('B6 the free path needs no wallet and reports that nothing was charged', async () => {
  const env = freshHome();
  const fetchImpl = async (url) => {
    assert.ok(String(url).endsWith('/v1/search/free'));
    return jsonResponse(200, {
      state: 'RECEIPTED',
      operationId: 'op_free',
      fundingMode: 'free',
      /* The live shape, confirmed against api.clervo.dev. */
      output: { searchResponse: { results: [{ title: 'a', url: 'https://example.com', snippet: 's' }] } },
    });
  };
  const outcome = await callFree({ registry: stubRegistry(), productId: 'search.web', body: { query: 'x' }, env, fetchImpl });
  /* `funding: 'free'` is the client's assertion that this outcome cost nothing.
   * It is only returned after the response is checked to be a free receipt. */
  assert.equal(outcome.funding, 'free');
  assert.equal(outcome.replayed, false);
  assert.equal(walletExists(env), false, 'the free path must not create a wallet');
  assert.equal(outcome.result.output.searchResponse.results.length, 1);
  /* The free call is recorded, so `clervo history` shows it, but it costs
   * nothing and must never count toward a spend limit. */
  assert.equal(spentTodayAtomic(env), '0');
  assert.equal(listOperations(env).length, 1);

  /* A response that is not actually free must be refused rather than reported as
   * a free success, or the CLI would claim nothing was charged when something
   * was. */
  const paidLooking = async () => jsonResponse(200, {
    state: 'RECEIPTED', operationId: 'op_x', fundingMode: 'x402', result: { results: [] },
  });
  await assert.rejects(
    callFree({ registry: stubRegistry(), productId: 'search.web', body: { query: 'x' }, env, fetchImpl: paidLooking }),
  );
});

test('B6 doctor detects a broken configuration', async () => {
  const env = freshHome();

  /* A wallet whose permissions are wrong, and an unreconciled operation, are
   * both failures a customer must be told about. */
  const created = createWallet({}, env);
  chmodSync(created.view.path, 0o644);
  writeOperation({
    schemaVersion: OPERATION_SCHEMA_VERSION,
    idempotencyKey: 'broken-key-00000001',
    productId: 'search.web',
    resource: '/v1/search/paid',
    requestBodyHash: `sha256:${'0'.repeat(64)}`,
    requestBody: { query: 'x' },
    state: 'unknown',
    startedAt: new Date().toISOString(),
    completedAt: null,
    quotedAtomic: '6000',
    chargedAtomic: null,
    operationId: 'op_broken',
    receiptId: null,
    settlementReferenceHash: null,
    replayed: false,
    reason: 'transport_failed_after_authorization',
  }, env);

  const unreachable = async () => { throw new Error('offline'); };
  const diagnosis = await diagnose({ env, fetchImpl: unreachable, checkBalance: false });

  assert.equal(diagnosis.healthy, false);
  const byId = new Map(diagnosis.checks.map((entry) => [entry.id, entry]));
  assert.equal(byId.get('wallet.permissions').status, 'fail');
  assert.equal(byId.get('registry.reachable').status, 'fail');
  assert.equal(byId.get('settlement.reconciled').status, 'fail');
  /* Every failure must carry something the customer can act on. */
  for (const entry of diagnosis.checks) {
    if (entry.status === 'fail') assert.ok(typeof entry.remedy === 'string' && entry.remedy.length > 0, `${entry.id} needs a remedy`);
  }
  /* The report is rendered to a terminal and may be pasted into an issue, so it
   * must not contain key material. */
  assert.equal(JSON.stringify(diagnosis).includes(created.mnemonic), false);

  /* A healthy machine reports healthy. */
  chmodSync(created.view.path, 0o600);
  const healthyEnv = freshHome();
  createWallet({}, healthyEnv);
  const reachable = async () => jsonResponse(200, {
    contractVersion: '2026-07-29.1',
    releaseId: 'test',
    products: [],
    observedTruth: { observedAt: '2026-08-07T00:00:00.000Z', products: [] },
  });
  const healthy = await diagnose({ env: healthyEnv, fetchImpl: reachable, checkBalance: false });
  assert.equal(healthy.checks.some((entry) => entry.status === 'fail'), false);
  assert.equal(healthy.healthy, true);
});

test('B6 a quote can be obtained without a wallet and does not charge', async () => {
  const env = freshHome();
  const fetchImpl = async () => jsonResponse(402, challengeBody('6000'));
  const quote = await requestQuote({
    registry: stubRegistry(), productId: 'search.web', body: { query: 'x' },
    idempotencyKey: 'quote-key-000000001', env, fetchImpl,
  });
  assert.equal(quote.amountAtomic, '6000');
  assert.equal(quote.amount, '0.006');
  assert.equal(quote.payTo, PAY_TO);
  assert.equal(walletExists(env), false, 'quoting must not require a wallet');
  assert.equal(listOperations(env).length, 0, 'quoting must not record an operation');
});
