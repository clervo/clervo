import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const onboarding = JSON.parse(await readFile('packages/distribution/onboarding.v1.json', 'utf8'));
const generated = JSON.parse(await readFile('generated/public/onboarding.json', 'utf8'));
const discovery = JSON.parse(await readFile('generated/public/.well-known/clervo.json', 'utf8'));

test('onboarding publishes the current customer journey', () => {
  const registry = JSON.parse(readFileSync('packages/catalog/live-registry.json', 'utf8'));
  assert.deepEqual(generated, onboarding);
  assert.equal(discovery.distribution.releaseCandidateId, undefined);
  assert.equal(discovery.distribution.interfaceHash, undefined);

  const searchLive = registry.products.find(({ id }) => id === 'search').publiclyReachable;
  assert.equal(generated.publicCallable, searchLive);
  assert.equal(generated.paymentImplemented, searchLive);
  assert.equal(generated.publicCallable, discovery.distribution.callable);

  // The journey keeps its six customer actions in order.
  assert.deepEqual(
    generated.journey.map(({ step }) => step),
    ['install', 'ask', 'fund', 'approve', 'result', 'receipt'],
  );
  assert.equal(generated.journey.find(({ step }) => step === 'install').state, 'published_verified');
  assert.equal(generated.journey.find(({ step }) => step === 'fund').state, 'user_managed');
  assert.equal(generated.journey.find(({ step }) => step === 'approve').state, 'explicit_wallet_action');
  // Every step carries a concrete action.
  for (const step of generated.journey) assert.ok(step.action.length >= 20, `${step.step} needs a real action`);
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

test('raw HTTP onboarding is static, explicit, and reflects current payment availability', async () => {
  const product = await readFile('apps/site/src/product.ts', 'utf8');
  const build = await readFile('apps/site/src/pages/Build.tsx', 'utf8');
  const html = await readFile('apps/site/dist/docs/http/index.html', 'utf8');
  assert.match(product, /curl --fail-with-body/u);
  assert.doesNotMatch(product, /idempotency-key: clervo_example_0001|stable-request-0001/iu);
  assert.match(product, /127\.0\.0\.1:8080/u);
  assert.match(build, /Package availability is not endpoint availability/iu);
  assert.doesNotMatch(build, /funding, signing, or settlement is available today/iu);
  assert.match(html, /Raw HTTP(?:<!-- -->)? client/u);
  assert.match(html, /https:\/\/api\.clervo\.dev/u);
  assert.match(html, /402/u);
  assert.doesNotMatch(html, /release candidate|commercially unproven|owner[- ]funded|quote observed unpaid/iu);
});
