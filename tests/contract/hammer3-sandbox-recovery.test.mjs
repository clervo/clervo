import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { AgentSandboxExecutor } from '../../dist/adapters/sandbox/src/agent-sandbox.js';
import {
  SANDBOX_MAX_ARTIFACT_BYTES,
  SANDBOX_MAX_INLINE_INPUT_BYTES,
  SANDBOX_MAX_OUTPUT_BYTES,
  assertSandboxOperationRequest,
  createSandboxOperationResult,
} from '../../dist/packages/contracts/src/sandbox.js';
import { SandboxControlPlane } from '../../dist/services/sandbox/src/control-plane.js';
import { normalizeSandboxHttpRequest, sandboxHttpRequestHash } from '../../apps/api/src/x402-paid-sandbox.mjs';

const sessionId = 'sbx_0123456789ABCDEFGHIJ';
const executionId = 'exec_0123456789ABCDEFGHIJ';
const tenantId = 'tenant_0123456789ABCDEFGHIJ';
const imageDigest = `sha256:${'a'.repeat(64)}`;
const limits = { cpuMillis: 1_000, memoryBytes: 134_217_728, processes: 16, diskBytes: 10_485_760, outputBytes: 4_096, artifactBytes: 4_096, wallTimeMs: 2_000, maximumChargeMicrousd: 1_000 };

function operation(input) {
  return {
    contractVersion: '2026-07-29.1', schemaVersion: 'sandbox-operation-request.v1', operationId: 'op_0123456789ABCDEFGHIJ', productId: 'sandbox.run',
    input: { kind: 'run', executionId, imageDigest, limits: Object.fromEntries(Object.entries(limits).filter(([key]) => key !== 'maximumChargeMicrousd')), ...input },
    maximumCharge: { asset: 'USD', amountAtomic: '1000', decimals: 6 }, deadlineAt: '2099-08-16T12:00:00.000Z',
  };
}

function executor() {
  const calls = [];
  return {
    calls,
    async create() { return { runtimeClass: 'gvisor', dedicatedExecutionNodes: true, controlPlaneSeparated: true, networkDefaultDeny: true, serviceAccountTokenMounted: false, executionNodeSecrets: false, imageDigest, readOnlyRootFilesystem: true }; },
    async execute(input) { calls.push(input); return { exitCode: 0, stdout: new TextEncoder().encode('ok'), stderr: new Uint8Array(), cpuMillis: 1, durationMs: 2, artifacts: [] }; },
    async destroy() {}, async list() { return []; },
  };
}

test('Hammer 3 program form accepts bounded scripts above 4 KiB without expanding raw command arguments', () => {
  const nodeCode = `const marker = 'node';${'void 0;'.repeat(800)}process.stdout.write(marker);`;
  const pythonCode = `marker = 'python';${'marker = marker;'.repeat(400)}print(marker, end='')`;
  assert.ok(nodeCode.length > 4_096); assert.ok(pythonCode.length > 4_096);
  const node = normalizeSandboxHttpRequest({ runtime: 'node', code: nodeCode, args: ['first'], limits: { artifactBytes: SANDBOX_MAX_ARTIFACT_BYTES } });
  const python = normalizeSandboxHttpRequest({ runtime: 'python', code: pythonCode, args: ['first'] });
  assert.deepEqual(node.command.slice(0, 3), ['node', '-e', nodeCode]);
  assert.deepEqual(python.command.slice(0, 3), ['python3', '-c', pythonCode]);
  assert.throws(() => normalizeSandboxHttpRequest({ command: ['node', '-e', nodeCode] }), /sandbox_command_invalid/u);
  assert.throws(() => normalizeSandboxHttpRequest({ runtime: 'node', code: 'x'.repeat(262_145) }), /sandbox_program_invalid/u);
});

test('Hammer 3 file input has one truthful 1 MiB decoded envelope with canonical binary and duplicate/path rejection', () => {
  const command = ['true'];
  const nearLimit = Buffer.alloc(SANDBOX_MAX_INLINE_INPUT_BYTES - Buffer.byteLength(command[0]), 0xa5);
  assert.doesNotThrow(() => assertSandboxOperationRequest(operation({ command, files: [{ path: 'nested/blob.bin', contentBase64: nearLimit.toString('base64') }] })));
  assert.throws(() => assertSandboxOperationRequest(operation({ command, files: [{ path: 'blob.bin', contentBase64: Buffer.concat([nearLimit, Buffer.of(0)]).toString('base64') }] })), /inline_input_too_large/u);
  assert.doesNotThrow(() => assertSandboxOperationRequest(operation({ command, files: [{ path: 'empty.txt', contentBase64: '' }, { path: 'nested/text.txt', contentBase64: Buffer.from('text').toString('base64') }] })));
  assert.throws(() => assertSandboxOperationRequest(operation({ command, files: [{ path: 'same', contentBase64: '' }, { path: 'same', contentBase64: '' }] })), /duplicate/u);
  for (const path of ['../escape', './dot', '/absolute', 'a\\b', 'a//b', '.clervo-runtime/program.js']) {
    assert.throws(() => assertSandboxOperationRequest(operation({ command, files: [{ path, contentBase64: '' }] })), /path_invalid/u);
  }
});

test('Hammer 3 artifact contract is transport-bounded and never fabricates a clean scan', () => {
  assert.equal(SANDBOX_MAX_OUTPUT_BYTES, 1_048_576); assert.equal(SANDBOX_MAX_ARTIFACT_BYTES, 1_048_576);
  const bytes = Buffer.from('artifact'); const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const request = operation({ command: ['true'], artifactPaths: [{ path: 'nested/result.bin', filename: 'renamed.bin', mimeType: 'application/octet-stream' }] });
  const output = { kind: 'execution', sessionId, executionId, sessionState: 'destroyed', exitCode: 0, stdoutBase64: '', stderrBase64: '', cpuMillis: 1, durationMs: 2, artifacts: [{ artifactId: `art_${sha256.slice(7, 39)}`, filename: 'renamed.bin', mimeType: 'application/octet-stream', bytes: bytes.length, sha256, artifactUri: `artifact://generated/${tenantId}/${sha256.slice(7)}`, scan: { verdict: 'not_scanned', scannerVersion: null }, contentBase64: bytes.toString('base64') }] };
  assert.doesNotThrow(() => createSandboxOperationResult({ request, completedAt: '2099-08-16T11:59:59.000Z', meteredCharge: { asset: 'USD', amountAtomic: '0', decimals: 6 }, output }));
  assert.throws(() => createSandboxOperationResult({ request, completedAt: '2099-08-16T11:59:59.000Z', meteredCharge: { asset: 'USD', amountAtomic: '0', decimals: 6 }, output: { ...output, artifacts: [{ ...output.artifacts[0], contentBase64: Buffer.from('substituted').toString('base64') }] } }), /artifact_content_invalid/u);
});

test('Hammer 3 replay identity binds code, stdin, every file, artifact request, limits, and image', async () => {
  const runtime = executor(); const plane = new SandboxControlPlane(runtime, () => 1_000, { allows: (digest) => digest === imageDigest });
  await plane.create({ sessionId, tenantId, imageDigest, limits, ttlMs: 5_000 });
  const base = { sessionId, executionId, tenantId, command: ['node', '-e', 'process.stdout.write("ok")'], stdin: new TextEncoder().encode('stdin'), files: [{ path: 'input.txt', contentBase64: Buffer.from('one').toString('base64') }], artifactPaths: [{ path: 'result.txt' }] };
  const first = await plane.execute(base); assert.deepEqual(await plane.execute(base), first); assert.equal(runtime.calls.length, 1);
  for (const changed of [
    { ...base, command: ['node', '-e', 'process.stdout.write("changed")'] },
    { ...base, stdin: new TextEncoder().encode('changed') },
    { ...base, files: [{ path: 'input.txt', contentBase64: Buffer.from('two').toString('base64') }] },
    { ...base, artifactPaths: [{ path: 'other.txt' }] },
  ]) await assert.rejects(plane.execute(changed), /sandbox_idempotency_conflict/u);
  const hashes = [base, { ...base, stdin: new TextEncoder().encode('changed') }, { ...base, files: [{ path: 'input.txt', contentBase64: Buffer.from('two').toString('base64') }] }, { ...base, artifactPaths: [{ path: 'other.txt' }] }]
    .map((value) => sandboxHttpRequestHash(normalizeSandboxHttpRequest({ command: value.command, stdinBase64: Buffer.from(value.stdin).toString('base64'), files: value.files, artifactPaths: value.artifactPaths })));
  assert.equal(new Set(hashes).size, hashes.length);
});

test('Hammer 3 adapter rejects artifact hash substitution and runner source avoids large argv', async () => {
  const bytes = Buffer.from('artifact');
  const transport = { async exec() { return { exitCode: 0, stderr: new Uint8Array(), stdout: new TextEncoder().encode(JSON.stringify({ exitCode: 0, stdoutBase64: '', stderrBase64: '', cpuMillis: 1, durationMs: 2, maximumProcessesObserved: 1, limitFailure: null, artifacts: [{ path: 'result.bin', filename: 'result.bin', mimeType: 'application/octet-stream', bytes: bytes.length, sha256: `sha256:${'0'.repeat(64)}`, contentBase64: bytes.toString('base64') }] })) }; } };
  const adapter = new AgentSandboxExecutor({ transport, config: { imageRepository: 'us-central1-docker.pkg.dev/example/repository/runner', readinessTimeoutMs: 5_000 } });
  await assert.rejects(adapter.execute({ sessionId, executionId, command: ['true'], stdin: new Uint8Array(), limits }), /runner_response_invalid/u);
  const runner = await readFile('infra/sandbox/runner/runner.mjs', 'utf8');
  assert.match(runner, /writeFileSync\(programPath, request\.command\[2\]/u);
  assert.match(runner, /childCommand = \[request\.command\[0\], request\.command\[1\], loader/u);
  assert.doesNotMatch(runner, /spawn\('\/opt\/clervo\/sandbox-init', request\.command/u);
  assert.match(runner, /MAX_WORKSPACE_ENTRIES = 4_096/u);
  assert.match(runner, /observed\.bytes > limits\.diskBytes \|\| observed\.entries > MAX_WORKSPACE_ENTRIES/u);
});
