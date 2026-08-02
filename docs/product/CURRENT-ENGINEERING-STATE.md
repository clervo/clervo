# Current engineering state

Updated 2026-08-02 after Stage 11 private-stability completion. This is a compact resumable
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
unqualified.

Stage 9 Prediction-market Intelligence product core is complete locally. Both
public source adapters passed current live read-only payload conformance with
fresh binary quotes, explicit resolution rules/source links, and zero owner
cash spend. The normalized schema, visible-price probability method, freshness,
provenance, confidence-scored matching, false-merge rejection, comparison,
append-only hash-linked history, movement/liquidity/disagreement signals,
independent venue degradation, five operation contracts, gateway, internal
pricing, and unavailable registry projection pass the consolidated 18-test
suite. Kalshi's deprecated liquidity field and contract-count volume are not
represented as USD. Customer lifecycle and retained history remain
`unavailable` until commercial reuse, resale, and history rights are qualified.

Stage 10 Crypto Intelligence product core is complete locally. Canonical EVM
and Solana wallets, assets, exact atomic amounts, decimals, tokens,
transactions, protocol positions, timestamps, freshness, coverage, confidence,
field evidence, source conflicts, and deterministic reports are implemented.
Missing values remain null, source disagreements remain unresolved and visible,
malicious claims require attributable evidence, risk language is cautious, and
the gateway has no custody, signing, transaction submission, or trading
surface. Existing technically tested EVM, Solana, and multichain assets are
retained, but every route remains customer-disabled because commercial terms
are restricted or prohibited. The consolidated Stage 10 suite passes 20/20
with 92 schemas and 126 fixtures validated.

Stage 11 combined workflows and private six-product stabilization are complete.
Three replay-safe Find → Understand → Act compositions cover all six pillars
while preserving search citations, exact AI identity and evidence grounding,
sandbox image/isolation/cleanup controls, read-only RPC policy, prediction
resolution provenance/freshness, crypto coverage/conflicts, quotes, receipts,
step and total supplier-cost ceilings, and degradation. The executable
eight-drill campaign passed outage isolation, 1,000-attempt replay, unknown
settlement quarantine, cost cutoff, sandbox orphan cleanup, telemetry secret
redaction, dependency recovery, and contract-tamper rejection. The consolidated
Stage 11 suite passes 12/12 with 93 schemas and 128 fixtures validated. These
are private qualifications; public lifecycle did not change. Stage 12
cross-pillar compatibility and product-core freeze is the current priority.

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

1. Continue Stage 12 by verifying and freezing the canonical registry,
   operation set, schemas, visibility, prices, lifecycle projections, examples,
   and release-candidate interfaces without exposing internal or sealed data.
2. Keep Crypto Intelligence customer routing disabled until written commercial
   permission or replacement terms-compatible EVM, Solana, and protocol supply
   exists; this isolated owner blocker does not pause combined local work.
3. Keep Prediction customer routing and retained history disabled until
   commercial reuse, resale, and history rights are qualified; this isolated
   owner blocker does not pause combined workflows or other local engineering.
4. Keep RPC customer routing disabled until written commercial permission or
   replacement terms-compatible supply exists; this isolated owner blocker does
   not pause combined workflows or other local engineering.
5. Keep Sandbox public lifecycle `unavailable` until a persistent execution
   plane is deployed and operationally qualified; delayed cloud billing
   reconciliation is non-blocking.

## Preserved boundaries

The supply-foundation program is complete. The external RPC resale-permission
blocker remains isolated. `ai.clervo.dev` is live on protected Clervo VM
infrastructure and must never be included in sandbox/cloud cleanup. No real
payment, wallet signing, production mutation, or customer-data operation has
been performed in this work.
