# Current engineering state

Updated 2026-08-03 after persistent private Sandbox control qualification. This is a compact
resumable handoff, not an authorization gate. Continue automatically after
reading it.

## Active work

Stage 7 secure sandbox product core, persistent private execution plane, and
authenticated private control service are complete. The contracts, lifecycle,
cleanup, artifact quarantine, cost controls, verified-image registry, runner,
official Kubernetes client transport, Agent Sandbox adapter, and red-team gate
are implemented. The private controller produced useful output, replayed the
same operation without another execution, charged zero, and left no runtime
resources. Durable cross-instance API state and a separately authenticated
private product route are implemented and qualified locally but remain disabled
in production. Public lifecycle remains `unavailable` until migration 0006 is
applied to the managed database, private API-to-control connectivity is live,
and production capacity is qualified.

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
access, onboarding, and package preparation are complete locally as described
below.

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
`sha256:743a17e4776809782f511badb7f11a60992544ccf2e61ad901353387dffe8b38`.
Google Cloud Build provenance is signed at SLSA build level 3, Google Artifact
Analysis completed OS, NPM, and secret analysis with zero effective critical or
high findings, a fresh offline ClamAV scan found zero infections across 622
files, and the 22-package SPDX SBOM is hash-bound in the approved-image
registry. A native traced process supervisor plus the kubelet PID ceiling
enforce bounded descendants and cleanup. All four superseded digests are
blocked. Preserve the dedicated Artifact Registry repository and immutable
history.

Stage 14 local production hardening is complete for release candidate
`clervo-private-core-2026-08-02.2`. Its exact API container, refreshed
supply-chain scan and SBOM, 1,000-request burst plus steady-load proof, and
disposable PostgreSQL/queue/accounting recovery proof are bound to the current
price and interface contracts. The consolidated Stage 14 acceptance command
passes 37/37 contract tests, release-candidate drift, dependency audit, lint,
secret scanning, and the clean-room boundary. Cloud Build invokes this same
consolidated command so local and remote acceptance cannot drift.

The exact API container's Node.js base is digest-pinned, the clean build includes every workspace
manifest and adapter source it compiles, and the runtime contains only compiled
application output, bounded server entrypoint, and the exact production
database client dependencies. Local qualification ran
the exact image as UID/GID 65532, read-only root, no-new-privileges, all Linux
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
replayed without duplicate execution. State retention is now bounded to 24
hours for completed free-search envelopes, one hour beyond expired execution
leases, and two hours for hashed quota subjects. Planning is count-only;
deletion requires an exact untracked confirmation and production deletion
still requires owner approval. No production/customer database deletion was
performed. The current image is qualified locally at source commit
`3cd28ad6eca7`. Its build remains on the exact Node 24.18.1 image, while the
runtime is now the exact non-root Node 24 distroless image and contains no
shell or package manager. A digest-pinned Trivy 0.72.0 scanner downloaded its
database before entering the offline scan boundary and never received the
Docker socket. The exact saved candidate image passed with zero critical, zero
high, five medium, and seven low findings; the production npm audit found zero
vulnerabilities; and a 94-package SPDX 2.3 SBOM is hash-bound to the image.
The saved archive and scanner cache were removed. This is not production
readiness.

Monitoring delivery now has a bounded HTTPS exporter with a 256 KiB payload
ceiling, five-second timeout, redirect denial, deterministic delivery
idempotency, and optional runtime-only authorization. Production startup
requires Sentry. The live Sentry project accepted one bounded synthetic alert
for the deployed release; no query, request hash, wallet, credential,
authorization material, or default PII was included. The incident runbook
covers execution failure, readiness, overload, unknown settlement, delivery
failure, kill switch, and rollback.

The bounded load qualification also passes. A synchronized 1,000-request burst
admitted exactly the 16 configured execution slots, rejected the other 984
with the explicit overload contract inside the two-second p95 gate, then
replayed all admitted requests without another execution. A subsequent 256
requests at client concurrency eight all succeeded with roughly 10 ms p95 in
the recorded local harness. Active work never exceeded 16, useful traffic
recovered immediately, and combined client/server RSS growth stayed below the
192 MiB harness ceiling. No provider, cloud, or payment call occurred.

An independent traffic control now stops new free and paid execution before
body processing while leaving liveness available and readiness unavailable.
Restoration requires an explicit successful probe; a stopped local service
executed nothing, rejected work with retry guidance, refused an unproven
restore, then returned useful traffic after the bounded probe. The rollback
policy requires a preceding verified immutable registry digest and fails closed
when none exists. The private Cloud Run drill routed traffic to the verified
candidate, observed database readiness, then restored the preceding verified
bootstrap revision. The candidate is back at zero traffic.

The exact digest-pinned PostgreSQL 18.4 image now passes a disposable live
recovery qualification. All six migrations applied; atomic claim, completion,
replay, conflict, and quota behavior passed; completed state survived a
database process restart; a custom-format backup restored into a separate clean
database; restored replay matched; and expired retention was applied against
qualification-only rows. Both containers, both volumes, and the temporary
archive were then verified absent. The same qualification now proves the
pg-boss 12.26.3 recovery contract: duplicate job identity was rejected, an
active job abandoned by its first worker expired and was recovered exactly once
by a fresh queue process, the retry completed, a terminal failure reached its
dead-letter queue, and both completed/dead-letter state survived backup and
isolated restore. Managed recovery is now also proven: a post-migration
on-demand Cloud SQL backup restored into the isolated
`clervo-stage14-recovery-20260803` instance, all five migrations and the real
durable authenticated-smoke receipt were verified, and the required search,
accounting, and x402 tables were present. The recovery instance was then
deleted and verified absent while the retained backup and deletion-protected
production instance remained intact.
The fifth migration adds durable x402 states for challenge, execution,
settlement, quarantine, completion, and replay. One payment fingerprint cannot
bind to two operations; completed state survived restart and isolated restore;
expired or interrupted execution and settlement fail closed instead of
re-executing or creating another authorization.
Stage 14 Google Cloud production qualification is complete. The dedicated
runtime identity has Cloud SQL Client plus accessor permission on only the
database, Sentry, and three Stage 15 challenge-only x402 secrets. The dedicated
builder has only log writing, source-bucket reading, and write access to the
Clervo artifact repository.
Cloud Build `45301f8c-60b9-4935-be82-e9285821d8cb` accepted exact source commit
`cf7110271c81b337ce14943d2f570d85196b305f` and produced immutable digest
`sha256:68d1ba96e04ac0c48c9a98f374470be67bc7f8994e90ab75a78b591de4662ba4`.
Observed provenance is SLSA level 3; Artifact Analysis completed OS, NPM, and
secret analysis with zero effective critical and zero effective high findings.

All five migrations are applied to the managed database and rerun cleanly by
checksum. Database credential version 1 was rotated after a migration-parser
error could include its input in an exception; version 2 is active and version
1 is disabled. No service used version 1. The parser now normalizes Cloud SQL
socket URLs and replaces invalid input with a credential-free error. Sentry
secret version 1 is pinned. Production is a private authenticated Cloud Run
service with no public invoker binding. Revision
`clervo-api-production-00001-yaf` serves the private service; verified candidate
`clervo-api-production-00002-seh` is tagged at zero traffic. Authenticated
health, Postgres readiness, useful search, durable receipt replay, Sentry
delivery, managed restore, kill switch, promotion, and rollback all passed.
`CLERVO_X402_MODE=disabled`, no public traffic is enabled, no payment occurred,
and `ai.clervo.dev` was untouched.

Stage 15 has completed its no-payment production preflight. Three version-pinned
runtime secrets hold the facilitator identity, facilitator signing key, and
public receiver address; the runtime identity can access only those plus the
database and Sentry secrets. Private revision
`clervo-api-production-00005-ruv` is ready at zero traffic in `challenge_only`
mode. Its real facilitator-backed `search.web` request returned one exact Base
USDC requirement for 6,000 atomic units, bound to the production resource,
receiver, quote, operation, and request. Repeating the request returned the same
challenge. A supplied dummy payment header failed with
`x402_settlement_disabled` before verification. No payer signer was read, no
authorization or settlement occurred, and 0 USDC was spent.

The one real bounded x402 proof still requires the separate exact payment
approval and wallet authorization defined by the x402 safety workflow.
Independent provider-route and public-distribution work continues without
waiting for that payment boundary.

Receiver accounting is now a separate append-only, hash-linked journal rather
than an inference from customer receipts. Each settlement and operation can be
recorded once; an exact replay returns the existing entry, while settlement
conflicts and a second charge for one operation fail closed. Customer charge
and supplier cost remain separate balanced postings by exact asset and
decimals, and reconciliation verifies the full chain and totals. The PostgreSQL
migration enforces unique settlement, operation, and receipt identities,
hash-bound JSON, four balanced-contract postings, and rejects sensitive wallet,
key, secret, credential, and authorization fields. This is local mock-accounting
proof only; no real receiver, wallet, settlement, or production database was
used.

Stage 15 implementation preparation now includes the official x402 v2 EVM
resource server, path-bound short-lived CDP facilitator authentication, Base
mainnet and exact-token validation, quote-bound public challenges, standard
`PAYMENT-SIGNATURE` and `PAYMENT-RESPONSE` handling, durable cross-instance
idempotency, one execution and settlement claim, atomic receiver accounting,
paid receipts, and no-charge replay. Focused tests prove a useful cited result,
single settlement, replay without another verification/execution/settlement,
and permanent quarantine after unknown execution or settlement. The Stage 14
Cloud Run policy explicitly forces `CLERVO_X402_MODE=disabled`, so the private
deployment candidate cannot accept a payment. No signer was read, no payment
was authorized, and 0 USDC was spent; a real proof still requires the separate
exact owner approval required by the x402 safety workflow.

## Live qualification result

GKE Calico failed closed because metadata remained reachable, including through
the managed Agent Sandbox air-gap. The retained production plane is a private
GKE 1.36.2 cluster in `us-central1-a` with Dataplane V2, private nodes and
endpoint, Workload Identity, Agent Sandbox, one isolated gVisor execution pool,
and a kubelet ceiling of 1,024 PIDs per pod. The exact final runner passed all
ten live containment probes: gVisor isolation, process, disk, output, and time
limits, metadata/internal/external network denial, secret absence, host denial,
descendant cleanup, and namespace cleanup. A native shell fork storm was denied
at 14 observed processes under the 32-process request ceiling and left no
sleeping descendants. The failed capacity attempt in `us-central1-c` was
deleted and only the healthy production cluster remains. No token value was
logged or retained. Current evidence is in
`docs/evidence/sandbox/runner-supply-chain.v5.json` and
`docs/evidence/sandbox/gvisor-production-red-team.v1.json`.

The private Sandbox controller runs in `clervo-sandbox-system` with an exact
distroless non-root image at digest
`sha256:913b3127dd85d05ed3ee76d032ca3c72b475b1d7325aa773311b7221f5591df5`.
Cloud Build `8a928ad1-ced4-47b4-b526-b5e9190aa233` passed the controller contracts;
SLSA level 3 provenance, Artifact Analysis, a 33-package SPDX SBOM, and an
offline ClamAV scan of 27,642 files all passed with zero high/critical findings
or infections. Namespace-scoped RBAC permits only Agent Sandbox lifecycle,
pod observation/exec, and NetworkPolicy observation. It cannot read execution
secrets, create/delete pods directly, inspect nodes, mutate namespaces, or
create roles. The service is ClusterIP-only, authenticated by a dedicated
runtime secret, and has no public route or payment path.

The live control smoke passed useful gVisor execution, authenticated replay
without re-execution, and foreground cleanup with zero charge. Its replay cache
is intentionally process-local, so it is not yet a customer-facing durability
claim. The system pool was recovered as one `e2-small` node after the project
CPU quota rejected a larger replacement; managed Prometheus collection was
disabled while GKE system metrics remain enabled. Kubernetes requests consume
96% of allocatable system-node memory and the controller used 83 MiB live.
This is adequate for the bounded private qualification but not approved public
capacity. Do not move control workloads onto the untrusted execution pool.

The production API candidate now has a default-disabled private Sandbox route,
an exact private-target client with redirect/SSRF refusal, separate API and
control authentication, and a PostgreSQL operation ledger that stores only a
tenant hash. One operation is bound to one request; completed results replay
across processes, while a lost or expired execution becomes permanently
`execution_unknown` and is never automatically re-executed. Disposable
PostgreSQL qualification applied all six migrations and proved Sandbox state
across process restart, custom-format backup, and isolated restore. All
containers, volumes, and the temporary archive were removed. Migration 0006 is
not yet applied to the managed production database, and `CLERVO_SANDBOX_MODE`
remains disabled in the deployed Cloud Run revisions.

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
5. Keep Sandbox public lifecycle `unavailable` while applying the already
   qualified migration 0006, wiring the default-disabled private API route to
   the controller, and providing a production-capacity system plane. The
   private controller, execution plane, and local durable API path are
   qualified; current system-node headroom is not a public capacity proof.

## Preserved boundaries

The supply-foundation program is complete. The external RPC resale-permission
blocker remains isolated. `ai.clervo.dev` is live on protected Clervo VM
infrastructure and must never be included in sandbox/cloud cleanup. No real
payment, wallet signing, production mutation, or customer-data operation has
been performed in this work.
