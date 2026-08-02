#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const kubectl = process.env.CLERVO_KUBECTL_BIN ?? 'kubectl';
const kubeconfig = process.env.KUBECONFIG;
const expectedCluster = process.env.CLERVO_SANDBOX_QUALIFICATION_CLUSTER;
const image = process.env.CLERVO_SANDBOX_IMAGE_REFERENCE;
const acknowledgement = process.env.CLERVO_SANDBOX_QUALIFICATION_ACK;
const fullSuite = process.env.CLERVO_SANDBOX_QUALIFICATION_SUITE === 'full';
const namespace = 'clervo-sandbox-network-qualification';
const templateName = 'clervo-airgapped';
const claimName = 'clervo-airgapped-probe';

if (!kubeconfig || !expectedCluster || acknowledgement !== 'ephemeral-only') throw new Error('sandbox_qualification_context_required');
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
if (!context.includes(expectedCluster) || !expectedCluster.includes('-qual-')) throw new Error('sandbox_qualification_cluster_mismatch');

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
    const fs=require("node:fs"),http=require("node:http"),net=require("node:net");
    const connect=(host,port)=>new Promise(r=>{const s=net.createConnection({host,port});const done=(connected,code)=>{s.destroy();r({connected,code})};s.setTimeout(1500,()=>done(false,"timeout"));s.once("connect",()=>done(true,"connected"));s.once("error",e=>done(false,e.code||"error"))});
    const get=(path,headers={})=>new Promise(r=>{const q=http.request({host:"169.254.169.254",port:80,path,method:"GET",headers,timeout:1800},x=>{let n=0;x.on("data",c=>n+=c.length);x.on("end",()=>r({status:x.statusCode,bytes:n,metadataFlavor:x.headers["metadata-flavor"]||null}))});q.on("timeout",()=>{q.destroy();r({status:null,error:"timeout"})});q.on("error",e=>r({status:null,error:e.code||"error"}));q.end()});
    (async()=>{const status=fs.readFileSync("/proc/self/status","utf8");const cap=(status.match(/^CapEff:\\s*(.+)$/m)||[])[1]||"missing";const sensitive=Object.keys(process.env).filter(k=>/(secret|token|password|credential|private|wallet|api.?key)/i.test(k));process.stdout.write(JSON.stringify({uid:process.getuid(),gid:process.getgid(),capEff:cap,tokenVolume:fs.existsSync("/var/run/secrets/kubernetes.io/serviceaccount/token"),hostSockets:["/var/run/docker.sock","/run/containerd/containerd.sock","/run/crio/crio.sock"].filter(p=>fs.existsSync(p)),sensitiveEnvironmentKeys:sensitive,network:{metadataTcp:await connect("169.254.169.254",80),internal:await connect(${JSON.stringify(serviceIp)},443),external:await connect("8.8.8.8",53)},metadata:{flavored:await get("/computeMetadata/v1/",{"Metadata-Flavor":"Google"}),token:await get("/computeMetadata/v1/instance/service-accounts/default/token",{"Metadata-Flavor":"Google"})}}))})().catch(()=>process.exit(2));
  `;
  stage = 'execute_probe';
  const observation = JSON.parse(run(['exec', '-n', namespace, `pod/${claimName}`, '--', 'node', '-e', probe], { timeoutMs: 30_000 }).stdout);
  const policyIngress = policy.spec.ingress ?? [];
  const policyEgress = policy.spec.egress ?? [];
  const spec = pod.spec;
  const container = spec.containers?.[0];
  const metadataDenied = observation.network.metadataTcp.connected === false
    && observation.metadata.flavored.status === null && observation.metadata.token.status === null;
  const networkDenied = observation.network.internal.connected === false && observation.network.external.connected === false;
  const identitySafe = observation.uid === 65532 && observation.gid === 65532 && observation.capEff === '0000000000000000'
    && observation.tokenVolume === false && observation.hostSockets.length === 0 && observation.sensitiveEnvironmentKeys.length === 0;
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
    const runner = (command, limits) => {
      const request = JSON.stringify({ command, limits });
      const result = run(
        ['exec', '-i', '-n', namespace, `pod/${claimName}`, '--', 'node', '/opt/clervo/runner.mjs'],
        { input: request, allowFailure: true, timeoutMs: Math.max(30_000, limits.wallTimeMs + 15_000) },
      );
      try { return JSON.parse(result.stdout); }
      catch {
        failureCode = `runner_remote_status_${result.status}`;
        throw new Error('sandbox_qualification_runner_failed');
      }
    };
    const baseLimits = { cpuMillis: 5_000, processes: 64, diskBytes: 1_048_576, outputBytes: 65_536, wallTimeMs: 5_000 };

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
    const fork = runner(['node', '-e', 'const{spawn}=require("node:child_process");let started=0,failed=0;const children=[];for(let i=0;i<96;i++){const c=spawn("/bin/sleep",["30"],{stdio:"ignore"});children.push(c);c.once("spawn",()=>started++);c.once("error",()=>failed++)}setTimeout(()=>{const alive=children.filter(c=>{try{process.kill(c.pid,0);return true}catch{return false}}).length;process.stdout.write(JSON.stringify({started,failed,alive}))},500);setInterval(()=>{},1000)'], { ...baseLimits, processes: 32, wallTimeMs: 1_500 });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
    const remainingSleeps = Number(run(['exec', '-n', namespace, `pod/${claimName}`, '--', 'node', '-e', `
      const fs=require("node:fs");let n=0;for(const d of fs.readdirSync("/proc")){if(!/^\\d+$/.test(d))continue;try{if(fs.readFileSync("/proc/"+d+"/cmdline","utf8").includes("/bin/sleep\\u000030"))n++}catch{}}process.stdout.write(String(n));
    `]).stdout);
    let forkStarted = 96; let forkFailed = 0; let forkAlive = 96;
    try {
      const forkObservation = JSON.parse(Buffer.from(fork.stdoutBase64, 'base64').toString('utf8'));
      ({ started: forkStarted, failed: forkFailed, alive: forkAlive } = forkObservation);
    } catch {}
    const processLimit = (fork.limitFailure === 'process_limit' && fork.maximumProcessesObserved > 32
      || (fork.limitFailure === 'wall_time_limit' && forkAlive < 32 && forkFailed > 0)) && remainingSleeps === 0;

    stage = 'probe_decompression_bomb';
    const disk = runner(['node', '-e', 'require("node:fs").writeFileSync("/workspace/clervo-disk-probe.bin",Buffer.alloc(2097152))'], baseLimits);
    const diskState = JSON.parse(run(['exec', '-n', namespace, `pod/${claimName}`, '--', 'node', '-e', `
      const fs=require("node:fs"),p="/workspace/clervo-disk-probe.bin";let size=0;try{size=fs.statSync(p).size;fs.unlinkSync(p)}catch{}process.stdout.write(JSON.stringify({size}));
    `]).stdout);
    const diskLimit = disk.exitCode !== 0 && diskState.size <= baseLimits.diskBytes;

    stage = 'probe_output_flood';
    const output = runner(['node', '-e', 'process.stdout.write("x".repeat(1048576))'], { ...baseLimits, outputBytes: 4_096 });
    const outputLimit = output.limitFailure === 'output_limit';

    stage = 'probe_timeout';
    const timeout = runner(['node', '-e', 'setInterval(()=>{},1000)'], { ...baseLimits, wallTimeMs: 500 });
    const timeLimit = timeout.limitFailure === 'wall_time_limit';

    const controls = {
      runtime_isolation: runtimeIsolation,
      process_limit: processLimit,
      disk_limit: diskLimit,
      output_limit: outputLimit,
      time_limit: timeLimit,
      metadata_denied: metadataDenied,
      internal_network_denied: observation.network.internal.connected === false,
      external_network_denied: observation.network.external.connected === false,
      secrets_absent: identitySafe,
      host_access_denied: observation.hostSockets.length === 0 && escape.readable.length === 0,
    };
    const definitions = [
      ['sandbox.escape.kernel.v1', ['runtime_isolation', 'host_access_denied']],
      ['sandbox.limit.fork-bomb.v1', ['process_limit', 'time_limit']],
      ['sandbox.limit.decompression.v1', ['disk_limit', 'time_limit']],
      ['sandbox.limit.output-flood.v1', ['output_limit', 'time_limit']],
      ['sandbox.limit.timeout.v1', ['time_limit']],
      ['sandbox.network.metadata.v1', ['metadata_denied', 'external_network_denied']],
      ['sandbox.network.internal-ssrf.v1', ['internal_network_denied']],
      ['sandbox.network.external-ssrf.v1', ['external_network_denied']],
      ['sandbox.secret.discovery.v1', ['secrets_absent']],
      ['sandbox.host.socket.v1', ['host_access_denied', 'runtime_isolation']],
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
      runtimeMetrics: { forkStarted, forkFailed, forkAlive, maximumProcessesObserved: fork.maximumProcessesObserved, remainingSleeps, diskBytesObserved: diskState.size },
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

report = { ...report, cleanupVerified };
if (report.observations) report.observations = report.observations.map((observation) => ({ ...observation, cleanupVerified }));
if (!cleanupVerified) report.status = 'failed';
if (report.schemaVersion === 'clervo.sandbox-red-team-report.v1') {
  const unsigned = { ...report };
  delete unsigned.reportSha256;
  report.reportSha256 = `sha256:${createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')}`;
}
process.stdout.write(`${JSON.stringify(report)}\n`);
if (report.status !== 'passed') process.exitCode = 1;
