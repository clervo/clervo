# Current engineering state

Updated 2026-08-02 after Stage 7 completion. This is a compact resumable
handoff, not an authorization gate. Continue automatically after reading it.

## Active work

Stage 7 secure sandbox product core is complete. The contracts, lifecycle,
cleanup, artifact quarantine, cost controls, verified-image registry, runner,
Agent Sandbox adapter, and red-team gate are implemented and consolidated tests
pass. Public lifecycle remains `unavailable` because no persistent production
execution plane is deployed. Stage 8 universal multi-chain RPC is the current
roadmap priority; its bounded multi-chain policy is already committed.

The production runner `sandbox.nodejs-24` is qualified at digest
`sha256:9d06e5f6bc9b20f1719effa9c8cb3defea2392e31fe3aadd25eb5833b7550a7e`.
Google Cloud Build provenance is signed at SLSA build level 3, Google Artifact
Analysis found zero vulnerabilities, a fresh ClamAV scan found zero infections,
and the SPDX SBOM is hash-bound in the approved-image registry. Normal command
completion kills descendants, and an independent process-tree monitor enforces
the limit when the runtime ignores `RLIMIT_NPROC`. All three superseded digests
are blocked. Preserve the dedicated Artifact Registry repository and immutable
history.

## Live qualification result

GKE Calico failed closed because metadata remained reachable, including through
the managed Agent Sandbox air-gap. GKE Dataplane V2 passed the managed
air-gapped `SandboxTemplate`/`SandboxClaim` boundary. The final exact runner
image then passed all ten live containment probes: gVisor isolation, process,
disk, output, and time limits, metadata/internal/external network denial, secret
absence, host denial, descendant cleanup, and namespace cleanup. No token value
was logged or retained. The exact temporary cluster was deleted and independently
confirmed absent; Artifact Registry was preserved. Evidence is in
`docs/evidence/sandbox/gke-qualification-attempt.v1.json` and
`docs/evidence/sandbox/gvisor-red-team-report.v1.json`.

## Next actions

1. Continue Stage 8 from the next unfinished RPC registry/provider/probe work;
   N8.1's policy and unsafe-method boundary are already committed.
2. Build tested provider adapters, semantic health/stale/fork checks, routing,
   caching, pricing, and replay-safe broadcasting in roadmap order without
   stopping between internal checklist items.
3. Keep Sandbox public lifecycle `unavailable` until a persistent execution
   plane is deployed and operationally qualified; delayed cloud billing
   reconciliation is non-blocking.

## Preserved boundaries

The supply-foundation program is complete. The external RPC resale-permission
blocker remains isolated. `ai.clervo.dev` is live on protected Clervo VM
infrastructure and must never be included in sandbox/cloud cleanup. No real
payment, wallet signing, production mutation, or customer-data operation has
been performed in this work.
