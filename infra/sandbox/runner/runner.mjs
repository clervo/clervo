#!/usr/bin/env node
import { spawn } from 'node:child_process';

const chunks = []; let requestBytes = 0;
for await (const chunk of process.stdin) { requestBytes += chunk.length; if (requestBytes > 1_500_000) throw new Error('sandbox_request_too_large'); chunks.push(chunk); }
const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const limits = request.limits ?? {};
const integer = (value, minimum, maximum) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
if (!Array.isArray(request.command) || request.command.length < 1 || request.command.length > 32 || request.command.some((part) => typeof part !== 'string' || part.length < 1 || part.length > 4096 || /[\u0000-\u001f\u007f]/u.test(part))) throw new Error('sandbox_command_invalid');
if (!integer(limits.cpuMillis, 1, 300000) || !integer(limits.processes, 1, 256) || !integer(limits.diskBytes, 1048576, 10737418240) || !integer(limits.outputBytes, 1, 10485760) || !integer(limits.wallTimeMs, 100, 300000)) throw new Error('sandbox_limits_invalid');
const stdin = request.stdinBase64 === undefined ? Buffer.alloc(0) : Buffer.from(request.stdinBase64, 'base64'); if (stdin.length > 1048576) throw new Error('sandbox_stdin_invalid');
const startedAt = performance.now(); const stdout = []; const stderr = []; let outputBytes = 0; let limitFailure = null;
const child = spawn('/opt/clervo/sandbox-init', request.command, {
  cwd: '/workspace', detached: true, env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/workspace', LANG: 'C.UTF-8', CLERVO_PROCESSES: String(limits.processes), CLERVO_CPU_MILLIS: String(limits.cpuMillis), CLERVO_FILE_BYTES: String(limits.diskBytes) },
  stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
});
const stop = (reason) => { if (limitFailure === null) limitFailure = reason; try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
const capture = (target) => (chunk) => { outputBytes += chunk.length; if (outputBytes > limits.outputBytes) stop('output_limit'); else target.push(chunk); };
child.stdout.on('data', capture(stdout)); child.stderr.on('data', capture(stderr));
const usage = []; child.stdio[3].on('data', (chunk) => usage.push(chunk));
child.stdin.end(stdin);
const timer = setTimeout(() => stop('wall_time_limit'), limits.wallTimeMs);
const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); }); clearTimeout(timer);
let cpuMillis = 0; try { cpuMillis = JSON.parse(Buffer.concat(usage).toString('utf8')).cpuMillis; } catch {}
if (cpuMillis > limits.cpuMillis && limitFailure === null) limitFailure = 'cpu_limit';
process.stdout.write(`${JSON.stringify({ exitCode: Number.isInteger(result.code) ? result.code : 128, stdoutBase64: Buffer.concat(stdout).toString('base64'), stderrBase64: Buffer.concat(stderr).toString('base64'), cpuMillis, durationMs: Math.ceil(performance.now() - startedAt), limitFailure })}\n`);
