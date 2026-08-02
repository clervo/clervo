import assert from 'node:assert/strict';
import test from 'node:test';

import { createSandboxOperationResult, verifySandboxOperationResult } from '../../dist/packages/contracts/src/sandbox.js';

const request = {
  contractVersion: '2026-07-29.1', schemaVersion: 'sandbox-operation-request.v1', operationId: 'op_0123456789ABCDEFGHIJ', productId: 'sandbox.run', deadlineAt: '2026-08-02T12:00:00.000Z', maximumCharge: { asset: 'USD', amountAtomic: '1000', decimals: 6 },
  input: { kind: 'run', executionId: 'exec_0123456789ABCDEFGHIJ', imageDigest: `sha256:${'a'.repeat(64)}`, command: ['node'], limits: { cpuMillis: 1000, memoryBytes: 134217728, processes: 16, diskBytes: 10485760, outputBytes: 1024, artifactBytes: 4096, wallTimeMs: 2000 } },
};
const output = { kind: 'execution', sessionId: 'sbx_0123456789ABCDEFGHIJ', executionId: request.input.executionId, sessionState: 'destroyed', exitCode: 0, stdoutBase64: Buffer.from('ok').toString('base64'), stderrBase64: '', cpuMillis: 10, durationMs: 20, artifacts: [] };

test('sandbox result is hash-bound, charge-capped, limit-checked, and proves one-shot cleanup', () => {
  const result = createSandboxOperationResult({ request, completedAt: '2026-08-02T11:59:59.000Z', meteredCharge: { asset: 'USD', amountAtomic: '900', decimals: 6 }, output });
  assert.equal(verifySandboxOperationResult(result, request), true); assert.match(result.resultHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(verifySandboxOperationResult({ ...result, output: { ...result.output, exitCode: 1 } }, request), false);
  assert.throws(() => createSandboxOperationResult({ request, completedAt: '2026-08-02T11:59:59.000Z', meteredCharge: { asset: 'USD', amountAtomic: '1001', decimals: 6 }, output }), /charge_exceeded/u);
  assert.throws(() => createSandboxOperationResult({ request, completedAt: '2026-08-02T11:59:59.000Z', meteredCharge: { asset: 'USD', amountAtomic: '900', decimals: 6 }, output: { ...output, sessionState: 'ready' } }), /execution_invalid/u);
  assert.throws(() => createSandboxOperationResult({ request, completedAt: '2026-08-02T11:59:59.000Z', meteredCharge: { asset: 'USD', amountAtomic: '900', decimals: 6 }, output: { ...output, stdoutBase64: Buffer.alloc(1025).toString('base64') } }), /limit_exceeded/u);
});
