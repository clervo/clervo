# Current engineering state

Updated 2026-08-02 after Stage 12 product-core freeze completion and V6 visual
handoff verification. This is a compact resumable handoff, not an authorization
gate. Continue automatically after reading it.

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
are private qualifications; public lifecycle did not change.

Stage 12 cross-pillar compatibility and product-core freeze is complete. The
release-candidate manifest binds the canonical registry, private workflow
qualifications, exact 32-operation split, six price sources, lifecycle
projection, schema visibility, 94 schemas, and 130 examples with independently
recomputed hashes. The only frozen external operations are `search.web` and
`search.answer`; their registry entries remain internal preview surfaces and
the manifest explicitly makes no public-distribution claim. The consolidated
Stage 12 suite passes 5/5 plus complete contract validation. Stage 13 shared
access, design, onboarding, and distribution is next.

Stage 13 distribution discovery has started. The existing `clervo` npm account,
`clervo`, `@clervo/sdk`, `@clervo/mcp`, and `@clervo/beacon` package identities,
the `clervo-sdk` PyPI project, and the `clervo` GitHub organization are retained.
Published legacy packages are read-only compatibility evidence and contain
stale claims that must not be copied. The redacted resumable inventory is
`docs/product/DISTRIBUTION-ASSET-INVENTORY.md`.

The Stage 13 local distribution candidate now includes a frozen-registry
projection, TypeScript and Python SDKs, an official-SDK MCP server, and one
cross-client golden transcript. Package archives and isolated installs pass;
none is claimed as the current public registry release.

The functional V6 product experience is also complete as a repository-local
candidate. Thirteen routes are prerendered and hydrate into product,
activation, nine-step deterministic Proof Lab, docs, pricing truth, benchmark
truth, security, legal-boundary, and status surfaces. The canonical physical
prism is generated in Blender 5.2.0 LTS, preserved as `.blend`, exported as a
named animated GLB, rendered across six lifecycle states in desktop and
portrait formats, and hash-validated. Desktop WebGL is progressive after user
interaction; mobile and reduced-motion paths use 12 optimized canonical
renders and never load Three.js or the GLB.

The consolidated site check passes 12 routes with zero axe findings, keyboard
search and browser history, no-JavaScript docs, 320/360/390/430/tablet/
landscape reflow, 200% text zoom, mobile reduced motion, and zero browser
console or request failures. Fresh desktop and mobile Lighthouse runs score
100 in performance, accessibility, best practices, SEO, and agentic browsing,
with zero blocking time and layout shift. This proves the local candidate, not
public deployment or customer availability.

Stage 13 package preparation is complete locally. The planned canonical public
source repository is `clervo/clervo`; it has not been created or connected.
`@clervo/sdk@0.3.0`, `@clervo/mcp@0.3.0`, and `clervo-sdk@0.2.0` now carry
truthful source metadata and advance the observed registry versions while
remaining unpublished. Actual npm archives, a Python wheel, and a Python source
distribution install and import successfully in isolated temporary consumers.
The manual publish workflow is exact-commit-bound, protected by the
`package-release` environment, uses short-lived npm/PyPI OIDC identities, pins
its actions and release tooling, and fails closed before publishing if any
candidate version already exists. No registry credential, repository creation,
remote push, package publication, or account mutation occurred.

The remaining repository-local Stage 13 access and onboarding work is also
complete. Generated discovery now publishes a freeze-bound onboarding document
and raw HTTP is a fourth tested access path beside TypeScript, Python, and MCP.
Install → Ask → Fund → Approve → Result → Receipt is explicit: install/request/
fixture-result/fixture-receipt are locally proven, while funding remains
unavailable and real approval is not simulated. Insufficient funds, wrong
network/asset, expired quote, rejection, timeout, and unknown settlement each
map to one identical bounded recovery action in both SDKs and MCP. Timeout and
unknown settlement prohibit retry until reconciliation. The site prerenders 14
routes, including raw HTTP docs, and the updated Build/recovery experience
passes 13-route accessibility, mobile/landscape/zoom reflow, progressive WebGL,
static-HTML, console, and request-failure checks. The single consolidated local
Stage 13 check passes clients, package archives, discovery, onboarding,
prerendering, contract tests, accessibility, responsive modes, and runtime
delivery.

The owner's V6 handoff passed its 145-file checksum manifest and verifier. It is
the visual and experiential north star for art, 3D, cinematography, motion,
layout, responsive composition, and interaction quality. It is not copy or
product-state authority. Current repository contracts and evidence control all
claims, prices, providers, lifecycle labels, commands, and visible actions. The
durable precedence record is
`docs/product/CLERVO-V6-VISUAL-AUTHORITY.md`.

The production runner `sandbox.nodejs-24` is qualified at digest
`sha256:9d06e5f6bc9b20f1719effa9c8cb3defea2392e31fe3aadd25eb5833b7550a7e`.
Google Cloud Build provenance is signed at SLSA build level 3, Google Artifact
Analysis found zero vulnerabilities, a fresh ClamAV scan found zero infections,
and the SPDX SBOM is hash-bound in the approved-image registry. Normal command
completion kills descendants, and an independent process-tree monitor enforces
the limit when the runtime ignores `RLIMIT_NPROC`. All three superseded digests
are blocked. Preserve the dedicated Artifact Registry repository and immutable
history.

Stage 14 production hardening has started with the exact API container. Its
Node.js base is digest-pinned, the clean build includes every workspace
manifest and adapter source it compiles, and the runtime contains only compiled
application output, bounded server entrypoint, and the exact production
database client dependencies. Local qualification ran
the exact image as UID/GID 1000, read-only root, no-new-privileges, all Linux
capabilities dropped, bounded CPU/memory/PIDs, tmpfs-only temporary storage, and
no network. Health passed, root writes and external network access were denied,
SIGTERM exited cleanly with code 0, no OOM occurred, and paid execution remained
false. Free-search idempotency and quota now have an environment-isolated
PostgreSQL implementation with atomic claim, replay, conflict, lease recovery,
completion, quota consumption, and hashed quota subjects. Completed requests
replay across a fresh server instance, readiness checks the required tables,
and an exact production process refuses memory-only state. The HTTP runtime now
caps active executions, request/header duration, keep-alive reuse, and requests
per socket. A bounded overload drill admitted exactly two useful executions,
rejected eight excess requests with explicit retry guidance, recovered, and
replayed without duplicate execution. The new image is qualified locally at
source commit `fad4d2df54f5`. This is not production
readiness: the PostgreSQL migration still needs a live restore-backed
qualification, and registry digest, signed provenance, scans, rollback, load,
monitoring delivery, retention, and an owner-approved cloud release remain
pending.

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

1. Stage 13 is complete locally but not externally distributed. Create/connect
   the canonical GitHub repository and guide npm/PyPI trusted-publisher setup
   when the owner is available for the exact interactive steps. Continue
   independent Stage 14 production hardening in the meantime. Do not claim
   public distribution before it is observed.
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
