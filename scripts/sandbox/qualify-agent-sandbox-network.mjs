#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const productionPolicy = JSON.parse(await readFile(
  new URL('../../infra/sandbox/production-plane.v1.json', import.meta.url),
  'utf8',
));

const kubectl = process.env.CLERVO_KUBECTL_BIN ?? 'kubectl';
const kubeconfig = process.env.KUBECONFIG;
const expectedCluster = process.env.CLERVO_SANDBOX_QUALIFICATION_CLUSTER;
const image = process.env.CLERVO_SANDBOX_IMAGE_REFERENCE;
const acknowledgement = process.env.CLERVO_SANDBOX_QUALIFICATION_ACK;
const fullSuite = process.env.CLERVO_SANDBOX_QUALIFICATION_SUITE === 'full';
const requestedReportPath = process.env.CLERVO_SANDBOX_QUALIFICATION_REPORT_PATH;
const namespace = 'clervo-sandbox-network-qualification';
const templateName = 'clervo-airgapped';
const claimName = 'clervo-airgapped-probe';

const ephemeralMode = acknowledgement === 'ephemeral-only' && expectedCluster?.includes('-qual-');
const productionMode = acknowledgement === 'persistent-production'
  && expectedCluster === productionPolicy.cluster.name;
if (!kubeconfig || !expectedCluster || (!ephemeralMode && !productionMode)) throw new Error('sandbox_qualification_context_required');
const imageMatch = image?.match(/@(?<digest>sha256:[a-f0-9]{64})$/u);
if (!imageMatch?.groups?.digest) throw new Error('sandbox_qualification_image_digest_required');

function run(args, options = {}) {
  const result = spawnSync(kubectl, args, {
    encoding: 'utf8',
    env: { ...process.env, KUBECONFIG: kubeconfig },
    input: options.input,
    maxBuffer: 4 * 1024 * 1024,
    timeout: options.timeoutMs ?? 180_000,
  });
  if (result.error) throw new Error('sandbox_qualification_kubectl_failed');
  if (result.status !== 0 && !options.allowFailure) throw new Error(`sandbox_qualification_kubectl_rejected:${args[0] ?? 'unknown'}`);
  return { status: result.status ?? 1, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

const context = run(['config', 'current-context']).stdout;
if (!context.includes(expectedCluster)) throw new Error('sandbox_qualification_cluster_mismatch');

const namespaceResource = {
  apiVersion: 'v1',
  kind: 'Namespace',
  metadata: {
    name: namespace,
    labels: {
      'clervo.dev/plane': 'sandbox-execution',
      'pod-security.kubernetes.io/enforce': 'restricted',
      'pod-security.kubernetes.io/enforce-version': 'latest',
    },
  },
};

const template = {
  apiVersion: 'extensions.agents.x-k8s.io/v1alpha1',
  kind: 'SandboxTemplate',
  metadata: { name: templateName, namespace },
  spec: {
    networkPolicyManagement: 'Managed',
    networkPolicy: { ingress: [], egress: [] },
    podTemplate: {
      metadata: { labels: { 'app.kubernetes.io/name': 'clervo-sandbox', 'clervo.dev/qualification': 'agent-sandbox-network' } },
      spec: {
        runtimeClassName: 'gvisor',
        restartPolicy: 'Always',
        automountServiceAccountToken: false,
        enableServiceLinks: false,
        hostNetwork: false,
        hostPID: false,
        hostIPC: false,
        shareProcessNamespace: false,
        nodeSelector: {
          'sandbox.gke.io/runtime': 'gvisor',
          'clervo.dev/node-pool': 'sandbox-execution',
          'clervo.dev/execution-plane': 'true',
        },
        tolerations: [
          { key: 'sandbox.gke.io/runtime', operator: 'Equal', value: 'gvisor', effect: 'NoSchedule' },
          { key: 'clervo.dev/sandbox-only', operator: 'Equal', value: 'true', effect: 'NoSchedule' },
        ],
        securityContext: {
          runAsNonRoot: true,
          runAsUser: 65532,
          runAsGroup: 65532,
          fsGroup: 65532,
          seccompProfile: { type: 'RuntimeDefault' },
        },
        containers: [{
          name: 'runtime',
          image,
          imagePullPolicy: 'IfNotPresent',
          securityContext: {
            allowPrivilegeEscalation: false,
            privileged: false,
            readOnlyRootFilesystem: true,
            capabilities: { drop: ['ALL'] },
          },
          resources: {
            requests: { cpu: '10m', memory: '128Mi', 'ephemeral-storage': '64Mi' },
            limits: { cpu: '500m', memory: '256Mi', 'ephemeral-storage': '256Mi' },
          },
          volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }, { name: 'tmp', mountPath: '/tmp' }],
        }],
        volumes: [
          { name: 'workspace', emptyDir: { sizeLimit: '64Mi' } },
          { name: 'tmp', emptyDir: { medium: 'Memory', sizeLimit: '16Mi' } },
        ],
      },
    },
  },
};

const claim = {
  apiVersion: 'extensions.agents.x-k8s.io/v1alpha1',
  kind: 'SandboxClaim',
  metadata: { name: claimName, namespace },
  spec: {
    sandboxTemplateRef: { name: templateName },
    lifecycle: { shutdownPolicy: 'DeleteForeground', ttlSecondsAfterFinished: 60 },
  },
};

let report;
let cleanupVerified = false;
let stage = 'initialize';
let failureCode;
try {
  stage = 'apply_resources';
  run(['apply', '-f', '-'], { input: JSON.stringify({ apiVersion: 'v1', kind: 'List', items: [namespaceResource, template, claim] }) });
  stage = 'wait_for_runtime_creation';
  let runtimeCreated = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (run(['get', 'pod', claimName, '-n', namespace], { allowFailure: true }).status === 0) {
      runtimeCreated = true;
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  }
  if (!runtimeCreated) {
    failureCode = 'runtime_creation_timeout';
    throw new Error('sandbox_qualification_runtime_missing');
  }
  stage = 'wait_for_runtime';
  const waitResult = run(['wait', '--for=condition=Ready', `pod/${claimName}`, '-n', namespace, '--timeout=180s'], { allowFailure: true, timeoutMs: 190_000 });
  if (waitResult.status !== 0) {
    failureCode = waitResult.stderr.includes('deleted') ? 'runtime_recreated'
      : waitResult.stderr.includes('timed out') ? 'runtime_ready_timeout' : 'runtime_wait_rejected';
    throw new Error('sandbox_qualification_runtime_unready');
  }

  stage = 'inspect_runtime';
  const pod = JSON.parse(run(['get', 'pod', claimName, '-n', namespace, '-o', 'json']).stdout);
  const policy = JSON.parse(run(['get', 'networkpolicy', `${templateName}-network-policy`, '-n', namespace, '-o', 'json']).stdout);
  const serviceIp = run(['get', 'service', 'kubernetes', '-n', 'default', '-o', 'jsonpath={.spec.clusterIP}']).stdout;
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/u.test(serviceIp)) throw new Error('sandbox_qualification_service_ip_invalid');

  const probe = `
    const fs=require("node:fs"),http=require("node:http"),net=require("node:net"),dns=require("node:dns").promises;
    const connect=(host,port)=>new Promise(r=>{const s=net.createConnection({host,port});const done=(connected,code)=>{s.destroy();r({connected,code})};s.setTimeout(1500,()=>done(false,"timeout"));s.once("connect",()=>done(true,"connected"));s.once("error",e=>done(false,e.code||"error"))});
    const get=(path,headers={})=>new Promise(r=>{const q=http.request({host:"169.254.169.254",port:80,path,method:"GET",headers,timeout:1800},x=>{let n=0;x.on("data",c=>n+=c.length);x.on("end",()=>r({status:x.statusCode,bytes:n,metadataFlavor:x.headers["metadata-flavor"]||null}))});q.on("timeout",()=>{q.destroy();r({status:null,error:"timeout"})});q.on("error",e=>r({status:null,error:e.code||"error"}));q.end()});
    const resolveDns=()=>Promise.race([dns.resolve4("example.com").then(a=>({resolved:true,addresses:a.length})).catch(e=>({resolved:false,error:e.code||"error"})),new Promise(r=>setTimeout(()=>r({resolved:false,error:"timeout"}),1800))]);
    (async()=>{const status=fs.readFileSync("/proc/self/status","utf8");const cap=(status.match(/^CapEff:\\s*(.+)$/m)||[])[1]||"missing";const sensitive=Object.keys(process.env).filter(k=>/(secret|token|password|credential|private|wallet|api.?key|database|postgres|mysql|redis|provider|payment|clervo)/i.test(k));const exposedPaths=["/host","/root/.config/gcloud","/proc/1/root/etc/shadow","/sys/kernel/security","/dev/mem","/dev/kvm"].filter(p=>{try{fs.accessSync(p,fs.constants.R_OK);return true}catch{return false}});const procIds=fs.readdirSync("/proc").filter(v=>/^\\d+$/.test(v));process.stdout.write(JSON.stringify({uid:process.getuid(),gid:process.getgid(),capEff:cap,tokenVolume:fs.existsSync("/var/run/secrets/kubernetes.io/serviceaccount/token"),hostSockets:["/var/run/docker.sock","/run/containerd/containerd.sock","/run/crio/crio.sock"].filter(p=>fs.existsSync(p)),sensitiveEnvironmentKeys:sensitive,filesystem:{exposedPaths,procCount:procIds.length,pid1:fs.readFileSync("/proc/1/cmdline","utf8").replaceAll("\\u0000"," ").trim()},network:{dns:await resolveDns(),metadataTcp:await connect("169.254.169.254",80),internal:await connect(${JSON.stringify(serviceIp)},443),rfc1918:[await connect("10.0.0.1",443),await connect("172.16.0.1",443),await connect("192.168.0.1",443)],loopback:await connect("127.0.0.1",443),ipv6Loopback:await connect("::1",443),ipv6External:await connect("2001:4860:4860::8888",53),external:await connect("8.8.8.8",53)},metadata:{flavored:await get("/computeMetadata/v1/",{"Metadata-Flavor":"Google"}),token:await get("/computeMetadata/v1/instance/service-accounts/default/token",{"Metadata-Flavor":"Google"})}}))})().catch(()=>process.exit(2));
  `;
  stage = 'execute_probe';
  const observation = JSON.parse(run(['exec', '-n', namespace, `pod/${claimName}`, '--', 'node', '-e', probe], { timeoutMs: 30_000 }).stdout);
  const policyIngress = policy.spec.ingress ?? [];
  const policyEgress = policy.spec.egress ?? [];
  const spec = pod.spec;
  const container = spec.containers?.[0];
  const metadataDenied = observation.network.metadataTcp.connected === false
    && observation.metadata.flavored.status === null && observation.metadata.token.status === null;
  const networkDenied = observation.network.dns.resolved === false
    && [observation.network.internal, observation.network.external, observation.network.loopback, observation.network.ipv6Loopback, observation.network.ipv6External, ...observation.network.rfc1918].every(({ connected }) => connected === false);
  const identitySafe = observation.uid === 65532 && observation.gid === 65532 && observation.capEff === '0000000000000000'
    && observation.tokenVolume === false && observation.hostSockets.length === 0 && observation.sensitiveEnvironmentKeys.length === 0
    && observation.filesystem.exposedPaths.length === 0;
  const manifestSafe = spec.runtimeClassName === 'gvisor' && spec.automountServiceAccountToken === false
    && container?.securityContext?.readOnlyRootFilesystem === true && container?.securityContext?.allowPrivilegeEscalation === false;
  const airgapped = policy.spec.policyTypes?.includes('Ingress') && policy.spec.policyTypes?.includes('Egress')
    && policyIngress.length === 0 && policyEgress.length === 0;
  const networkControls = { metadataDenied, networkDenied, identitySafe, manifestSafe, airgapped };
  if (!fullSuite) {
    report = {
      schemaVersion: 'clervo.sandbox-network-qualification.v1',
      evaluatedAt: new Date().toISOString(),
      status: Object.values(networkControls).every(Boolean) ? 'passed' : 'failed',
      imageDigest: imageMatch.groups.digest,
      controls: networkControls,
      observation,
    };
  } else {
    const runnerResult = (command, limits, extra = {}) => {
      const request = JSON.stringify({ command, limits, ...extra });
      return run(
        ['exec', '-i', '-n', namespace, `pod/${claimName}`, '--', 'node', '/opt/clervo/runner.mjs'],
        { input: request, allowFailure: true, timeoutMs: Math.max(30_000, limits.wallTimeMs + 15_000) },
      );
    };
    const runner = (command, limits, extra = {}) => {
      const result = runnerResult(command, limits, extra);
      try { return JSON.parse(result.stdout); }
      catch {
        failureCode = `runner_remote_status_${result.status}`;
        throw new Error('sandbox_qualification_runner_failed');
      }
    };
    const baseLimits = { cpuMillis: 5_000, memoryBytes: 268_435_456, processes: 64, diskBytes: 67_108_864, outputBytes: 65_536, artifactBytes: 1_048_576, wallTimeMs: 5_000 };
    const clearWorkspace = () => {
      const cleared = runner(['node', '-e', 'const f=require("node:fs");for(const n of f.readdirSync("/workspace"))if(n!==".clervo-runtime")f.rmSync(`/workspace/${n}`,{recursive:true,force:true})'], baseLimits);
      if (cleared.exitCode !== 0 || cleared.limitFailure !== null) throw new Error('sandbox_qualification_workspace_cleanup_failed');
    };

    stage = 'probe_node_python_files_artifacts';
    const binaryInput = Buffer.from([0, 1, 2, 127, 128, 255]);
    const nodeProgram = `const f=require('node:fs');const b=f.readFileSync('nested/input.bin');const s=f.readFileSync(0,'utf8');f.mkdirSync('out',{recursive:true});f.writeFileSync('out/node.bin',Buffer.concat([b,Buffer.from(process.argv[1]+'|'+s)]));process.stdout.write(process.version);process.stderr.write('node-stderr');${'void 0;'.repeat(800)}`;
    const nodeRuntime = runner(['node', '-e', nodeProgram, 'node-arg'], baseLimits, {
      stdinBase64: Buffer.from('node-stdin').toString('base64'), files: [{ path: 'nested/input.bin', contentBase64: binaryInput.toString('base64') }],
      artifactPaths: [{ path: 'out/node.bin', filename: 'node-result.bin', mimeType: 'application/octet-stream' }],
    });
    const pythonProgram = `import os,sys;b=open('nested/python-input.bin','rb').read();s=sys.stdin.read();os.makedirs('out',exist_ok=True);open('out/python.bin','wb').write(b+(sys.argv[1]+'|'+s).encode());print(sys.version.split()[0],end='');print('python-stderr',end='',file=sys.stderr);${'x=1;'.repeat(1200)}`;
    const pythonRuntime = runner(['python3', '-c', pythonProgram, 'python-arg'], baseLimits, {
      stdinBase64: Buffer.from('python-stdin').toString('base64'), files: [{ path: 'nested/python-input.bin', contentBase64: binaryInput.toString('base64') }],
      artifactPaths: [{ path: 'out/python.bin', filename: 'python-result.bin', mimeType: 'application/octet-stream' }],
    });
    const runtimeArtifactSafe = (value) => value.exitCode === 0 && value.artifacts?.length === 1
      && value.artifacts[0].sha256 === `sha256:${createHash('sha256').update(Buffer.from(value.artifacts[0].contentBase64, 'base64')).digest('hex')}`;
    const nodeVersion = Buffer.from(nodeRuntime.stdoutBase64, 'base64').toString('utf8');
    const pythonVersion = Buffer.from(pythonRuntime.stdoutBase64, 'base64').toString('utf8');
    const languageRuntime = /^v24\./u.test(nodeVersion) && /^3\.12\./u.test(pythonVersion)
      && Buffer.from(nodeRuntime.stderrBase64, 'base64').toString('utf8') === 'node-stderr'
      && Buffer.from(pythonRuntime.stderrBase64, 'base64').toString('utf8') === 'python-stderr'
      && nodeProgram.length > 4_096 && pythonProgram.length > 4_096;
    const fileArtifactRuntime = runtimeArtifactSafe(nodeRuntime) && runtimeArtifactSafe(pythonRuntime);
    const duplicateFileRejected = /sandbox_file_invalid/u.test(runnerResult(['true'], baseLimits, { files: [{ path: 'same', contentBase64: '' }, { path: 'same', contentBase64: '' }] }).stderr);
    const traversalRejected = /sandbox_path_invalid/u.test(runnerResult(['true'], baseLimits, { files: [{ path: '../escape', contentBase64: '' }] }).stderr);
    const invalidPathsRejected = ['./dot', '/absolute', 'a\\b', 'a//b', '.clervo-runtime/program.js'].every((path) => /sandbox_path_invalid/u.test(runnerResult(['true'], baseLimits, { files: [{ path, contentBase64: '' }] }).stderr));
    const tooManyInputsRejected = /sandbox_files_invalid/u.test(runnerResult(['true'], baseLimits, { files: Array.from({ length: 33 }, (_, index) => ({ path: `too-many-${index}`, contentBase64: '' })) }).stderr);
    clearWorkspace();

    stage = 'probe_input_envelope';
    const nearInputBytes = 1_048_576 - Buffer.byteLength('true');
    const nearInput = runner(['true'], baseLimits, { files: [{ path: 'near-limit-input.bin', contentBase64: Buffer.alloc(nearInputBytes, 0xa5).toString('base64') }] });
    const overInputRejected = /sandbox_files_too_large/u.test(runnerResult(['true'], baseLimits, { files: [{ path: 'over-limit-input.bin', contentBase64: Buffer.alloc(nearInputBytes + 1).toString('base64') }] }).stderr);
    const multipleInputs = runner(['true'], baseLimits, { files: Array.from({ length: 32 }, (_, index) => ({ path: `multi/${index}.bin`, contentBase64: Buffer.from([index]).toString('base64') })) });
    const inputEnvelope = nearInput.exitCode === 0 && overInputRejected && multipleInputs.exitCode === 0 && tooManyInputsRejected;
    clearWorkspace();

    stage = 'probe_maximum_code_stdin';
    const maxCodePrefix = 'process.stdout.write("max-code");//';
    const maxCode = `${maxCodePrefix}${'x'.repeat(262_144 - maxCodePrefix.length)}`;
    const maximumCode = runner(['node', '-e', maxCode], { ...baseLimits, diskBytes: 2_097_152 });
    const overCodeRejected = /sandbox_command_invalid/u.test(runnerResult(['node', '-e', `${maxCode}x`], baseLimits).stderr);
    const stdinCommand = ['node', '-e', 'process.stdin.resume()'];
    const maxStdin = 1_048_576 - stdinCommand.reduce((total, part) => total + Buffer.byteLength(part), 0);
    const maximumStdin = runner(stdinCommand, baseLimits, { stdinBase64: Buffer.alloc(maxStdin).toString('base64') });
    const overStdinRejected = /sandbox_inline_input_too_large/u.test(runnerResult(stdinCommand, baseLimits, { stdinBase64: Buffer.alloc(maxStdin + 1).toString('base64') }).stderr);
    const largeEnvelopeBounded = Buffer.from(maximumCode.stdoutBase64, 'base64').toString('utf8') === 'max-code' && overCodeRejected && maximumStdin.exitCode === 0 && overStdinRejected;

    stage = 'probe_escape';
    const escape = JSON.parse(run(['exec', '-n', namespace, `pod/${claimName}`, '--', 'node', '-e', `
      const fs=require("node:fs");const paths=["/dev/kvm","/dev/mem","/proc/kcore","/var/run/docker.sock","/run/containerd/containerd.sock"];
      const readable=paths.filter(p=>{try{fs.accessSync(p,fs.constants.R_OK);return true}catch{return false}});
      let sysrqWritable=false;try{const fd=fs.openSync("/proc/sysrq-trigger","w");fs.closeSync(fd);sysrqWritable=true}catch{}
      process.stdout.write(JSON.stringify({readable,sysrqWritable}));
    `]).stdout);
    const runtimeIsolation = spec.runtimeClassName === 'gvisor' && spec.nodeSelector?.['sandbox.gke.io/runtime'] === 'gvisor'
      && escape.readable.length === 0 && escape.sysrqWritable === false;

    stage = 'probe_fork_bomb';
    const fork = runner(['sh', '-c', 'i=0; while [ "$i" -lt 96 ]; do /bin/sleep 30 & i=$((i+1)); done; wait'], { ...baseLimits, processes: 32, wallTimeMs: 5_000 });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
    const remainingSleeps = Number(run(['exec', '-n', namespace, `pod/${claimName}`, '--', 'node', '-e', `
      const fs=require("node:fs");let n=0;for(const d of fs.readdirSync("/proc")){if(!/^\\d+$/.test(d))continue;try{if(fs.readFileSync("/proc/"+d+"/cmdline","utf8").includes("/bin/sleep\\u000030"))n++}catch{}}process.stdout.write(String(n));
    `]).stdout);
    const forkStderr = Buffer.from(fork.stderrBase64, 'base64').toString('utf8');
    const forkDenied = /(?:can't|cannot|failed to) fork|resource temporarily unavailable|try again/iu.test(forkStderr);
    const processLimit = fork.maximumProcessesObserved >= 1 && fork.maximumProcessesObserved <= 32
      && remainingSleeps === 0
      && (fork.limitFailure === 'process_limit' || forkDenied);

    stage = 'probe_decompression_bomb';
    const disk = runner(['node', '-e', 'require("node:fs").writeFileSync("/workspace/clervo-disk-probe.bin",Buffer.alloc(2097152))'], { ...baseLimits, diskBytes: 1_048_576 });
    const diskState = JSON.parse(run(['exec', '-n', namespace, `pod/${claimName}`, '--', 'node', '-e', `
      const fs=require("node:fs"),p="/workspace/clervo-disk-probe.bin";let size=0;try{size=fs.statSync(p).size;fs.unlinkSync(p)}catch{}process.stdout.write(JSON.stringify({size}));
    `]).stdout);
    const diskLimit = disk.exitCode !== 0 && diskState.size <= baseLimits.diskBytes;

    stage = 'probe_output_flood';
    const output = runner(['node', '-e', 'process.stdout.write("x".repeat(1048576))'], { ...baseLimits, outputBytes: 4_096 });
    const outputLimit = output.limitFailure === 'output_limit';
    const stderrOutput = runner(['node', '-e', 'process.stderr.write("x".repeat(1048576))'], { ...baseLimits, outputBytes: 4_096 });
    const stderrLimit = stderrOutput.limitFailure === 'output_limit';

    stage = 'probe_cpu';
    const cpu = runner(['node', '-e', 'for(;;){}'], { ...baseLimits, cpuMillis: 100, wallTimeMs: 5_000 });
    const cpuLimit = cpu.limitFailure === 'cpu_limit' && cpu.cpuMillis > 100;

    stage = 'probe_artifact_bounds';
    clearWorkspace();
    const exactArtifact = runner(['node', '-e', 'require("node:fs").writeFileSync("artifact-exact.bin",Buffer.alloc(1048576,0x5a))'], baseLimits, { artifactPaths: [{ path: 'artifact-exact.bin', filename: 'qualified.bin', mimeType: 'application/octet-stream' }] });
    const aggregateArtifact = runner(['node', '-e', 'const f=require("node:fs");f.writeFileSync("artifact-a.bin",Buffer.alloc(600000));f.writeFileSync("artifact-b.bin",Buffer.alloc(600000))'], baseLimits, { artifactPaths: [{ path: 'artifact-a.bin' }, { path: 'artifact-b.bin' }] });
    const missingArtifact = runner(['true'], baseLimits, { artifactPaths: [{ path: 'artifact-missing.bin' }] });
    const zeroArtifact = runner(['node', '-e', 'require("node:fs").closeSync(require("node:fs").openSync("artifact-zero.bin","w"))'], baseLimits, { artifactPaths: [{ path: 'artifact-zero.bin' }] });
    const symlinkArtifact = runner(['node', '-e', 'const f=require("node:fs");f.writeFileSync("artifact-symlink-target","x");f.symlinkSync("artifact-symlink-target","artifact-symlink")'], baseLimits, { artifactPaths: [{ path: 'artifact-symlink' }] });
    const hardlinkArtifact = runner(['node', '-e', 'const f=require("node:fs");f.writeFileSync("artifact-hard-target","x");f.linkSync("artifact-hard-target","artifact-hard")'], baseLimits, { artifactPaths: [{ path: 'artifact-hard' }] });
    const artifactBounds = runtimeArtifactSafe(exactArtifact) && exactArtifact.artifacts[0].bytes === 1_048_576
      && aggregateArtifact.limitFailure === 'artifact_limit' && missingArtifact.artifacts.length === 0
      && zeroArtifact.limitFailure === 'artifact_limit' && symlinkArtifact.limitFailure === 'artifact_limit' && hardlinkArtifact.limitFailure === 'artifact_limit';
    clearWorkspace();

    stage = 'probe_sparse_pressure';
    const sparse = runner(['node', '-e', 'require("node:fs").truncateSync("sparse.bin",16777216)'], { ...baseLimits, diskBytes: 8_388_608 }, { artifactPaths: [{ path: 'sparse.bin' }] });
    const sparseBounded = sparse.exitCode !== 0 || sparse.limitFailure === 'disk_limit' || sparse.limitFailure === 'artifact_limit';
    clearWorkspace();

    stage = 'probe_timeout';
    const timeout = runner(['node', '-e', 'setInterval(()=>{},1000)'], { ...baseLimits, wallTimeMs: 500 });
    const timeLimit = timeout.limitFailure === 'wall_time_limit';

    stage = 'probe_inode_pressure';
    const inodePressure = runner(['node', '-e', 'const f=require("node:fs");f.mkdirSync("inode-pressure");for(let i=0;i<5000;i++)f.closeSync(f.openSync(`inode-pressure/${i}`,"w"))'], { ...baseLimits, cpuMillis: 10_000, wallTimeMs: 10_000 });
    const inodeLimit = inodePressure.limitFailure === 'disk_limit';

    const controls = {
      runtime_isolation: runtimeIsolation,
      process_limit: processLimit,
      disk_limit: diskLimit,
      output_limit: outputLimit && stderrLimit,
      cpu_limit: cpuLimit,
      time_limit: timeLimit,
      metadata_denied: metadataDenied,
      internal_network_denied: observation.network.internal.connected === false,
      external_network_denied: observation.network.external.connected === false,
      secrets_absent: identitySafe,
      host_access_denied: observation.hostSockets.length === 0 && escape.readable.length === 0,
      language_runtime: languageRuntime,
      file_artifact_runtime: fileArtifactRuntime,
      invalid_file_paths_denied: duplicateFileRejected && traversalRejected && invalidPathsRejected,
      input_envelope: inputEnvelope,
      large_code_stdin_envelope: largeEnvelopeBounded,
      artifact_bounds: artifactBounds,
      sparse_inode_bounds: sparseBounded && inodeLimit,
    };
    const definitions = [
      ['sandbox.escape.kernel.v1', ['runtime_isolation', 'host_access_denied']],
      ['sandbox.limit.fork-bomb.v1', ['process_limit', 'time_limit']],
      ['sandbox.limit.decompression.v1', ['disk_limit', 'time_limit']],
      ['sandbox.limit.output-flood.v1', ['output_limit', 'time_limit']],
      ['sandbox.limit.cpu.v1', ['cpu_limit', 'time_limit']],
      ['sandbox.limit.storage-pressure.v1', ['disk_limit', 'sparse_inode_bounds']],
      ['sandbox.limit.timeout.v1', ['time_limit']],
      ['sandbox.network.metadata.v1', ['metadata_denied', 'external_network_denied']],
      ['sandbox.network.internal-ssrf.v1', ['internal_network_denied']],
      ['sandbox.network.external-ssrf.v1', ['external_network_denied']],
      ['sandbox.secret.discovery.v1', ['secrets_absent']],
      ['sandbox.host.socket.v1', ['host_access_denied', 'runtime_isolation']],
      ['sandbox.input.envelope.v1', ['input_envelope', 'large_code_stdin_envelope', 'invalid_file_paths_denied']],
      ['sandbox.artifact.envelope.v1', ['artifact_bounds', 'file_artifact_runtime']],
    ];
    const observations = definitions.map(([probeId, required]) => {
      const contained = required.every((control) => controls[control] === true);
      return {
        probeId,
        outcome: contained ? 'contained' : 'violated',
        controls,
        runtimeAttested: runtimeIsolation,
        cleanupVerified: false,
        chargedMicrousd: 0,
        safeDetail: contained ? 'contained by live gVisor qualification' : 'live containment control failed',
      };
    });
    report = {
      schemaVersion: 'clervo.sandbox-red-team-report.v1',
      evaluatedAt: new Date().toISOString(),
      status: observations.every(({ outcome }) => outcome === 'contained') ? 'passed' : 'failed',
      probeCount: observations.length,
      imageDigest: imageMatch.groups.digest,
      observations,
      runtimeMetrics: {
        runnerExitCode: fork.exitCode,
        runnerLimitFailure: fork.limitFailure,
        runnerStdoutBytes: Buffer.from(fork.stdoutBase64, 'base64').byteLength,
        runnerStderrBytes: Buffer.byteLength(forkStderr),
        forkDenied,
        maximumProcessesObserved: fork.maximumProcessesObserved,
        remainingSleeps,
        diskBytesObserved: diskState.size,
        nodeVersion,
        pythonVersion,
        nodeProgramBytes: Buffer.byteLength(nodeProgram),
        pythonProgramBytes: Buffer.byteLength(pythonProgram),
        nodeArtifactBytes: nodeRuntime.artifacts?.[0]?.bytes ?? 0,
        pythonArtifactBytes: pythonRuntime.artifacts?.[0]?.bytes ?? 0,
        maximumInputBytes: nearInputBytes,
        maximumInlineCodeBytes: Buffer.byteLength(maxCode),
        maximumStdinBytes: maxStdin,
        maximumArtifactBytes: exactArtifact.artifacts?.[0]?.bytes ?? 0,
        cpuMillisObserved: cpu.cpuMillis,
        inodeLimitFailure: inodePressure.limitFailure,
      },
    };
  }
} catch {
  const podResult = stage === 'wait_for_runtime'
    ? run(['get', 'pod', claimName, '-n', namespace, '-o', 'json'], { allowFailure: true })
    : { status: 1, stdout: '' };
  let podState;
  let eventReasons;
  if (podResult.status === 0) {
    const failedPod = JSON.parse(podResult.stdout);
    podState = {
      phase: failedPod.status?.phase ?? 'unknown',
      conditions: (failedPod.status?.conditions ?? []).map(({ type, status, reason }) => ({ type, status, reason: reason ?? null })),
      containerReasons: (failedPod.status?.containerStatuses ?? []).map(({ state }) => state?.waiting?.reason ?? state?.terminated?.reason ?? 'unknown'),
    };
    const eventsResult = run(['get', 'events', '-n', namespace, '--field-selector', `involvedObject.name=${claimName}`, '-o', 'json'], { allowFailure: true });
    if (eventsResult.status === 0) {
      eventReasons = JSON.parse(eventsResult.stdout).items.map(({ type, reason, reportingComponent }) => ({
        type: type ?? 'unknown',
        reason: reason ?? 'unknown',
        reportingComponent: reportingComponent ?? 'unknown',
      }));
    }
  }
  report = {
    schemaVersion: fullSuite ? 'clervo.sandbox-red-team-report.v1' : 'clervo.sandbox-network-qualification.v1',
    evaluatedAt: new Date().toISOString(),
    status: 'failed',
    imageDigest: imageMatch.groups.digest,
    safeDetail: `qualification failed closed at ${stage}`,
    ...(failureCode ? { failureCode } : {}),
    ...(podState ? { podState } : {}),
    ...(eventReasons ? { eventReasons } : {}),
  };
} finally {
  run(['delete', 'sandboxclaim', claimName, '-n', namespace, '--ignore-not-found=true', '--wait=true'], { allowFailure: true });
  run(['delete', 'sandboxtemplate', templateName, '-n', namespace, '--ignore-not-found=true', '--wait=true'], { allowFailure: true });
  run(['delete', 'namespace', namespace, '--ignore-not-found=true', '--wait=true', '--timeout=120s'], { allowFailure: true, timeoutMs: 130_000 });
  cleanupVerified = run(['get', 'namespace', namespace], { allowFailure: true }).status !== 0;
}

report = {
  ...report,
  qualificationContext: {
    mode: productionMode ? 'persistent-production' : 'ephemeral-only',
    clusterName: expectedCluster,
    zone: productionMode ? productionPolicy.zone : null,
    runtimeClass: 'gvisor',
    namespace,
  },
  cleanupVerified,
};
if (report.observations) report.observations = report.observations.map((observation) => ({ ...observation, cleanupVerified }));
if (!cleanupVerified) report.status = 'failed';
if (report.schemaVersion === 'clervo.sandbox-red-team-report.v1') {
  const unsigned = { ...report };
  delete unsigned.reportSha256;
  report.reportSha256 = `sha256:${createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')}`;
}
if (requestedReportPath !== undefined) {
  if (!productionMode || !fullSuite || requestedReportPath !== 'docs/evidence/sandbox/gvisor-production-red-team.v1.json') {
    throw new Error('sandbox_qualification_report_path_refused');
  }
  await writeFile(new URL('../../docs/evidence/sandbox/gvisor-production-red-team.v1.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
}
process.stdout.write(`${JSON.stringify(report)}\n`);
if (report.status !== 'passed') process.exitCode = 1;
