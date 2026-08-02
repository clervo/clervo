import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const json = async (path) => JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('every declared RPC chain has recorded semantic supply while restricted routes stay unavailable', async () => {
  const schema = await json('packages/contracts/schemas/rpc-provider-routes.schema.json');
  const registry = await json('infra/rpc/provider-routes.v1.json');
  const chains = await json('infra/rpc/chain-registry.v1.json');
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
  assert.equal(validate(registry), true, JSON.stringify(validate.errors));
  assert.equal(registry.customerRoutingEnabled, false);
  assert.deepEqual(new Set(registry.routes.map(({ chainId }) => chainId)), new Set(chains.chains.map(({ chainId }) => chainId)));
  assert.ok(registry.routes.every(({ technicalStatus, termsStatus, resaleStatus, customerRoutingEnabled, archiveQualified, broadcastQualified, semanticMethods }) =>
    technicalStatus === 'passed' && termsStatus !== 'approved' && resaleStatus !== 'approved' && customerRoutingEnabled === false
      && archiveQualified === false && broadcastQualified === false && semanticMethods.length >= 3));
  assert.equal(JSON.stringify(registry).includes('https://'), false);
  assert.equal(JSON.stringify(registry).match(/(?:secret|credential|api.?key)/giu), null);
});
