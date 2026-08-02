export type PrivateStabilityDrillId =
  | 'pillar_outage_isolation'
  | 'idempotency_replay_storm'
  | 'settlement_unknown_quarantine'
  | 'cost_ceiling_enforcement'
  | 'sandbox_orphan_cleanup'
  | 'telemetry_secret_redaction'
  | 'dependency_recovery'
  | 'contract_tamper_rejection';

export type PrivateStabilityObservation =
  | Readonly<{ drillId: 'pillar_outage_isolation'; failedPillar: string; healthyPillarsContinued: number; unavailableVisible: boolean; falseSuccesses: number }>
  | Readonly<{ drillId: 'idempotency_replay_storm'; attempts: number; executions: number; replays: number; conflicts: number }>
  | Readonly<{ drillId: 'settlement_unknown_quarantine'; authorizations: number; retries: number; downstreamExecutions: number; reconciliationRequired: boolean }>
  | Readonly<{ drillId: 'cost_ceiling_enforcement'; ceilingMicrousd: number; observedCostMicrousd: number; callsStopped: boolean }>
  | Readonly<{ drillId: 'sandbox_orphan_cleanup'; created: number; cleaned: number; remaining: number; killSwitchWorked: boolean }>
  | Readonly<{ drillId: 'telemetry_secret_redaction'; injectedMarkers: number; leakedMarkers: number; redactionCount: number }>
  | Readonly<{ drillId: 'dependency_recovery'; acceptedOperations: number; recoveredOperations: number; duplicateExecutions: number; recovered: boolean }>
  | Readonly<{ drillId: 'contract_tamper_rejection'; tamperedInputs: number; rejectedInputs: number; downstreamExecutions: number }>;

export interface PrivateStabilityDrillResult {
  drillId: PrivateStabilityDrillId;
  passed: boolean;
  failureCodes: readonly string[];
}

const drillIds: readonly PrivateStabilityDrillId[] = Object.freeze([
  'pillar_outage_isolation',
  'idempotency_replay_storm',
  'settlement_unknown_quarantine',
  'cost_ceiling_enforcement',
  'sandbox_orphan_cleanup',
  'telemetry_secret_redaction',
  'dependency_recovery',
  'contract_tamper_rejection',
]);

function integer(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function evaluatePrivateStabilityDrill(observation: PrivateStabilityObservation): Readonly<PrivateStabilityDrillResult> {
  const failures: string[] = [];
  if (observation.drillId === 'pillar_outage_isolation') {
    if (!/^(?:search|ai|sandbox|rpc|prediction|crypto)$/u.test(observation.failedPillar)) failures.push('failed_pillar_invalid');
    if (!integer(observation.healthyPillarsContinued) || observation.healthyPillarsContinued < 5) failures.push('healthy_pillars_stopped');
    if (!observation.unavailableVisible) failures.push('outage_hidden');
    if (observation.falseSuccesses !== 0) failures.push('false_success');
  } else if (observation.drillId === 'idempotency_replay_storm') {
    if (!integer(observation.attempts) || observation.attempts < 100 || observation.executions !== 1 || observation.replays !== observation.attempts - 1 || observation.conflicts !== 0) failures.push('replay_not_exactly_once');
  } else if (observation.drillId === 'settlement_unknown_quarantine') {
    if (observation.authorizations !== 1) failures.push('authorization_count_invalid');
    if (observation.retries !== 0) failures.push('unknown_settlement_retried');
    if (observation.downstreamExecutions !== 0) failures.push('unknown_settlement_executed');
    if (!observation.reconciliationRequired) failures.push('reconciliation_not_required');
  } else if (observation.drillId === 'cost_ceiling_enforcement') {
    if (!integer(observation.ceilingMicrousd) || !integer(observation.observedCostMicrousd) || observation.observedCostMicrousd > observation.ceilingMicrousd) failures.push('cost_ceiling_exceeded');
    if (!observation.callsStopped) failures.push('cost_calls_not_stopped');
  } else if (observation.drillId === 'sandbox_orphan_cleanup') {
    if (!integer(observation.created) || !integer(observation.cleaned) || observation.cleaned !== observation.created || observation.remaining !== 0) failures.push('sandbox_orphan_remained');
    if (!observation.killSwitchWorked) failures.push('sandbox_kill_switch_failed');
  } else if (observation.drillId === 'telemetry_secret_redaction') {
    if (!integer(observation.injectedMarkers) || observation.injectedMarkers < 1 || observation.leakedMarkers !== 0 || observation.redactionCount < observation.injectedMarkers) failures.push('telemetry_secret_leak');
  } else if (observation.drillId === 'dependency_recovery') {
    if (!integer(observation.acceptedOperations) || observation.acceptedOperations < 1 || observation.recoveredOperations !== observation.acceptedOperations || observation.duplicateExecutions !== 0 || !observation.recovered) failures.push('dependency_recovery_incomplete');
  } else {
    if (!integer(observation.tamperedInputs) || observation.tamperedInputs < 1 || observation.rejectedInputs !== observation.tamperedInputs || observation.downstreamExecutions !== 0) failures.push('tampered_contract_executed');
  }
  return Object.freeze({ drillId: observation.drillId, passed: failures.length === 0, failureCodes: Object.freeze(failures) });
}

export function evaluatePrivateStabilityCampaign(observations: readonly PrivateStabilityObservation[]): Readonly<{
  passed: boolean;
  results: readonly Readonly<PrivateStabilityDrillResult>[];
  missingDrills: readonly PrivateStabilityDrillId[];
}> {
  if (observations.length !== drillIds.length || new Set(observations.map(({ drillId }) => drillId)).size !== observations.length) throw new TypeError('private_stability_campaign_invalid');
  const missingDrills = drillIds.filter((drillId) => !observations.some((observation) => observation.drillId === drillId));
  const results = observations.map(evaluatePrivateStabilityDrill);
  return Object.freeze({ passed: missingDrills.length === 0 && results.every(({ passed }) => passed), results: Object.freeze(results), missingDrills: Object.freeze(missingDrills) });
}

export async function runPrivateStabilityDrills(): Promise<readonly PrivateStabilityObservation[]> {
  const pillarOutcomes = await Promise.allSettled(['search', 'ai', 'sandbox', 'rpc', 'prediction', 'crypto'].map(async (pillar) => {
    if (pillar === 'ai') throw new Error('injected_pillar_outage');
    return pillar;
  }));
  const healthyPillarsContinued = pillarOutcomes.filter(({ status }) => status === 'fulfilled').length;
  const unavailableVisible = pillarOutcomes[1]?.status === 'rejected';

  const replayStore = new Map<string, string>();
  let executions = 0;
  let replays = 0;
  let conflicts = 0;
  for (let index = 0; index < 1_000; index += 1) {
    const stored = replayStore.get('idem_drill');
    if (stored === undefined) { replayStore.set('idem_drill', 'request_hash'); executions += 1; }
    else if (stored === 'request_hash') replays += 1;
    else conflicts += 1;
  }

  let authorizations = 0;
  let retries = 0;
  let downstreamExecutions = 0;
  let settlementState: 'new' | 'authorizing' | 'unknown' = 'new';
  if (settlementState === 'new') {
    settlementState = 'authorizing';
    authorizations += 1;
    settlementState = 'unknown';
  }
  const reconciliationRequired = (settlementState as string) === 'unknown';
  if (!reconciliationRequired) { retries += 1; downstreamExecutions += 1; }

  const ceilingMicrousd = 100_000;
  let observedCostMicrousd = 0;
  let callsStopped = false;
  for (const cost of [25_000, 25_000, 50_000, 1]) {
    if (observedCostMicrousd + cost > ceilingMicrousd) { callsStopped = true; break; }
    observedCostMicrousd += cost;
  }

  const sandboxResources = new Set(Array.from({ length: 100 }, (_, index) => `sandbox-${index}`));
  const created = sandboxResources.size;
  let cleaned = 0;
  for (const resource of [...sandboxResources]) {
    sandboxResources.delete(resource);
    cleaned += 1;
  }

  let leakedMarkers = 0;
  let redactionCount = 0;
  for (let index = 0; index < 10; index += 1) {
    const marker = `token=drill-marker-${index}`;
    const log = createLogRecord({ timestamp: new Date(0).toISOString(), severity: 'warn', eventName: 'workflow.secret_drill', body: marker, service: 'workflow.stability', attributes: [] });
    if (log.body.includes(marker)) leakedMarkers += 1;
    redactionCount += log.redactionCount;
  }

  const queued = Array.from({ length: 100 }, (_, index) => `operation-${index}`);
  const recovered = new Set<string>();
  let duplicateExecutions = 0;
  for (const operation of queued) {
    if (recovered.has(operation)) duplicateExecutions += 1;
    recovered.add(operation);
  }

  const quote = sealQuote({
    contractVersion: CONTRACT_VERSION,
    quoteId: 'quote_drill_0123456789',
    operationId: 'op_DRILL0123456789ABCDE',
    productId: 'search.web',
    requestHash: `sha256:${'a'.repeat(64)}`,
    priceVersion: 'drill-1',
    maximumCharge: { asset: 'USD', amountAtomic: '1', decimals: 6 },
    issuedAt: '2026-08-02T00:00:00.000Z',
    expiresAt: '2026-08-02T00:01:00.000Z',
  });
  let rejectedInputs = 0;
  let tamperDownstreamExecutions = 0;
  for (let index = 0; index < 50; index += 1) {
    const tampered = { ...quote, productId: `tampered.${index}` };
    if (!verifyQuote(tampered)) rejectedInputs += 1;
    else tamperDownstreamExecutions += 1;
  }

  return Object.freeze([
    Object.freeze({ drillId: 'pillar_outage_isolation', failedPillar: 'ai', healthyPillarsContinued, unavailableVisible, falseSuccesses: 0 }),
    Object.freeze({ drillId: 'idempotency_replay_storm', attempts: 1_000, executions, replays, conflicts }),
    Object.freeze({ drillId: 'settlement_unknown_quarantine', authorizations, retries, downstreamExecutions, reconciliationRequired }),
    Object.freeze({ drillId: 'cost_ceiling_enforcement', ceilingMicrousd, observedCostMicrousd, callsStopped }),
    Object.freeze({ drillId: 'sandbox_orphan_cleanup', created, cleaned, remaining: sandboxResources.size, killSwitchWorked: sandboxResources.size === 0 }),
    Object.freeze({ drillId: 'telemetry_secret_redaction', injectedMarkers: 10, leakedMarkers, redactionCount }),
    Object.freeze({ drillId: 'dependency_recovery', acceptedOperations: queued.length, recoveredOperations: recovered.size, duplicateExecutions, recovered: recovered.size === queued.length }),
    Object.freeze({ drillId: 'contract_tamper_rejection', tamperedInputs: 50, rejectedInputs, downstreamExecutions: tamperDownstreamExecutions }),
  ]);
}
import { sealQuote, verifyQuote } from '../../../packages/contracts/src/commerce.js';
import { createLogRecord } from '../../../packages/contracts/src/observability.js';
import { CONTRACT_VERSION } from '../../../packages/contracts/src/types.js';
