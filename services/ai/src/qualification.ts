import {
  aiQualificationCheckNames,
  createAiRouteQualification,
  estimateAiSupplierCost,
  type AiCapability,
  type AiQualificationCheckName,
  type AiRoutePricing,
  type AiRouteQualification,
  type AiUsage,
  type AssetAmount,
  hashJson,
} from '../../../packages/contracts/src/index.js';

export interface AiChatQualificationProbeResult {
  modelIdentity: string;
  outputText: string;
  usage: AiUsage;
  latencyMs: number;
}

export interface AiChatQualificationProbe {
  complete(input: Readonly<{ prompt: string; stream: boolean; responseFormat: 'text' | 'json_object' }>): Promise<Readonly<AiChatQualificationProbeResult>>;
  invalidModelFailsSafely(): Promise<boolean>;
}

// A non-chat route cannot be qualified by reading text back. Each modality
// proves the same nine things through the artefact it actually produces, so the
// probe reports a modality-neutral observation and the engine judges it.
//
//   * `identity` is what the supplier said it served, never what we asked for.
//   * `outputSignature` is a value derived from the response that must differ
//     when the input differs — a transcript for chat, an image digest, an
//     embedding fingerprint, an audio digest. It is a derived value, never the
//     payload: qualification records evidence hashes, not customer content.
//   * `outputValid` is the modality's own shape rule, checked by the probe that
//     knows the modality.
export interface AiRouteQualificationObservation {
  identity: string;
  outputSignature: string;
  outputValid: boolean;
  usage: AiUsage;
  latencyMs: number;
}

export interface AiRouteQualificationProbe {
  // Two calls with different inputs. The engine compares their signatures, so a
  // route that returns a constant — cached, stubbed, or silently substituted —
  // fails input_dependence instead of passing on a single lucky response.
  observe(input: Readonly<{ variant: 'a' | 'b' }>): Promise<Readonly<AiRouteQualificationObservation>>;
  invalidModelFailsSafely(): Promise<boolean>;
  streaming?(): Promise<Readonly<AiRouteQualificationObservation>>;
  structuredOutput?(): Promise<Readonly<AiRouteQualificationObservation>>;
}

function evidenceHash(value: object): string {
  return hashJson(value as never);
}

function check(name: AiQualificationCheckName, status: 'passed' | 'failed' | 'not_run', code: string, evidence?: object) {
  return Object.freeze({ name, status, code, ...(evidence === undefined ? {} : { evidenceHash: evidenceHash(evidence) }) });
}

// A thrown probe error used to be recorded as `authentication_failed` for every
// cause, so a missing model, a rejected request and a timeout were all reported
// as a credential problem. A pause reason has to be true, so the class is
// derived from the adapter's own error code here.
//
// Adapter codes are fixed identifiers (`deepgram_http_failed`), never request or
// response bodies and never credential material, so they are safe to keep.
// Anything unrecognised stays deliberately coarse rather than being guessed at.
function probeFailureCode(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';
  if (!/^[a-z0-9_]{3,64}$/u.test(raw)) return 'probe_failed_unclassified';
  if (/credential_unavailable|credential_invalid|access_token_invalid/u.test(raw)) return 'credential_unavailable';
  if (/_authentication|unauthorized|forbidden/u.test(raw)) return 'authentication_failed';
  if (/binding_invalid|request_invalid|limit_exceeded|voice_binding/u.test(raw)) return 'probe_request_rejected';
  if (/transport_failed|timeout|unreachable/u.test(raw)) return 'upstream_unreachable';
  if (/http_failed|status/u.test(raw)) return 'upstream_call_failed';
  if (/response_invalid|artifact_hash_invalid|hash/u.test(raw)) return 'upstream_response_invalid';
  return raw;
}

// `authentication` is only asserted as failed when the cause really is the
// credential; otherwise it is left un-run and the true cause is carried on the
// aborted checks, so a healthy credential is never blamed for another fault.
function abortChecks(
  names: readonly AiQualificationCheckName[],
  results: Map<string, ReturnType<typeof check>>,
  error: unknown,
): void {
  const code = probeFailureCode(error);
  const credentialAtFault = code === 'authentication_failed' || code === 'credential_unavailable';
  for (const name of names) {
    if (results.has(name)) continue;
    if (name === 'authentication') {
      results.set(name, credentialAtFault ? check(name, 'failed', code) : check(name, 'not_run', 'probe_aborted'));
      continue;
    }
    results.set(name, check(name, 'not_run', code));
  }
}

function amount(value: AssetAmount): bigint {
  if (value.asset !== 'USD' || value.decimals !== 6 || !/^(?:0|[1-9][0-9]{0,77})$/u.test(value.amountAtomic)) throw new TypeError('ai_qualification_cost_ceiling_invalid');
  return BigInt(value.amountAtomic);
}

export async function qualifyAiChatRoute(input: {
  qualificationId: string;
  routeId: string;
  providerId: string;
  supplyFamilyId: string;
  exactModelId: string;
  capabilities: readonly AiCapability[];
  credentialAvailable: boolean;
  termsStatus: 'approved' | 'restricted' | 'blocked' | 'unreviewed';
  resaleAllowed: boolean;
  checkedAt: string;
  expiresAt: string;
  maximumLatencyMsP95: number;
  maximumSupplierCost: AssetAmount;
  pricing: AiRoutePricing;
  probe: AiChatQualificationProbe;
}): Promise<Readonly<AiRouteQualification>> {
  const optional = [
    ...(input.capabilities.includes('streaming') ? ['streaming' as const] : []),
    ...(input.capabilities.includes('structured_output') ? ['structured_output' as const] : []),
  ];
  const names = [...aiQualificationCheckNames, ...optional];
  if (!input.credentialAvailable) {
    return createAiRouteQualification({
      qualificationId: input.qualificationId, routeId: input.routeId, providerId: input.providerId, supplyFamilyId: input.supplyFamilyId, exactModelId: input.exactModelId, productIds: ['ai.chat'], checkedAt: input.checkedAt, expiresAt: input.expiresAt,
      termsStatus: input.termsStatus, resaleAllowed: input.resaleAllowed,
      checks: names.map((name) => check(name, 'not_run', 'credential_missing')),
      observed: {},
    }, input.capabilities);
  }

  const results = new Map<string, ReturnType<typeof check>>();
  const observations: AiChatQualificationProbeResult[] = [];
  try {
    const first = await input.probe.complete({ prompt: 'Return exactly CLERVO-QUAL-A', stream: false, responseFormat: 'text' });
    const second = await input.probe.complete({ prompt: 'Return exactly CLERVO-QUAL-B', stream: false, responseFormat: 'text' });
    observations.push(first, second);
    results.set('authentication', check('authentication', 'passed', 'credential_accepted', { completed: 2 }));
    const identityPassed = observations.every(({ modelIdentity }) => modelIdentity === input.exactModelId);
    results.set('exact_identity', check('exact_identity', identityPassed ? 'passed' : 'failed', identityPassed ? 'exact_identity_observed' : 'model_identity_mismatch', { identities: observations.map(({ modelIdentity }) => modelIdentity) }));
    const dependencePassed = first.outputText.trim() === 'CLERVO-QUAL-A' && second.outputText.trim() === 'CLERVO-QUAL-B';
    results.set('input_dependence', check('input_dependence', dependencePassed ? 'passed' : 'failed', dependencePassed ? 'input_dependence_observed' : 'input_dependence_failed', { first: first.outputText.trim() === 'CLERVO-QUAL-A.', second: second.outputText.trim() === 'CLERVO-QUAL-B.' }));
    results.set('output_shape', check('output_shape', dependencePassed ? 'passed' : 'failed', dependencePassed ? 'bounded_text_valid' : 'bounded_text_invalid'));
    const usagePassed = observations.every(({ usage }) => usage.inputTokens > 0 && usage.outputTokens > 0 && Object.values(usage).every((value) => Number.isSafeInteger(value) && value >= 0));
    results.set('usage_reporting', check('usage_reporting', usagePassed ? 'passed' : 'failed', usagePassed ? 'usage_reported' : 'usage_missing'));
    const latencies = observations.map(({ latencyMs }) => latencyMs).sort((left, right) => left - right);
    const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    const latencyPassed = Number.isFinite(p95) && p95 >= 0 && p95 <= input.maximumLatencyMsP95;
    results.set('latency', check('latency', latencyPassed ? 'passed' : 'failed', latencyPassed ? 'latency_within_ceiling' : 'latency_ceiling_exceeded', { latencyMsP95: p95 }));
    let failurePassed = false;
    try { failurePassed = await input.probe.invalidModelFailsSafely(); } catch { failurePassed = false; }
    results.set('failure_handling', check('failure_handling', failurePassed ? 'passed' : 'failed', failurePassed ? 'invalid_model_failed_safely' : 'invalid_model_failure_unsafe'));
    const maximum = amount(input.maximumSupplierCost);
    const costs = observations.map(({ usage }) => estimateAiSupplierCost(usage, input.pricing));
    const costPassed = costs.every((cost) => amount(cost) <= maximum);
    results.set('cost_ceiling', check('cost_ceiling', costPassed ? 'passed' : 'failed', costPassed ? 'cost_within_ceiling' : 'cost_ceiling_exceeded', { amountsAtomic: costs.map(({ amountAtomic }) => amountAtomic) }));
    const termsPassed = ['approved', 'restricted'].includes(input.termsStatus) && input.resaleAllowed;
    results.set('terms', check('terms', termsPassed ? 'passed' : input.termsStatus === 'blocked' ? 'failed' : 'not_run', termsPassed ? 'resale_terms_confirmed' : 'resale_terms_unresolved'));

    if (input.capabilities.includes('streaming')) {
      let stream: AiChatQualificationProbeResult | undefined;
      try { stream = await input.probe.complete({ prompt: 'Return exactly CLERVO-STREAM', stream: true, responseFormat: 'text' }); observations.push(stream); } catch { stream = undefined; }
      const passed = stream?.modelIdentity === input.exactModelId && stream.outputText.trim() === 'CLERVO-STREAM' && stream.usage.outputTokens > 0;
      results.set('streaming', check('streaming', passed ? 'passed' : 'failed', passed ? 'stream_terminal_usage_valid' : 'streaming_failed'));
    }
    if (input.capabilities.includes('structured_output')) {
      let structured: AiChatQualificationProbeResult | undefined;
      try { structured = await input.probe.complete({ prompt: 'Return JSON {"nonce":"CLERVO-JSON"}.', stream: false, responseFormat: 'json_object' }); observations.push(structured); } catch { structured = undefined; }
      let passed = false;
      try { passed = structured?.modelIdentity === input.exactModelId && JSON.parse(structured.outputText).nonce === 'CLERVO-JSON'; } catch { passed = false; }
      results.set('structured_output', check('structured_output', passed ? 'passed' : 'failed', passed ? 'structured_output_valid' : 'structured_output_failed'));
    }
  } catch (error) {
    abortChecks(names, results, error);
  }

  const observedIdentity = observations.length > 0 && observations.every(({ modelIdentity }) => modelIdentity === observations[0]?.modelIdentity) ? observations[0]?.modelIdentity : undefined;
  const latencies = observations.map(({ latencyMs }) => latencyMs).filter(Number.isFinite).sort((left, right) => left - right);
  const latencyMsP95 = latencies[Math.ceil(latencies.length * 0.95) - 1];
  return createAiRouteQualification({
    qualificationId: input.qualificationId, routeId: input.routeId, providerId: input.providerId, supplyFamilyId: input.supplyFamilyId, exactModelId: input.exactModelId, productIds: ['ai.chat'], checkedAt: input.checkedAt, expiresAt: input.expiresAt,
    termsStatus: input.termsStatus, resaleAllowed: input.resaleAllowed,
    checks: names.map((name) => results.get(name) ?? check(name, 'not_run', 'probe_not_run')),
    observed: {
      ...(observedIdentity === undefined ? {} : { modelIdentity: observedIdentity }),
      ...(latencyMsP95 === undefined ? {} : { latencyMsP95 }),
      ...(results.get('cost_ceiling')?.status === 'passed' ? { maximumSupplierCost: input.maximumSupplierCost } : {}),
    },
  }, input.capabilities);
}

// Usage means something different per modality, and demanding chat's shape from
// a speech route is how a working route gets recorded as broken. Every modality
// must report non-negative safe integers; each additionally must report the one
// quantity it actually bills on.
function usageReported(productId: 'ai.chat' | 'ai.embed' | 'ai.image' | 'ai.speech', usage: AiUsage): boolean {
  const wellFormed = Object.values(usage).every((value) => Number.isSafeInteger(value) && value >= 0);
  if (!wellFormed) return false;
  if (productId === 'ai.chat') return usage.inputTokens > 0 && usage.outputTokens > 0;
  if (productId === 'ai.embed') return usage.inputTokens > 0;
  if (productId === 'ai.image') return usage.images > 0;
  return usage.audioCharacters > 0;
}

const OUTPUT_SHAPE_CODES = Object.freeze({
  'ai.chat': 'bounded_text_valid',
  'ai.embed': 'bounded_embedding_valid',
  'ai.image': 'bounded_image_valid',
  'ai.speech': 'bounded_audio_valid',
});

// The modality-neutral engine. Same nine checks, same pass/fail meaning, same
// derivation from live observation as chat — so a speech or image route is held
// to a real standard instead of a hand-copied one.
export async function qualifyAiRoute(input: {
  qualificationId: string;
  routeId: string;
  providerId: string;
  supplyFamilyId: string;
  exactModelId: string;
  productId: 'ai.chat' | 'ai.embed' | 'ai.image' | 'ai.speech';
  capabilities: readonly AiCapability[];
  credentialAvailable: boolean;
  termsStatus: 'approved' | 'restricted' | 'blocked' | 'unreviewed';
  resaleAllowed: boolean;
  checkedAt: string;
  expiresAt: string;
  maximumLatencyMsP95: number;
  maximumSupplierCost: AssetAmount;
  pricing: AiRoutePricing;
  probe: AiRouteQualificationProbe;
}): Promise<Readonly<AiRouteQualification>> {
  const optional = [
    ...(input.capabilities.includes('streaming') && input.probe.streaming !== undefined ? ['streaming' as const] : []),
    ...(input.capabilities.includes('structured_output') && input.probe.structuredOutput !== undefined ? ['structured_output' as const] : []),
  ];
  const names = [...aiQualificationCheckNames, ...optional];

  if (!input.credentialAvailable) {
    return createAiRouteQualification({
      qualificationId: input.qualificationId, routeId: input.routeId, providerId: input.providerId, supplyFamilyId: input.supplyFamilyId, exactModelId: input.exactModelId, productIds: [input.productId], checkedAt: input.checkedAt, expiresAt: input.expiresAt,
      termsStatus: input.termsStatus, resaleAllowed: input.resaleAllowed,
      checks: names.map((name) => check(name, 'not_run', 'credential_missing')),
      observed: {},
    }, input.capabilities);
  }

  const results = new Map<string, ReturnType<typeof check>>();
  const observations: AiRouteQualificationObservation[] = [];
  try {
    const first = await input.probe.observe({ variant: 'a' });
    const second = await input.probe.observe({ variant: 'b' });
    observations.push(first, second);
    results.set('authentication', check('authentication', 'passed', 'credential_accepted', { completed: 2 }));

    const identityPassed = observations.every(({ identity }) => identity === input.exactModelId);
    results.set('exact_identity', check('exact_identity', identityPassed ? 'passed' : 'failed', identityPassed ? 'exact_identity_observed' : 'model_identity_mismatch', { identities: observations.map(({ identity }) => identity) }));

    // Different input, different output. A constant response is the signature of
    // a cache, a stub, or a substituted model, and it must not qualify.
    const dependencePassed = first.outputSignature !== second.outputSignature && first.outputSignature.length > 0 && second.outputSignature.length > 0;
    results.set('input_dependence', check('input_dependence', dependencePassed ? 'passed' : 'failed', dependencePassed ? 'input_dependence_observed' : 'input_dependence_failed', { distinct: dependencePassed }));

    const shapePassed = observations.every(({ outputValid }) => outputValid);
    results.set('output_shape', check('output_shape', shapePassed ? 'passed' : 'failed', shapePassed ? OUTPUT_SHAPE_CODES[input.productId] : 'bounded_output_invalid'));

    const usagePassed = observations.every(({ usage }) => usageReported(input.productId, usage));
    results.set('usage_reporting', check('usage_reporting', usagePassed ? 'passed' : 'failed', usagePassed ? 'usage_reported' : 'usage_missing'));

    const latencies = observations.map(({ latencyMs }) => latencyMs).sort((left, right) => left - right);
    const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    const latencyPassed = Number.isFinite(p95) && p95 >= 0 && p95 <= input.maximumLatencyMsP95;
    results.set('latency', check('latency', latencyPassed ? 'passed' : 'failed', latencyPassed ? 'latency_within_ceiling' : 'latency_ceiling_exceeded', { latencyMsP95: p95 }));

    let failurePassed = false;
    try { failurePassed = await input.probe.invalidModelFailsSafely(); } catch { failurePassed = false; }
    results.set('failure_handling', check('failure_handling', failurePassed ? 'passed' : 'failed', failurePassed ? 'invalid_model_failed_safely' : 'invalid_model_failure_unsafe'));

    const maximum = amount(input.maximumSupplierCost);
    const costs = observations.map(({ usage }) => estimateAiSupplierCost(usage, input.pricing));
    const costPassed = costs.every((cost) => amount(cost) <= maximum);
    results.set('cost_ceiling', check('cost_ceiling', costPassed ? 'passed' : 'failed', costPassed ? 'cost_within_ceiling' : 'cost_ceiling_exceeded', { amountsAtomic: costs.map(({ amountAtomic }) => amountAtomic) }));

    const termsPassed = ['approved', 'restricted'].includes(input.termsStatus) && input.resaleAllowed;
    results.set('terms', check('terms', termsPassed ? 'passed' : input.termsStatus === 'blocked' ? 'failed' : 'not_run', termsPassed ? 'resale_terms_confirmed' : 'resale_terms_unresolved'));

    if (optional.includes('streaming')) {
      let stream: AiRouteQualificationObservation | undefined;
      try { stream = await input.probe.streaming?.(); if (stream !== undefined) observations.push(stream); } catch { stream = undefined; }
      const passed = stream?.identity === input.exactModelId && stream.outputValid && usageReported(input.productId, stream.usage);
      results.set('streaming', check('streaming', passed ? 'passed' : 'failed', passed ? 'stream_terminal_usage_valid' : 'streaming_failed'));
    }
    if (optional.includes('structured_output')) {
      let structured: AiRouteQualificationObservation | undefined;
      try { structured = await input.probe.structuredOutput?.(); if (structured !== undefined) observations.push(structured); } catch { structured = undefined; }
      const passed = structured?.identity === input.exactModelId && structured.outputValid;
      results.set('structured_output', check('structured_output', passed ? 'passed' : 'failed', passed ? 'structured_output_valid' : 'structured_output_failed'));
    }
  } catch (error) {
    abortChecks(names, results, error);
  }

  const observedIdentity = observations.length > 0 && observations.every(({ identity }) => identity === observations[0]?.identity) ? observations[0]?.identity : undefined;
  const latencies = observations.map(({ latencyMs }) => latencyMs).filter(Number.isFinite).sort((left, right) => left - right);
  const latencyMsP95 = latencies[Math.ceil(latencies.length * 0.95) - 1];
  return createAiRouteQualification({
    qualificationId: input.qualificationId, routeId: input.routeId, providerId: input.providerId, supplyFamilyId: input.supplyFamilyId, exactModelId: input.exactModelId, productIds: [input.productId], checkedAt: input.checkedAt, expiresAt: input.expiresAt,
    termsStatus: input.termsStatus, resaleAllowed: input.resaleAllowed,
    checks: names.map((name) => results.get(name) ?? check(name, 'not_run', 'probe_not_run')),
    observed: {
      ...(observedIdentity === undefined ? {} : { modelIdentity: observedIdentity }),
      ...(latencyMsP95 === undefined ? {} : { latencyMsP95 }),
      ...(results.get('cost_ceiling')?.status === 'passed' ? { maximumSupplierCost: input.maximumSupplierCost } : {}),
    },
  }, input.capabilities);
}
