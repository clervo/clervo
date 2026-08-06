# Current engineering state

Updated 2026-08-04 for the full-platform revenue finish line. This is a compact
resumable handoff, not an authorization gate. Continue automatically after
reading it.

## Active finish line

`docs/product/FULL-PLATFORM-REVENUE-FINISH-LINE.md` is the active continuous
execution order. Customer-functional paid readiness is currently 58.33% under
the eight-gate rubric in `packages/catalog/full-platform-readiness.v1.json`.
This does not reduce the six-product master-plan scope.

## Exact revenue-continuation point

Search, AI, and Sandbox are the three currently public payable products. The
owner-funded 0.006 USDC Search settlement and no-charge replay remain the only
real payment proof; do not repeat that charge. Public commerce implementations
for the remaining products are committed at `f4f5759` (RPC), `af20e38`
(Prediction), and `5e2dbeb` plus `a517a12`/`a1c0118` (Crypto EVM, exact Lido
positions, and bounded Solana intelligence). They are not public yet.

Resume by making the smallest legitimate Sandbox execution dynamically priced
and affordable without weakening its maximum resource/cost ceilings. Then add
the three new product runtimes to the production launch configuration, finish
their live supply qualification, deploy them behind the protected edge, update
generated lifecycle/discovery/client truth, and run one minimum-cost real
settlement plus no-charge replay for each product that lacks proof. RPC needs a
Google Blockchain RPC Ethereum endpoint, Crypto needs a Blockscout key and a
dedicated Alchemy Solana endpoint; obtain those through hidden terminal input,
never chat. Prediction's two read-only sources are already live-qualified.
Keep the website deferred until all six products return useful paid output in
production.

## Latest production truth

Production now serves release `e23264a52c0c2a0254d19ff8062437b05ce1bad8`
on Cloud Run revision `clervo-api-production-00028-nor` at 100% origin traffic
and Cloudflare Worker version `4ee82dea-bc76-4f03-9184-35ab281233ef` at 100%
edge traffic. The signed Cloud Build image has verified provenance with zero
effective critical or high findings. Search, AI, and Sandbox remain publicly
payable through the protected edge; direct product access to the origin is
denied.

The public AI operation now selects qualified chat, embedding, image, and
speech routes. Every product kind returns both x402 and MPP challenges before
body validation. Live supplier qualification returned an exact 32-dimensional
embedding, a 13,536-byte speech result, and a 1024x1024 image result. Generated
media was stored in private R2, retrieved byte-for-byte with its hash intact,
and is exposed only through payer-scoped, signed, expiring artifact paths. R2
expires only the `tenants/` artifact prefix after seven days. The exact public
edge retrieval path passed. No AI payment has yet been signed, so this proves
production supply and delivery rather than a paid AI result.

The same release requalified live raw Search and no-execution replay, plus
private Sandbox useful execution, durable replay, and complete runtime cleanup.
The public Sandbox x402/MPP challenge remains live. No USDC was spent during
this release. Exact evidence is
`infra/production/gcp/ai-media-public-release.v1.json`.

The edge currently exposes health, generated discovery, raw and payable Search,
payable AI chat/embedding/image/speech, payable Sandbox, and signed artifact
retrieval. Unsupported RPC, Prediction, and Crypto routes remain blocked. The
one owner-funded Search settlement and no-charge replay remain the only real
payment proof; no customer revenue or demand is claimed.

## Historical implementation record

The sections below preserve important completed engineering evidence. Their
historical lifecycle wording and revision identifiers do not override the
latest production truth above.

## Active work

The V11.1 launch-experience rebuild is complete as a local release candidate.
Repository truth now generates a three-dimension launch registry (engineering
state, customer lifecycle, and commercial proof), visible claims, pricing,
status, capabilities, OpenAPI, MCP discovery, `llms.txt`, sitemap, and canonical
route metadata. The public packages are represented as published and verified;
the customer API, public payment, revenue, demand, and unavailable product cores
remain explicitly unavailable. The one 0.006 USDC owner-funded private Search
proof is presented with its no-charge replay and exact non-claims.

The experience contains 32 prerendered routes: the outcome-led homepage, first
Research path, six exact product-state pages, Install → Ask → Fund → Approve →
Result → Receipt onboarding, deterministic non-payable Proof Lab, durable proof
index, public package provenance, five contract guides, pricing, benchmarks,
security, rights, trust, status, changelog, and a dated BlockRun mechanism
comparison with volatile claims suppressed. The canonical triangular prism and
Worlds network are authored in Blender 5.2.0 LTS, preserved as `.blend`, exported
as GLBs, rendered as desktop/portrait fallbacks, hash-bound in two manifests,
and never used as product evidence. Desktop WebGL is lazy and demand-rendered;
mobile, reduced-motion, model failure, and context-loss paths retain the
deterministic poster and semantic DOM.

The consolidated local site proof passes 31 browser routes, 13 responsive/zoom
modes, direct-load hydration, navigation/history, the complete fixture journey,
static HTML, WebGL delivery/fallback behavior, 32 hashed media artifacts, 99
runtime nodes, and zero axe, console, page, or request failures. Lint covers 620
source/contract files; dependency audit, secret scan, and clean-room verification
pass. Nothing in this rebuild is publicly deployed. Physical Mac Chrome/Safari
and real-device certification, public API/domain release, and external-customer
proof remain future release work and must not be inferred from this local pass.

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

Stage 13 distribution is public and verified. The canonical public source
repository is `clervo/clervo`; `main` contains the exact clean-room history.
GitHub secret scanning, push protection, Dependabot security updates, private
vulnerability reporting, and the owner-reviewed `package-release` environment
are enabled. Clean-checkout acceptance and distribution workflows pass.
GitHub run `30858517518` published `@clervo/sdk@0.3.0`,
`@clervo/mcp@0.3.0`, and `clervo-sdk@0.2.0` from exact commit
`d299f08ae70a0a19390050583e14a512f9751172` through short-lived npm and PyPI
OIDC identities. Both npm packages expose SLSA provenance; the PyPI wheel and
source distribution expose trusted-publisher attestations bound to the same
workflow and commit. Exact registry integrities are recorded in the release
target manifest, and clean public-registry installs and imports pass. No
registry credential was stored. Publication changes no API lifecycle: the
clients still require an explicit base URL and never sign or retry a payment.

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
`CLERVO_X402_MODE=disabled`, no public traffic is enabled, no payment occurred
during Stage 14, and `ai.clervo.dev` was untouched.

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

Stage 15's one bounded real x402 proof is complete. The owner approved and
signed one replacement Base USDC authorization after the earlier expired quote
and client-side EIP-712 refusal produced no payment effects. Private revision
`clervo-api-production-00010-pid` delivered one useful `search.web` result for
6,000 atomic USDC. Operation `op_66c6996482f2cc4d727d5099aff2ba36`
completed with receipt `rcpt_80259fefed025ebefa08049f62b0e3af` and one
confirmed Base transfer. Payer and receiver balance deltas were exactly -6,000
and +6,000 atomic units. Replaying the same idempotency key returned the same
operation and receipt without another authorization, execution, settlement, or
charge.

The managed production database contains exactly one completed operation row
and one balanced receiver-accounting entry for the proof. The complete
receiver journal chain verified, the receipt and settlement hashes match the
chain transaction, and a temporary read-only reconciliation job was removed.
Both temporary private proof tags and the loopback proxy were also removed;
serving traffic stayed on the existing private bootstrap revision and no public
invoker was added. This owner-funded 0.006 USDC result proves payment plumbing,
not customer revenue or demand. A new payment requires fresh explicit approval.

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
was authorized, and 0 USDC was spent during implementation preparation. The
subsequent bounded production proof described above is the only settled real
payment.

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
create roles. The primary service remains ClusterIP-only and is also reachable
through a source-restricted regional internal load balancer at `10.128.40.250`.
Authentication uses a dedicated runtime secret; there is no public route or
payment path.

The live control smoke passed useful gVisor execution, authenticated replay
without re-execution, and foreground cleanup with zero charge. Its replay cache
is intentionally process-local, so it is not yet a customer-facing durability
claim. The undersized `e2-small` default pool remains quiesced. Dedicated
one-vCPU N1 and T2D capacity was unavailable across all four `us-central1`
zones; every failed pool and disposable probe was verified empty and removed.
A bounded no-public-IP probe then qualified `e2-medium` capacity in
`us-central1-a` and was removed before the final pool was created.

The dedicated `sandbox-system` pool is now running one `e2-medium` node with
roughly 2.7 GiB allocatable memory, auto-repair, auto-upgrade, Shielded VM
controls, and no autoscaling. The controller is ready on that trusted system
node with its exact requests/limits and a one-replica disruption budget; it is
not scheduled on the isolated gVisor execution pool. Private connectivity,
least-privilege RBAC, authenticated useful execution, no-execution replay, and
resource cleanup all passed again. No claims, templates, execution pods, or
capacity probes remained. The project-wide CPU quota is fully allocated at
12/12, so this proves bounded private single-node capacity, not high
availability or spare scale-out headroom. No public capability depends on this
private plane.

The production API has a default-disabled private Sandbox route, an exact
private-target client with redirect/SSRF refusal, separate API and control
authentication, and a PostgreSQL operation ledger that stores only a tenant
hash. One operation is bound to one request; completed results replay across
processes, while a lost or expired execution becomes permanently
`execution_unknown` and is never automatically re-executed. Disposable
PostgreSQL qualification applied all six migrations and proved Sandbox state
across process restart, custom-format backup, and isolated restore. All
containers, volumes, and the temporary archive were removed.

Private production connectivity is qualified. A dedicated Direct VPC egress
subnet (`10.128.41.0/26`) is the only application source admitted by the GKE
internal load balancer and controller NetworkPolicy, alongside Google health
checks. A disposable Cloud Run job reached the controller health endpoint with
HTTP 200 in 127 ms through that exact path, then was deleted. Global access,
public invoker access, production traffic, payment, and the protected model
gateway were unchanged. The Sandbox control and API token secrets each have
one enabled version, and the production runtime has resource-level accessor
permission without any secret value being read or printed.

Managed migration 0006 is now applied. A one-shot distroless Cloud Run
migrator received database credential version 2 directly from Secret Manager,
checksum-verified migrations 0001 through 0005, applied only
`0006-sandbox-operation-state.sql`, and was deleted. No credential value
entered the VM or logs and no customer row was read.

Cloud Build `db68d6ff-8abc-4aef-9abf-de4f2f068689` accepted runtime commit
`92dc26cdbedfadc614d4246a9c6b30cc0e72f5f1` and produced immutable image
`sha256:e5514004a5b6c1235ebfa9f9344ce0b9f64d6ab6de4da8c8850e8ffeb6d88248`.
Its SLSA level 3 provenance and OS, NPM, and secret analysis completed with zero
effective critical and zero effective high findings. Private revision
`clervo-api-production-00007-jal` is ready at zero traffic with Direct VPC
egress, durable Postgres state, `CLERVO_SANDBOX_MODE=private`, and payment
disabled. Authenticated live execution produced `sandbox-api-live` at zero
charge, a second exact call replayed without re-execution, and no Sandbox claim
or execution pod remained. The smoke job and its temporary self-invoker grant
were removed; the existing private serving revision remains at 100% traffic.

## Next actions

1. Connect terms-compatible production RPC supply and publish its read-only
   payable operations through the shared durable commerce gateway.
2. Connect commercially permitted Prediction data and retained history, then
   publish its normalized payable intelligence operations.
3. Connect commercially permitted EVM, Solana, wallet, and protocol data, then
   publish read-only payable Crypto Intelligence operations.
4. Keep customer routing disabled for any RPC, Prediction, or Crypto source
   until its commercial supply, reuse, and data rights
   are qualified; source lawful replacements without pausing other work.
5. Create a new versioned full-platform release candidate rather than mutating
   the historical private freeze. Expand and republish the SDKs, MCP, Python,
   raw HTTP, OpenAPI, and discovery from its exact six-product operation set.
6. Run one consolidated full-platform production acceptance, then execute one
   minimum-cost owner-signed useful payment and no-charge replay for each of the
   six products. Do not repeat the completed Search proof unnecessarily.

## Preserved boundaries

The supply-foundation program is complete. Stage 15 is complete with exactly
one owner-funded 0.006 USDC settlement and a proven no-charge replay; it is not
revenue or demand evidence. The external RPC resale-permission
blocker remains isolated. `ai.clervo.dev` is live on protected Clervo VM
infrastructure and must never be included in sandbox/cloud cleanup. Migration
0006 remains the only managed schema mutation in this work. Search, AI,
Sandbox, and signed artifact delivery are enabled through the protected API
edge; RPC, Prediction, and Crypto remain blocked. No external customer payment,
revenue evidence, customer-data operation, or additional managed schema
mutation occurred. `ai.clervo.dev` was untouched.
