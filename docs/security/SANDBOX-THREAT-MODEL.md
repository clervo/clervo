# Secure Sandbox threat model

Status: enforced by the current qualified runtime and release policy.

Clervo treats submitted code, dependencies, archives, artifacts, stdout, and
filenames as hostile. The protected assets are tenant data, Clervo/provider
secrets, commerce and signing material, internal services, control-plane APIs,
the host kernel, other executions, and `ai.clervo.dev` on the Clervo VM.

## Isolation decision

The first execution tier uses gVisor (`runsc`) on dedicated execution nodes,
never a plain container runtime. gVisor interposes a userspace application
kernel between workloads and the host system-call surface. This matches the
current GKE Sandbox design for unknown multi-tenant code without requiring
nested virtualization. Hardware microVM isolation remains a possible higher
tier; it is not claimed or emulated by the initial product.

The API/control plane and execution plane use separate identities, nodes,
namespaces, networks, storage prefixes, quotas, and logs. Execution nodes hold
no commerce, provider, wallet, database, R2, or model-gateway credentials.

## Mandatory boundary

- Exact digest-pinned read-only image; ephemeral writable layer only.
- `runtimeClassName: gvisor`, dedicated tainted nodes, non-root UID/GID,
  privilege escalation disabled, seccomp RuntimeDefault, and all capabilities
  dropped.
- No host PID/IPC/network, host paths, host ports, devices, custom sysctls,
  service-account token, projected credentials, Docker/containerd sockets, or
  control-plane credentials.
- Default-deny ingress and egress, including cloud metadata, link-local,
  loopback-to-host, private networks, DNS, and `ai.clervo.dev`. Network-enabled
  products require a separate allowlist contract and proxy; v1 has none.
- Hard CPU, memory, process, disk, output, artifact, wall-time, and maximum
  charge limits reserved before dispatch and enforced outside the workload.
- Output and artifacts are bounded, content-addressed, malware-scanned, and
  treated as untrusted after execution.
- Deadline termination, namespace/workload deletion, artifact cleanup, and an
  orphan reaper are mandatory. Unknown cleanup state fails closed.

## Qualification and release gate

Every runner image must pass escape, fork-bomb, decompression-bomb,
output-flood, metadata, SSRF, filesystem, cross-tenant, secret, deadline, kill,
cleanup, orphan, accounting, and replay checks before it can serve traffic.
Local mocks prove only control-plane logic and never isolation.

Primary design references:

- https://gvisor.dev/docs/architecture_guide/security/
- https://docs.cloud.google.com/kubernetes-engine/docs/concepts/sandbox-pods
- https://docs.cloud.google.com/kubernetes-engine/docs/how-to/how-install-agent-sandbox
