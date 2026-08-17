#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, lstatSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

const MAX_REQUEST_BYTES = 1_500_000;
const MAX_INLINE_INPUT_BYTES = 1_048_576;
const MAX_OUTPUT_BYTES = 1_048_576;
const MAX_ARTIFACT_BYTES = 1_048_576;
const MAX_WORKSPACE_ENTRIES = 4_096;

const chunks = []; let requestBytes = 0;
for await (const chunk of process.stdin) { requestBytes += chunk.length; if (requestBytes > MAX_REQUEST_BYTES) throw new Error('sandbox_request_too_large'); chunks.push(chunk); }
const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const limits = request.limits ?? {};
const integer = (value, minimum, maximum) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
if (!Array.isArray(request.command) || request.command.length < 1 || request.command.length > 32) throw new Error('sandbox_command_invalid');
const inlineProgram = (request.command[0] === 'node' && request.command[1] === '-e') || ((request.command[0] === 'python' || request.command[0] === 'python3') && request.command[1] === '-c');
if (request.command.some((part, index) => typeof part !== 'string' || part.length < 1 || part.length > (inlineProgram && index === 2 ? 262_144 : 4_096) || /[\u0000-\u001f\u007f]/u.test(part))) throw new Error('sandbox_command_invalid');
if (!integer(limits.cpuMillis, 1, 300000) || !integer(limits.memoryBytes, 16_777_216, 8_589_934_592) || !integer(limits.processes, 1, 256) || !integer(limits.diskBytes, 1048576, 10737418240) || !integer(limits.outputBytes, 1, MAX_OUTPUT_BYTES) || !integer(limits.artifactBytes, 1, MAX_ARTIFACT_BYTES) || !integer(limits.wallTimeMs, 100, 300000)) throw new Error('sandbox_limits_invalid');
const canonicalBase64 = (value) => typeof value === 'string' && value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value) && Buffer.from(value, 'base64').toString('base64') === value;
if (request.stdinBase64 !== undefined && !canonicalBase64(request.stdinBase64)) throw new Error('sandbox_stdin_invalid');
const stdin = request.stdinBase64 === undefined ? Buffer.alloc(0) : Buffer.from(request.stdinBase64, 'base64'); if (stdin.length > MAX_INLINE_INPUT_BYTES) throw new Error('sandbox_stdin_invalid');
const workspace = resolve('/workspace');
const safePath = (value) => {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || value.startsWith('/') || value.includes('\\')) throw new Error('sandbox_path_invalid');
  const parts = value.split('/');
  if (parts[0] === '.clervo-runtime' || parts.some((part) => part === '' || part === '.' || part === '..' || !/^[A-Za-z0-9._ -]+$/u.test(part))) throw new Error('sandbox_path_invalid');
  const target = resolve(workspace, value);
  if (target !== workspace && !target.startsWith(`${workspace}${sep}`)) throw new Error('sandbox_path_invalid');
  return target;
};
const files = request.files ?? [];
if (!Array.isArray(files) || files.length > 32) throw new Error('sandbox_files_invalid');
let inputBytes = stdin.length + request.command.reduce((total, part) => total + Buffer.byteLength(part), 0);
if (inputBytes > MAX_INLINE_INPUT_BYTES) throw new Error('sandbox_inline_input_too_large');
const inputPaths = new Set();
for (const item of files) {
  if (item === null || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => !['path', 'contentBase64'].includes(key))) throw new Error('sandbox_file_invalid');
  const target = safePath(item?.path);
  if (inputPaths.has(item.path) || !canonicalBase64(item?.contentBase64)) throw new Error('sandbox_file_invalid'); inputPaths.add(item.path);
  const bytes = Buffer.from(item.contentBase64, 'base64');
  if (bytes.length > MAX_INLINE_INPUT_BYTES || (inputBytes += bytes.length) > MAX_INLINE_INPUT_BYTES) throw new Error('sandbox_files_too_large');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 });
}
const artifactPaths = request.artifactPaths ?? [];
if (!Array.isArray(artifactPaths) || artifactPaths.length > 32) throw new Error('sandbox_artifacts_invalid');
const requestedArtifactPaths = new Set();
for (const requested of artifactPaths) {
  if (requested === null || typeof requested !== 'object' || Array.isArray(requested) || Object.keys(requested).some((key) => !['path', 'filename', 'mimeType'].includes(key))) throw new Error('sandbox_artifact_invalid');
  safePath(requested.path);
  if (requestedArtifactPaths.has(requested.path)) throw new Error('sandbox_artifact_invalid'); requestedArtifactPaths.add(requested.path);
  if (requested.filename !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/u.test(requested.filename)) throw new Error('sandbox_artifact_invalid');
  if (requested.mimeType !== undefined && !/^[a-z0-9][a-z0-9.+-]{0,63}\/[a-z0-9][a-z0-9.+-]{0,63}$/u.test(requested.mimeType)) throw new Error('sandbox_artifact_invalid');
}
let childCommand = request.command;
let runtimeDirectory;
if (inlineProgram) {
  runtimeDirectory = join(workspace, '.clervo-runtime'); rmSync(runtimeDirectory, { recursive: true, force: true }); mkdirSync(runtimeDirectory, { mode: 0o700 });
  const programPath = join(runtimeDirectory, request.command[0] === 'node' ? 'program.js' : 'program.py');
  writeFileSync(programPath, request.command[2], { encoding: 'utf8', flag: 'wx', mode: 0o400 });
  const loader = request.command[0] === 'node'
    ? `eval(require('node:fs').readFileSync(${JSON.stringify(programPath)}, 'utf8'))`
    : `exec(compile(open(${JSON.stringify(programPath)}, 'rb').read(), ${JSON.stringify(programPath)}, 'exec'))`;
  childCommand = [request.command[0], request.command[1], loader, ...request.command.slice(3)];
}
const startedAt = performance.now(); const stdout = []; const stderr = []; let outputBytes = 0; let limitFailure = null;
const child = spawn('/opt/clervo/sandbox-init', childCommand, {
  cwd: '/workspace', detached: true, env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/workspace', LANG: 'C.UTF-8', CLERVO_PROCESSES: String(limits.processes), CLERVO_CPU_MILLIS: String(limits.cpuMillis), CLERVO_FILE_BYTES: String(limits.diskBytes) },
  stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
});
const killProcessGroup = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
const stop = (reason) => { if (limitFailure === null) limitFailure = reason; killProcessGroup(); };
let maximumProcessesObserved = 0;
const workspaceUsage = () => {
  let bytes = 0; let entries = 0;
  const directories = [workspace];
  while (directories.length > 0 && entries <= MAX_WORKSPACE_ENTRIES && bytes <= limits.diskBytes) {
    const directory = directories.pop();
    let contents;
    try { contents = readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of contents) {
      entries += 1;
      if (entries > MAX_WORKSPACE_ENTRIES) break;
      const target = join(directory, entry.name);
      if (entry.isDirectory()) directories.push(target);
      else {
        try { bytes += lstatSync(target).size; } catch {}
      }
      if (bytes > limits.diskBytes) break;
    }
  }
  return { bytes, entries };
};
const processTreeSize = () => {
  const parents = new Map();
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/u.test(entry)) continue;
    try {
      const stat = readFileSync(`/proc/${entry}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(') ') + 2).split(' ');
      parents.set(Number(entry), Number(fields[1]));
    } catch {}
  }
  const descendants = new Set([child.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, parent] of parents) if (!descendants.has(pid) && descendants.has(parent)) {
      descendants.add(pid); changed = true;
    }
  }
  return descendants.size;
};
const capture = (target) => (chunk) => { outputBytes += chunk.length; if (outputBytes > limits.outputBytes) stop('output_limit'); else target.push(chunk); };
child.stdout.on('data', capture(stdout)); child.stderr.on('data', capture(stderr));
const usage = []; child.stdio[3].on('data', (chunk) => usage.push(chunk));
child.stdin.on('error', () => { /* A fast-exiting child may close its pipe before end(); its exit status remains authoritative. */ });
child.stdin.end(stdin);
const timer = setTimeout(() => stop('wall_time_limit'), limits.wallTimeMs);
const processTimer = setInterval(() => {
  const observed = processTreeSize(); maximumProcessesObserved = Math.max(maximumProcessesObserved, observed);
  if (observed > limits.processes) stop('process_limit');
}, 10);
const workspaceTimer = setInterval(() => {
  const observed = workspaceUsage();
  if (observed.bytes > limits.diskBytes || observed.entries > MAX_WORKSPACE_ENTRIES) stop('disk_limit');
}, 25);
const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); }); clearTimeout(timer); clearInterval(processTimer); clearInterval(workspaceTimer); killProcessGroup();
if (runtimeDirectory !== undefined) rmSync(runtimeDirectory, { recursive: true, force: true });
const finalWorkspaceUsage = workspaceUsage();
if ((finalWorkspaceUsage.bytes > limits.diskBytes || finalWorkspaceUsage.entries > MAX_WORKSPACE_ENTRIES) && limitFailure === null) limitFailure = 'disk_limit';
let cpuMillis = 0;
try {
  const nativeUsage = JSON.parse(Buffer.concat(usage).toString('utf8'));
  cpuMillis = nativeUsage.cpuMillis;
  maximumProcessesObserved = Math.max(maximumProcessesObserved, nativeUsage.maximumProcessesObserved ?? 0);
  if (nativeUsage.processLimitTriggered === true) limitFailure = 'process_limit';
} catch {}
if (cpuMillis > limits.cpuMillis && limitFailure === null) limitFailure = 'cpu_limit';
const artifacts = [];
let artifactBytes = 0;
if (limitFailure === null) for (const requested of artifactPaths) {
  const target = safePath(requested?.path);
  let stat;
  try { stat = lstatSync(target); } catch { continue; }
  if (!stat.isFile() || stat.nlink !== 1 || stat.size < 1 || stat.size > limits.artifactBytes) { limitFailure = 'artifact_limit'; break; }
  const resolved = realpathSync(target);
  if (resolved !== target || (resolved !== workspace && !resolved.startsWith(`${workspace}${sep}`))) { limitFailure = 'artifact_limit'; break; }
  const bytes = readFileSync(target);
  artifactBytes += bytes.length;
  if (artifactBytes > limits.artifactBytes) { limitFailure = 'artifact_limit'; break; }
  const mimeType = typeof requested.mimeType === 'string' && /^[a-z0-9][a-z0-9.+-]{0,63}\/[a-z0-9][a-z0-9.+-]{0,63}$/u.test(requested.mimeType) ? requested.mimeType : 'application/octet-stream';
  const filename = typeof requested.filename === 'string' && /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/u.test(requested.filename) ? requested.filename : basename(target);
  artifacts.push({ path: requested.path, filename, mimeType, bytes: bytes.length, sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, contentBase64: bytes.toString('base64') });
}
const durationMs = limitFailure === 'wall_time_limit' ? limits.wallTimeMs : Math.min(limits.wallTimeMs, Math.ceil(performance.now() - startedAt));
process.stdout.write(`${JSON.stringify({ exitCode: limitFailure === null ? (Number.isInteger(result.code) ? result.code : 128) : 137, stdoutBase64: Buffer.concat(stdout).toString('base64'), stderrBase64: Buffer.concat(stderr).toString('base64'), cpuMillis, durationMs, maximumProcessesObserved, limitFailure, artifacts })}\n`);
