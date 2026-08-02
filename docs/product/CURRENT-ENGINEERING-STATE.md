# Current engineering state

Updated 2026-08-02 after Stage 8 product-core completion. This is a compact resumable
handoff, not an authorization gate. Continue automatically after reading it.

## Active work

Stage 7 secure sandbox product core is complete. The contracts, lifecycle,
cleanup, artifact quarantine, cost controls, verified-image registry, runner,
Agent Sandbox adapter, and red-team gate are implemented and consolidated tests
pass. Public lifecycle remains `unavailable` because no persistent production
execution plane is deployed.

Stage 8 universal multi-chain RPC product core is also complete locally. The
eight-chain registry, strict JSON-RPC adapter, semantic identity/head/finalized
probes, latency and height routing, stale/fork removal, read failover, optional
quorum, safe caching, method/batch/concurrency/response limits, product
contracts, pricing, automatic health, and replay-safe broadcasting are
implemented. The consolidated Stage 8 suite passes 21/21. Customer lifecycle
remains `unavailable`: every current upstream route is terms-restricted or
prohibited for resale, and archive/broadcast supply is intentionally
unqualified. Stage 9 Prediction-market Intelligence is the current roadmap
priority.

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

1. Continue Stage 9 with normalized prediction-market/outcome contracts,
   source adapters, resolution provenance, freshness, matching, comparison,
   history, probabilities, liquidity, and evidence-backed signals.
2. Keep RPC customer routing disabled until written commercial permission or
   replacement terms-compatible supply exists; this isolated owner blocker does
   not pause Prediction or other local engineering.
3. Keep Sandbox public lifecycle `unavailable` until a persistent execution
   plane is deployed and operationally qualified; delayed cloud billing
   reconciliation is non-blocking.

## Preserved boundaries

The supply-foundation program is complete. The external RPC resale-permission
blocker remains isolated. `ai.clervo.dev` is live on protected Clervo VM
infrastructure and must never be included in sandbox/cloud cleanup. No real
payment, wallet signing, production mutation, or customer-data operation has
been performed in this work.
