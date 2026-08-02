import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const json = async (path) => JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('sandbox baseline requires gVisor and fails closed before runtime qualification', async () => {
  const schema = await json('packages/contracts/schemas/sandbox-runtime-policy.schema.json');
  const policy = await json('infra/sandbox/gvisor-runtime-policy.v1.json');
  const registry = await json('packages/catalog/platform-registry.v1.json');
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
  assert.equal(validate(policy), true, JSON.stringify(validate.errors));
  assert.deepEqual(policy.runtime, { class: 'gvisor', runtimeClassName: 'gvisor', plainContainerAllowed: false, dedicatedExecutionNodes: true, controlPlaneSeparated: true });
  assert.deepEqual(policy.network, { defaultEgress: 'deny', defaultIngress: 'deny', metadataAllowed: false, internalNetworksAllowed: false, modelGatewayAllowed: false });
  assert.equal(policy.identity.executionNodeSecrets, false);
  assert.equal(policy.forbidden.includes('hostSockets') && policy.forbidden.includes('walletMaterial'), true);
  assert.deepEqual(policy.qualification, { runtimeAttested: false, redTeamStatus: 'not_run', cleanupStatus: 'not_run', costStatus: 'not_run' });
  assert.ok(registry.capabilities.filter(({ pillarId }) => pillarId === 'sandbox').every(({ lifecycle, qualification }) => lifecycle === 'unavailable' && qualification === 'unqualified'));
});

test('sandbox policy rejects a plain-container downgrade or omitted controls', async () => {
  const schema = await json('packages/contracts/schemas/sandbox-runtime-policy.schema.json');
  const policy = await json('infra/sandbox/gvisor-runtime-policy.v1.json');
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
  assert.equal(validate({ ...policy, runtime: { ...policy.runtime, plainContainerAllowed: true } }), false);
  const { network, ...missingNetwork } = policy;
  assert.equal(validate(missingNetwork), false);
  assert.ok(network);
});
