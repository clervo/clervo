import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const onboarding = JSON.parse(await readFile('packages/distribution/onboarding.v1.json', 'utf8'));
const generated = JSON.parse(await readFile('generated/public/onboarding.json', 'utf8'));
const discovery = JSON.parse(await readFile('generated/public/.well-known/clervo.json', 'utf8'));

test('onboarding remains bound to the frozen candidate without implying payment', () => {
  assert.deepEqual(generated, onboarding);
  assert.equal(onboarding.releaseCandidateId, discovery.distribution.releaseCandidateId);
  assert.equal(onboarding.interfaceHash, discovery.distribution.interfaceHash);
  assert.equal(onboarding.publicCallable, false);
  assert.equal(onboarding.paymentImplemented, false);
  assert.equal(onboarding.journey.find(({ step }) => step === 'install').state, 'published_verified');
  assert.deepEqual(
    onboarding.journey.map(({ step }) => step),
    ['install', 'ask', 'fund', 'approve', 'result', 'receipt'],
  );
  assert.equal(onboarding.journey.find(({ step }) => step === 'fund').state, 'unavailable');
  assert.equal(discovery.artifacts.onboarding, '/onboarding.json');
});

test('six recovery classes each expose one explicit bounded action', () => {
  assert.deepEqual(
    onboarding.recovery.map(({ code }) => code),
    ['insufficient_funds', 'wrong_network_or_asset', 'expired_quote', 'rejected', 'timeout', 'unknown_settlement'],
  );
  assert.ok(onboarding.recovery.every(({ action, problemCodes }) => action.length >= 20 && problemCodes.length >= 1));
  for (const item of onboarding.recovery.filter(({ retry }) => retry === 'prohibited_until_reconciled')) {
    assert.match(item.action, /reconcile/iu);
  }
  assert.match(
    onboarding.recovery.find(({ code }) => code === 'unknown_settlement').action,
    /do not authorize or retry/iu,
  );
});

test('raw HTTP onboarding is static, explicit, and non-payable', async () => {
  const product = await readFile('apps/site/src/product.ts', 'utf8');
  const build = await readFile('apps/site/src/pages/Build.tsx', 'utf8');
  const html = await readFile('apps/site/dist/docs/http/index.html', 'utf8');
  assert.match(product, /curl --fail-with-body/u);
  assert.match(product, /idempotency-key: clervo_example_0001/u);
  assert.match(product, /127\.0\.0\.1:8080/u);
  assert.match(build, /funding, signing, or settlement is available today/iu);
  assert.match(html, /Raw HTTP(?:<!-- -->)? client/u);
  assert.match(html, /Public packages verified/iu);
});
