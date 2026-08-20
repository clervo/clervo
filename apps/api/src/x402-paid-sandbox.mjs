import { createHash } from 'node:crypto';

import {
  CONTRACT_VERSION,
  SANDBOX_MAX_ARTIFACT_BYTES,
  SANDBOX_MAX_INLINE_INPUT_BYTES,
  SANDBOX_MAX_INLINE_PROGRAM_BYTES,
  SANDBOX_OPERATION_REQUEST_SCHEMA_VERSION,
  assertSandboxOperationRequest,
  validSandboxInlineProgram,
} from '../../../dist/packages/contracts/src/index.js';
import {
  assertOperationKeys,
  assertOperationObject,
  createX402PaidOperationProcessor,
  operationExecutionRequest,
  operationHttpResult,
  operationRequestHash,
} from './x402-paid-operation.mjs';

export const SANDBOX_PAID_PATH = '/v1/sandbox/execute';
export const SANDBOX_MAX_BODY_BYTES = 1_500_000;
export const SANDBOX_RUN_PRICE_CLASSES = Object.freeze({
  short: Object.freeze({
    classId: 'sandbox.short',
    priceVersion: 'sandbox-run-short-2026-08-09.1',
    maximumCharge: Object.freeze({ asset: 'USDC', amountAtomic: '10000', decimals: 6 }),
    supplierCost: Object.freeze({ asset: 'usd', amountAtomic: '8000', decimals: 6 }),
    costBasisId: 'sandbox-owned-gke-short-2026-08-09.1',
  }),
  standard: Object.freeze({
    classId: 'sandbox.standard',
    priceVersion: 'sandbox-run-standard-2026-08-09.1',
    maximumCharge: Object.freeze({ asset: 'USDC', amountAtomic: '60000', decimals: 6 }),
    supplierCost: Object.freeze({ asset: 'usd', amountAtomic: '45000', decimals: 6 }),
    costBasisId: 'sandbox-owned-gke-standard-2026-08-09.1',
  }),
});
export const SANDBOX_RUN_PRICING = SANDBOX_RUN_PRICE_CLASSES.standard;

const maximumLimits = Object.freeze({
  cpuMillis: 30_000,
  memoryBytes: 536_870_912,
  processes: 64,
  diskBytes: 1_073_741_824,
  outputBytes: 1_048_576,
  artifactBytes: SANDBOX_MAX_ARTIFACT_BYTES,
  wallTimeMs: 60_000,
});
const minimumLimits = Object.freeze({
  cpuMillis: 1,
  memoryBytes: 16_777_216,
  processes: 1,
  diskBytes: 1_048_576,
  outputBytes: 1,
  artifactBytes: 1,
  wallTimeMs: 100,
});
const shortLimits = Object.freeze({
  cpuMillis: 5_000,
  memoryBytes: 268_435_456,
  processes: 16,
  diskBytes: 67_108_864,
  outputBytes: 65_536,
  artifactBytes: 1_048_576,
  wallTimeMs: 10_000,
});

function object(value, code) {
  return assertOperationObject(value, code);
}

function exactKeys(value, allowed, code) {
  assertOperationKeys(value, allowed, code);
}

function normalizedLimits(value = {}) {
  object(value, 'sandbox_limits_invalid');
  exactKeys(value, Object.keys(maximumLimits), 'sandbox_limits_additional_property');
  const limits = {};
  for (const [key, maximum] of Object.entries(maximumLimits)) {
    const selected = value[key] ?? maximum;
    if (!Number.isSafeInteger(selected) || selected < minimumLimits[key] || selected > maximum) throw new TypeError(`sandbox_limit_invalid_${key}`);
    limits[key] = selected;
  }
  return Object.freeze(limits);
}

export function normalizeSandboxHttpRequest(value) {
  object(value, 'sandbox_http_request_invalid');
  exactKeys(value, ['command', 'runtime', 'code', 'args', 'stdinBase64', 'limits', 'files', 'artifactPaths'], 'sandbox_http_request_additional_property');
  const hasCommand = value.command !== undefined;
  const hasProgram = value.runtime !== undefined || value.code !== undefined || value.args !== undefined;
  if (hasCommand === hasProgram) throw new TypeError('sandbox_command_or_program_required');
  let command;
  if (hasCommand) {
    if (!Array.isArray(value.command) || value.command.length < 1 || value.command.length > 32 || value.command.some((part) => typeof part !== 'string' || part.length < 1 || part.length > 4_096 || /[\u0000-\u001F\u007F]/u.test(part))) throw new TypeError('sandbox_command_invalid');
    command = [...value.command];
  } else {
    if (!['node', 'python'].includes(value.runtime) || !validSandboxInlineProgram(value.code)) throw new TypeError('sandbox_program_invalid');
    if (value.args !== undefined && (!Array.isArray(value.args) || value.args.length > 29 || value.args.some((part) => typeof part !== 'string' || part.length < 1 || part.length > 4_096 || /[\u0000-\u001F\u007F]/u.test(part)))) throw new TypeError('sandbox_args_invalid');
    command = [value.runtime === 'python' ? 'python3' : 'node', value.runtime === 'python' ? '-c' : '-e', value.code, ...(value.args ?? [])];
  }
  if (value.files !== undefined && !Array.isArray(value.files)) throw new TypeError('sandbox_files_invalid');
  if (value.artifactPaths !== undefined && !Array.isArray(value.artifactPaths)) throw new TypeError('sandbox_artifacts_invalid');
  const normalized = Object.freeze({
    command: Object.freeze(command),
    ...(value.stdinBase64 === undefined ? {} : { stdinBase64: value.stdinBase64 }),
    ...(value.files === undefined ? {} : { files: Object.freeze(value.files.map((item) => Object.freeze({ ...item }))) }),
    ...(value.artifactPaths === undefined ? {} : { artifactPaths: Object.freeze(value.artifactPaths.map((item) => Object.freeze({ ...item }))) }),
    limits: normalizedLimits(value.limits),
  });
  const probe = {
    contractVersion: CONTRACT_VERSION,
    schemaVersion: SANDBOX_OPERATION_REQUEST_SCHEMA_VERSION,
    operationId: `op_${'0'.repeat(32)}`,
    productId: 'sandbox.run',
    input: { kind: 'run', executionId: `exec_${'0'.repeat(32)}`, imageDigest: `sha256:${'0'.repeat(64)}`, ...normalized },
    maximumCharge: { asset: 'USD', amountAtomic: SANDBOX_RUN_PRICING.supplierCost.amountAtomic, decimals: 6 },
    deadlineAt: '2099-01-01T00:00:00.000Z',
  };
  assertSandboxOperationRequest(probe);
  return normalized;
}

export function sandboxHttpRequestHash(normalized) {
  return operationRequestHash({ resourcePath: SANDBOX_PAID_PATH, productId: 'sandbox.run', input: normalized });
}

export function sandboxRunPricing(normalized) {
  const limits = normalized?.limits;
  if (!limits || typeof limits !== 'object') throw new TypeError('sandbox_pricing_limits_required');
  const short = Object.entries(shortLimits).every(([key, maximum]) => Number.isSafeInteger(limits[key]) && limits[key] <= maximum);
  return short ? SANDBOX_RUN_PRICE_CLASSES.short : SANDBOX_RUN_PRICE_CLASSES.standard;
}

function payerTenant(authorization) {
  const payer = authorization?.verification?.payer;
  if (!/^0x[a-fA-F0-9]{40}$/u.test(payer ?? '')) throw Object.assign(new Error('sandbox_payer_identity_invalid'), { status: 502 });
  return `tenant_${createHash('sha256').update(payer.toLowerCase()).digest('hex').slice(0, 32)}`;
}

function executionId(operationId) {
  return `exec_${createHash('sha256').update(`sandbox:${operationId}`).digest('hex').slice(0, 32)}`;
}

export const SANDBOX_DISCOVERY = Object.freeze({
  method: 'POST',
  bodyType: 'json',
  input: Object.freeze({ command: Object.freeze(['node', '-e', "process.stdout.write('ready')"]), limits: shortLimits }),
  inputSchema: Object.freeze({
    type: 'object', additionalProperties: false,
    oneOf: Object.freeze([
      Object.freeze({ required: Object.freeze(['command']), not: Object.freeze({ anyOf: Object.freeze([Object.freeze({ required: Object.freeze(['runtime']) }), Object.freeze({ required: Object.freeze(['code']) }), Object.freeze({ required: Object.freeze(['args']) })]) }) }),
      Object.freeze({ required: Object.freeze(['runtime', 'code']), not: Object.freeze({ required: Object.freeze(['command']) }) }),
    ]),
    properties: Object.freeze({
      command: Object.freeze({ type: 'array', minItems: 1, maxItems: 32, items: Object.freeze({ type: 'string', minLength: 1, maxLength: 4096 }) }),
      runtime: Object.freeze({ type: 'string', enum: ['node', 'python'] }),
      code: Object.freeze({ type: 'string', minLength: 1, maxLength: SANDBOX_MAX_INLINE_PROGRAM_BYTES }),
      args: Object.freeze({ type: 'array', maxItems: 29, items: Object.freeze({ type: 'string', minLength: 1, maxLength: 4096 }) }),
      stdinBase64: Object.freeze({ type: 'string', maxLength: Math.ceil(SANDBOX_MAX_INLINE_INPUT_BYTES / 3) * 4 }),
      files: Object.freeze({ type: 'array', maxItems: 32, description: `Decoded code, stdin, and file content share a ${SANDBOX_MAX_INLINE_INPUT_BYTES}-byte aggregate envelope.`, items: Object.freeze({ type: 'object', required: ['path', 'contentBase64'], additionalProperties: false, properties: Object.freeze({ path: Object.freeze({ type: 'string', minLength: 1, maxLength: 256 }), contentBase64: Object.freeze({ type: 'string', maxLength: Math.ceil(SANDBOX_MAX_INLINE_INPUT_BYTES / 3) * 4 }) }) }) }),
      artifactPaths: Object.freeze({ type: 'array', maxItems: 32, items: Object.freeze({ type: 'object', required: ['path'], additionalProperties: false, properties: Object.freeze({ path: Object.freeze({ type: 'string', minLength: 1, maxLength: 256 }), filename: Object.freeze({ type: 'string', minLength: 1, maxLength: 128 }), mimeType: Object.freeze({ type: 'string', minLength: 3, maxLength: 129 }) }) }) }),
      limits: Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze(Object.fromEntries(Object.entries(maximumLimits).map(([key, maximum]) => [key, { type: 'integer', minimum: minimumLimits[key], maximum }]))) }),
    }),
  }),
  output: Object.freeze({
    example: Object.freeze({ productId: 'sandbox.run', state: 'RECEIPTED', replayed: false, result: Object.freeze({ output: Object.freeze({ kind: 'execution', exitCode: 0, stdoutBase64: 'cmVhZHk=' }) }), receipt: Object.freeze({ settlement: Object.freeze({ status: 'settled' }) }) }),
    schema: Object.freeze({ type: 'object', additionalProperties: true }),
  }),
});

export function createX402PaidSandboxProcessor({ service, stateStore, gateway, runnerDigest, acquireExecution, acquireQuote } = {}) {
  if (!gateway || typeof gateway.run !== 'function' || gateway.durable !== true) throw new TypeError('invalid_public_sandbox_gateway');
  if (!/^sha256:[a-f0-9]{64}$/u.test(runnerDigest ?? '')) throw new TypeError('invalid_public_sandbox_runner_digest');
  const processor = createX402PaidOperationProcessor({ service, stateStore, acquireExecution, acquireQuote });
  return Object.freeze({
    mode: processor.mode,
    durable: processor.durable,
    async process({ idempotencyKey, requestHash, operationId, normalized, paymentHeader, authorizationHeader, now, deadlineAt, signal }) {
      const pricing = sandboxRunPricing(normalized);
      /* Sandbox bounds the runtime by the supplier cost: it rents real
       * compute per run. Its deadline is the only content-dependent one on the
       * platform — a run may legitimately take as long as the wall-time limit
       * the customer bought, plus scheduling overhead. */
      const request = operationExecutionRequest({
        schemaVersion: SANDBOX_OPERATION_REQUEST_SCHEMA_VERSION,
        operationId,
        productId: 'sandbox.run',
        input: Object.freeze({ kind: 'run', executionId: executionId(operationId), imageDigest: runnerDigest, ...normalized }),
        boundAmountAtomic: pricing.supplierCost.amountAtomic,
        now,
        deadlineMs: normalized.limits.wallTimeMs + 60_000,
        deadlineAt,
      });
      assertSandboxOperationRequest(request);
      return processor.process({
        idempotencyKey, requestHash, operationId, productId: 'sandbox.run', executionInput: request,
        paymentHeader, authorizationHeader, now, pricing,
        resourcePath: SANDBOX_PAID_PATH, discovery: SANDBOX_DISCOVERY, overloadCode: 'sandbox_overloaded',
        deadlineAt, signal,
        async execute(executionRequest, { authorization }) {
          const completed = await gateway.run({ tenantId: payerTenant(authorization), request: executionRequest });
          return Object.freeze({
            output: completed.result,
            provenance: Object.freeze([Object.freeze({
              adapterId: 'adapter_sandbox.gvisor',
              qualificationId: `qual_${runnerDigest.slice('sha256:'.length, 'sha256:'.length + 32)}`,
              providerReferenceHash: completed.result.resultHash,
              routeId: 'clervo.sandbox.gvisor.one_shot.v1',
              degraded: false,
              costBasisId: pricing.costBasisId,
            })]),
          });
        },
        createResponse({ output, receipt }) {
          const result = operationHttpResult({ operationId, productId: 'sandbox.run', requestHash, output, receipt });
          return Object.freeze({
            ...result,
            execution: Object.freeze({
              executionId: request.input.executionId,
              classId: pricing.classId,
              requestedLimits: normalized.limits,
              runtime: Object.freeze({ routeId: 'clervo.sandbox.gvisor.one_shot.v1', isolation: 'gvisor', imageDigest: runnerDigest, qualificationId: `qual_${runnerDigest.slice('sha256:'.length, 'sha256:'.length + 32)}` }),
              cleanup: Object.freeze({ state: output.output.sessionState }),
              cost: Object.freeze({ semantics: 'documented_cost_basis', basisId: pricing.costBasisId, amount: pricing.supplierCost }),
            }),
          });
        },
      });
    },
  });
}
