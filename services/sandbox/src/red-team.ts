import { createHash } from 'node:crypto';

export const sandboxRedTeamControls = ['runtime_isolation', 'process_limit', 'disk_limit', 'output_limit', 'time_limit', 'metadata_denied', 'internal_network_denied', 'external_network_denied', 'secrets_absent', 'host_access_denied'] as const;
export type SandboxRedTeamControl = (typeof sandboxRedTeamControls)[number];

export interface SandboxRedTeamProbe {
  probeId: string;
  attackClass: 'escape' | 'fork_bomb' | 'decompression_bomb' | 'output_flood' | 'timeout' | 'metadata' | 'ssrf_internal' | 'ssrf_external' | 'secret_discovery' | 'host_socket';
  requiredControls: readonly SandboxRedTeamControl[];
  maximumChargeMicrousd: number;
}

export interface SandboxRedTeamObservation {
  probeId: string;
  outcome: 'contained' | 'violated' | 'inconclusive';
  controls: Readonly<Record<SandboxRedTeamControl, boolean>>;
  runtimeAttested: boolean;
  cleanupVerified: boolean;
  chargedMicrousd: number;
  safeDetail: string;
}

export interface SandboxRedTeamExecutor { execute(probe: Readonly<SandboxRedTeamProbe>): Promise<Readonly<SandboxRedTeamObservation>> }

const probe = (probeId: string, attackClass: SandboxRedTeamProbe['attackClass'], ...requiredControls: SandboxRedTeamControl[]): Readonly<SandboxRedTeamProbe> => Object.freeze({ probeId, attackClass, requiredControls: Object.freeze(requiredControls), maximumChargeMicrousd: 10_000 });

export const sandboxRedTeamPlan: readonly Readonly<SandboxRedTeamProbe>[] = Object.freeze([
  probe('sandbox.escape.kernel.v1', 'escape', 'runtime_isolation', 'host_access_denied'),
  probe('sandbox.limit.fork-bomb.v1', 'fork_bomb', 'process_limit', 'time_limit'),
  probe('sandbox.limit.decompression.v1', 'decompression_bomb', 'disk_limit', 'time_limit'),
  probe('sandbox.limit.output-flood.v1', 'output_flood', 'output_limit', 'time_limit'),
  probe('sandbox.limit.timeout.v1', 'timeout', 'time_limit'),
  probe('sandbox.network.metadata.v1', 'metadata', 'metadata_denied', 'external_network_denied'),
  probe('sandbox.network.internal-ssrf.v1', 'ssrf_internal', 'internal_network_denied'),
  probe('sandbox.network.external-ssrf.v1', 'ssrf_external', 'external_network_denied'),
  probe('sandbox.secret.discovery.v1', 'secret_discovery', 'secrets_absent'),
  probe('sandbox.host.socket.v1', 'host_socket', 'host_access_denied', 'runtime_isolation'),
]);

function safeDetail(value: string): boolean { return value.length >= 1 && value.length <= 256 && !/[\u0000-\u001F\u007F]/u.test(value); }

function observationPasses(probeDefinition: Readonly<SandboxRedTeamProbe>, observation: Readonly<SandboxRedTeamObservation>): boolean {
  return observation.probeId === probeDefinition.probeId && observation.outcome === 'contained' && observation.runtimeAttested === true && observation.cleanupVerified === true
    && Number.isSafeInteger(observation.chargedMicrousd) && observation.chargedMicrousd >= 0 && observation.chargedMicrousd <= probeDefinition.maximumChargeMicrousd
    && safeDetail(observation.safeDetail) && probeDefinition.requiredControls.every((control) => observation.controls[control] === true);
}

export async function runSandboxRedTeam(executor: SandboxRedTeamExecutor, evaluatedAt: string): Promise<Readonly<{ schemaVersion: 'clervo.sandbox-red-team-report.v1'; evaluatedAt: string; status: 'passed' | 'failed'; probeCount: number; observations: readonly Readonly<SandboxRedTeamObservation>[]; reportSha256: string }>> {
  const parsed = Date.parse(evaluatedAt); if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== evaluatedAt) throw new TypeError('sandbox_red_team_timestamp_invalid');
  const observations: Readonly<SandboxRedTeamObservation>[] = [];
  for (const definition of sandboxRedTeamPlan) {
    try { observations.push(Object.freeze(await executor.execute(definition))); }
    catch { observations.push(Object.freeze({ probeId: definition.probeId, outcome: 'inconclusive', controls: Object.freeze(Object.fromEntries(sandboxRedTeamControls.map((control) => [control, false])) as unknown as Record<SandboxRedTeamControl, boolean>), runtimeAttested: false, cleanupVerified: false, chargedMicrousd: 0, safeDetail: 'probe execution failed closed' })); }
  }
  const status: 'passed' | 'failed' = sandboxRedTeamPlan.every((definition, index) => observationPasses(definition, observations[index]!)) ? 'passed' : 'failed';
  const unsigned = { schemaVersion: 'clervo.sandbox-red-team-report.v1' as const, evaluatedAt, status, probeCount: sandboxRedTeamPlan.length, observations: Object.freeze(observations) };
  const reportSha256 = `sha256:${createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')}`;
  return Object.freeze({ ...unsigned, reportSha256 });
}
