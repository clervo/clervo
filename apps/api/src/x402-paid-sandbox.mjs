import { createHash } from 'node:crypto';

import {
  CONTRACT_VERSION,
  SANDBOX_OPERATION_REQUEST_SCHEMA_VERSION,
  assertSandboxOperationRequest,
  hashJson,
} from '../../../dist/packages/contracts/src/index.js';
import { createX402PaidOperationProcessor } from './x402-paid-operation.mjs';

export const SANDBOX_PAID_PATH = '/v1/sandbox/execute';
export const SANDBOX_MAX_BODY_BYTES = 1_500_000;
export const SANDBOX_RUN_PRICING = Object.freeze({
  priceVersion: 'sandbox-run-public-2026-08-04.1',
  maximumCharge: Object.freeze({ asset: 'USDC', amountAtomic: '120000', decimals: 6 }),
  supplierCost: Object.freeze({ asset: 'usd', amountAtomic: '100000', decimals: 6 }),
});

const maximumLimits = Object.freeze({
  cpuMillis: 30_000,
  memoryBytes: 536_870_912,
  processes: 64,
  diskBytes: 1_073_741_824,
  outputBytes: 1_048_576,
  artifactBytes: 10_485_760,
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

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return value;
}

function exactKeys(value, allowed, code) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError(code);
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
  exactKeys(value, ['command', 'stdinBase64', 'limits'], 'sandbox_http_request_additional_property');
  if (!Array.isArray(value.command)) throw new TypeError('sandbox_command_invalid');
  const normalized = Object.freeze({
    command: Object.freeze([...value.command]),
    ...(value.stdinBase64 === undefined ? {} : { stdinBase64: value.stdinBase64 }),
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
  return hashJson({ target: SANDBOX_PAID_PATH, productId: 'sandbox.run', input: normalized });
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
  input: Object.freeze({ command: Object.freeze(['node', '-e', "process.stdout.write('ready')"]) }),
  inputSchema: Object.freeze({
    type: 'object', required: ['command'], additionalProperties: false,
    properties: Object.freeze({
      command: Object.freeze({ type: 'array', minItems: 1, maxItems: 32, items: Object.freeze({ type: 'string', minLength: 1, maxLength: 4096 }) }),
      stdinBase64: Object.freeze({ type: 'string' }),
      limits: Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze(Object.fromEntries(Object.entries(maximumLimits).map(([key, maximum]) => [key, { type: 'integer', minimum: minimumLimits[key], maximum }]))) }),
    }),
  }),
  output: Object.freeze({
    example: Object.freeze({ productId: 'sandbox.run', state: 'RECEIPTED', replayed: false, result: Object.freeze({ output: Object.freeze({ kind: 'execution', exitCode: 0, stdoutBase64: 'cmVhZHk=' }) }), receipt: Object.freeze({ settlement: Object.freeze({ status: 'settled' }) }) }),
    schema: Object.freeze({ type: 'object', additionalProperties: true }),
  }),
});

export function createX402PaidSandboxProcessor({ service, stateStore, gateway, runnerDigest, acquireExecution } = {}) {
  if (!gateway || typeof gateway.run !== 'function' || gateway.durable !== true) throw new TypeError('invalid_public_sandbox_gateway');
  if (!/^sha256:[a-f0-9]{64}$/u.test(runnerDigest ?? '')) throw new TypeError('invalid_public_sandbox_runner_digest');
  const processor = createX402PaidOperationProcessor({ service, stateStore, acquireExecution });
  return Object.freeze({
    mode: processor.mode,
    durable: processor.durable,
    async process({ idempotencyKey, requestHash, operationId, normalized, paymentHeader, authorizationHeader, now }) {
      const request = Object.freeze({
        contractVersion: CONTRACT_VERSION,
        schemaVersion: SANDBOX_OPERATION_REQUEST_SCHEMA_VERSION,
        operationId,
        productId: 'sandbox.run',
        input: Object.freeze({ kind: 'run', executionId: executionId(operationId), imageDigest: runnerDigest, ...normalized }),
        maximumCharge: Object.freeze({ asset: 'USD', amountAtomic: SANDBOX_RUN_PRICING.supplierCost.amountAtomic, decimals: 6 }),
        deadlineAt: new Date(Date.parse(now) + normalized.limits.wallTimeMs + 60_000).toISOString(),
      });
      assertSandboxOperationRequest(request);
      return processor.process({
        idempotencyKey, requestHash, operationId, productId: 'sandbox.run', executionInput: request,
        paymentHeader, authorizationHeader, now, pricing: SANDBOX_RUN_PRICING,
        resourcePath: SANDBOX_PAID_PATH, discovery: SANDBOX_DISCOVERY, overloadCode: 'sandbox_overloaded',
        async execute(executionRequest, { authorization }) {
          const completed = await gateway.run({ tenantId: payerTenant(authorization), request: executionRequest });
          return Object.freeze({
            output: completed.result,
            provenance: Object.freeze([Object.freeze({
              adapterId: 'adapter_sandbox.gvisor',
              qualificationId: `qual_${runnerDigest.slice('sha256:'.length, 'sha256:'.length + 32)}`,
              providerReferenceHash: completed.result.resultHash,
            })]),
          });
        },
        createResponse({ output, receipt }) {
          return Object.freeze({ operationId, productId: 'sandbox.run', state: 'RECEIPTED', replayed: false, requestHash, result: output, receipt });
        },
      });
    },
  });
}
