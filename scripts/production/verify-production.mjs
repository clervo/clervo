#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const recoveryMode = process.env.CLERVO_PRODUCTION_RECOVERY_BUILD ?? 'none';
if (!['none', 'expired-prediction-qualification'].includes(recoveryMode)) throw new Error('production_recovery_build_mode_invalid');
if (recoveryMode !== 'none' && process.env.CLERVO_CLOUD_ACCEPTANCE !== 'true') throw new Error('production_recovery_build_context_invalid');

const steps = [
  ['build', npm, ['run', 'build']],
  ['security: dependency audit', npm, ['audit', '--omit=dev', '--audit-level=high']],
  ['security: secret scan', npm, ['run', 'scan:secrets']],
  ['security: production controls', process.execPath, ['--test', 'tests/contract/b14-production-controls.test.mjs']],
  ['migrations', process.execPath, ['--test', 'tests/contract/n14.5.test.mjs']],
  ['durable state', process.execPath, ['--test', 'tests/contract/n14.2.test.mjs']],
  ['retention and privacy', process.execPath, ['--test', 'tests/contract/n14.4.test.mjs']],
  ['monitoring', process.execPath, ['--test', 'tests/contract/n14.7.test.mjs']],
  ['basic overload behavior', process.execPath, ['--test', 'tests/contract/n14.3.test.mjs']],
  ['rollback and traffic recovery', process.execPath, ['--test', 'tests/contract/n14.9.test.mjs']],
  ['receiver accounting and unit economics', process.execPath, ['--test', 'tests/contract/n14.11.test.mjs', 'tests/contract/n14.12.test.mjs']],
  ['lint', npm, ['run', 'lint']],
  ['clean-room boundary', path.join(root, 'scripts/verify-clean-room-boundary.sh'), []],
  recoveryMode === 'expired-prediction-qualification'
    ? ['expired Prediction qualification recovery', process.execPath, ['scripts/prediction/verify-pdata-recovery.mjs']]
    : ['current live health', process.execPath, ['scripts/production/verify-public-api.mjs']],
];

for (const [name, command, args] of steps) {
  process.stdout.write(`\n=== B14 ${name} ===\n`);
  const result = spawnSync(command, args, { cwd: root, env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`B14 production gate: FAIL at ${name} (exit ${result.status ?? 1})\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write('\nB14 production gate: PASS\n');
process.stdout.write('production mutations: 0\n');
process.stdout.write('payment sent: no\n');
process.stdout.write('USDC spent: 0\n');
