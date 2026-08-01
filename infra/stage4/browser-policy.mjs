import { createHash } from 'node:crypto';

export const stage4BrowserPolicy = Object.freeze({
  preflightTimeoutMs: 2_500,
  renderTimeoutMs: 6_500,
  cleanupTimeoutMs: 1_000,
  supervisorTimeoutMs: 11_000,
  maximumRenderedBytes: 2_097_152,
  maximumPreflightBytes: 2_097_152,
  maximumDiagnosticBytes: 65_536,
  developmentJavascriptRuns: 1,
  developmentHostileRuns: 1,
  finalJavascriptRuns: 20,
  finalHostileRuns: 8,
});

export function browserPolicyDigest() {
  return `sha256:${createHash('sha256').update(JSON.stringify(stage4BrowserPolicy)).digest('hex')}`;
}

export function classifyBrowserTermination({ code, signal, stderr }) {
  const bounded = Buffer.from(stderr ?? '').subarray(0, stage4BrowserPolicy.maximumDiagnosticBytes);
  const stderrSha256 = `sha256:${createHash('sha256').update(bounded).digest('hex')}`;
  const normalizedSignal = typeof signal === 'string' && /^SIG[A-Z0-9]+$/u.test(signal) ? signal : null;
  const normalizedCode = Number.isInteger(code) ? code : null;
  const cause = normalizedSignal !== null ? `signal_${normalizedSignal}` : normalizedCode !== null ? `exit_${normalizedCode}` : 'unknown_termination';
  return Object.freeze({ failureCode: `browser_process_failed:${cause}`, exitCode: normalizedCode, signal: normalizedSignal, stderrSha256 });
}
