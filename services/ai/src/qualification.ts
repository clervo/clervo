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

function evidenceHash(value: object): string {
  return hashJson(value as never);
}

function check(name: AiQualificationCheckName, status: 'passed' | 'failed' | 'not_run', code: string, evidence?: object) {
  return Object.freeze({ name, status, code, ...(evidence === undefined ? {} : { evidenceHash: evidenceHash(evidence) }) });
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
  } catch {
    for (const name of names) if (!results.has(name)) results.set(name, check(name, name === 'authentication' ? 'failed' : 'not_run', name === 'authentication' ? 'authentication_failed' : 'probe_aborted'));
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
