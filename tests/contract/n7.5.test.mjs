import assert from 'node:assert/strict';
import test from 'node:test';

import { assertSandboxOperationRequest } from '../../dist/packages/contracts/src/sandbox.js';

const request = {
  contractVersion: '2026-07-29.1', schemaVersion: 'sandbox-operation-request.v1', operationId: 'op_0123456789ABCDEFGHIJ', productId: 'sandbox.run', deadlineAt: '2026-08-02T12:00:00.000Z', maximumCharge: { asset: 'USD', amountAtomic: '1000', decimals: 6 },
  input: { kind: 'run', executionId: 'exec_0123456789ABCDEFGHIJ', imageDigest: `sha256:${'a'.repeat(64)}`, command: ['node', 'main.js'], limits: { cpuMillis: 1000, memoryBytes: 134217728, processes: 16, diskBytes: 10485760, outputBytes: 1024, artifactBytes: 4096, wallTimeMs: 2000 } },
};

test('sandbox public request accepts only bounded product-matched operations', () => {
  assert.doesNotThrow(() => assertSandboxOperationRequest(request));
  assert.throws(() => assertSandboxOperationRequest({ ...request, productId: 'sandbox.artifact.get' }), /operation_invalid/u);
  assert.throws(() => assertSandboxOperationRequest({ ...request, maximumCharge: { asset: 'USD', amountAtomic: '1000001', decimals: 6 } }), /maximum_charge_invalid/u);
  assert.throws(() => assertSandboxOperationRequest({ ...request, input: { ...request.input, imageDigest: 'latest' } }), /run_invalid/u);
  assert.throws(() => assertSandboxOperationRequest({ ...request, input: { ...request.input, stdinBase64: 'not base64' } }), /stdin_invalid/u);
  assert.throws(() => assertSandboxOperationRequest({ ...request, input: { ...request.input, limits: { ...request.input.limits, memoryBytes: 1 } } }), /limit_invalid:memoryBytes/u);
});
