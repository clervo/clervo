import assert from 'node:assert/strict';
import test from 'node:test';

import { runSandboxRedTeam, sandboxRedTeamControls, sandboxRedTeamPlan } from '../../dist/services/sandbox/src/red-team.js';

const allControls = Object.freeze(Object.fromEntries(sandboxRedTeamControls.map((control) => [control, true])));

test('sandbox red-team gate requires all attack classes, attestation, cleanup, controls, and cost ceilings', async () => {
  assert.deepEqual(sandboxRedTeamPlan.map(({ attackClass }) => attackClass), ['escape', 'fork_bomb', 'decompression_bomb', 'output_flood', 'timeout', 'metadata', 'ssrf_internal', 'ssrf_external', 'secret_discovery', 'host_socket']);
  const executor = { async execute(probe) { return { probeId: probe.probeId, outcome: 'contained', controls: allControls, runtimeAttested: true, cleanupVerified: true, chargedMicrousd: probe.maximumChargeMicrousd, safeDetail: 'contained by synthetic test executor' }; } };
  const report = await runSandboxRedTeam(executor, '2026-08-02T12:00:00.000Z');
  assert.equal(report.status, 'passed'); assert.equal(report.probeCount, 10); assert.match(report.reportSha256, /^sha256:[a-f0-9]{64}$/u);
});

test('sandbox red-team gate fails closed on a violation, excessive charge, cleanup uncertainty, or probe error', async () => {
  for (const mutation of [
    { outcome: 'violated' }, { chargedMicrousd: 10_001 }, { cleanupVerified: false }, { runtimeAttested: false }, { controls: { ...allControls, metadata_denied: false } },
  ]) {
    const executor = { async execute(probe) { return { probeId: probe.probeId, outcome: 'contained', controls: allControls, runtimeAttested: true, cleanupVerified: true, chargedMicrousd: 0, safeDetail: 'bounded synthetic observation', ...(probe.probeId === 'sandbox.network.metadata.v1' ? mutation : {}) }; } };
    assert.equal((await runSandboxRedTeam(executor, '2026-08-02T12:00:00.000Z')).status, 'failed');
  }
  const erroring = { async execute() { throw new Error('opaque runtime failure'); } };
  const report = await runSandboxRedTeam(erroring, '2026-08-02T12:00:00.000Z'); assert.equal(report.status, 'failed'); assert.ok(report.observations.every(({ outcome }) => outcome === 'inconclusive'));
});
