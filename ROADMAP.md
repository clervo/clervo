# Clervo Roadmap — current state to commercial launch

**This file is the single planning authority for this repository.** It is
self-contained. A session that has read only `CLAUDE.md`, this file, the
repository, and `packages/catalog/live-registry.json` has everything it needs.
No previous chat, hidden memory, external handoff, or document under `docs/`
is required, and none of them overrides this file.

Where this file and observed live behaviour disagree, **live behaviour wins and
this file is corrected.**

---

## Continuity block

Update only when execution state actually changes. This is not a journal.

| Field | Value |
|---|---|
| Current milestone | **B7 — INTEGRATION-READY. The next milestone remains B7 live cutover, not B8.** |
| Milestone status | `b7_integration_ready_dynamic_qualified_supply_external_cutover_pending`. **PROVEN ENGINEERING-COMPLETE / FIXTURE-BOUND:** authenticated qualified-supply source, revision and freshness guards, stable provider-independent customer identity, equivalent-supply fallback, dynamic composition, qualification/availability lifecycle, owner-controlled commercial publication, data-driven pricing, competitor evidence input, bounded strategic overrides, zero-cost free-tier quota controls, private/public projection, discovery, and one generic `ai.clervo.dev` execution adapter. Snapshot A → B adds a normal model with no application-source edit, preserves existing IDs, updates price/lifecycle/discovery, and executes through the private runtime binding. **PROVEN legacy LIVE observation, not dynamic cutover proof:** the public endpoint returned 21 legacy entries (18 live, 3 paused) when observed on 2026-08-09; its registry evidence remains dated 2026-08-06. **EXTERNALLY BLOCKED:** the authenticated production catalog endpoint/schema is not frozen or available in this worktree, `/opt/clervo-ai` and deployment are prohibited here, and per-supply commercial permission needs owner decisions. Therefore B7 is not `CLOSED` under Rule 3 and no dynamic production cutover is claimed. B6 remains closed on owner instruction with npm publication/provenance and one funded paid proof outstanding. |
| Current branch | `work/b7-resume-20260809`; interrupted state preserved first at `ba9d0bb`, dynamic B7 engineering at `f695850`. `main`, the frozen B12 visual branch, and `/opt/clervo-ai` were not modified. |
| Latest commit | `f695850` — `feat(b7): compose dynamic qualified AI supply`. This is the latest engineering commit before this ROADMAP truth update; use `git log -1` for the truth-update commit itself. |
| Current production release | Cloud Run origin `clervo-api-production-00033-vub` at 100% traffic, image `sha256:7bb3211061e8cbca5abfa2f1930f7888877aaaed065fd2f54c8905aedf5422ad`, `CLERVO_RELEASE_ID=777b7c616e3e384c9a4b2b7112cef74521b7f7a5`; API edge worker `clervo-api-edge-production` version **`74efc7db-d0a7-49a1-8d4e-9f20e049fb0e`** (redeployed 2026-08-07T06:52Z for the B6 `llms.txt` install section — generated documents only, no runtime code); site worker `clervo-site-production` version **`d9ebbe9d-2f7d-4ab8-9d23-c79928f359b2`** (deployed 2026-08-07T08:0xZ in B7 to publish the refreshed discovery documents). Cloud Run and the API edge worker were **not** redeployed in B7: the catalog and registry are read by the deployed origin, `api.clervo.dev/v1/models` already served 18 live / 3 supply-paused before the site deploy, and no runtime code changed. **The site deploy did also ship the four previously-unshipped site commits including `bb473ed` (layout)**, because they were already built into `dist` and the site worker had been held back since 2026-08-06; no visual file was edited in B7. One substantive public change went out with it: the `llms.txt` "Command line" section, which told readers to run `npx @clervo/router`, is now **suppressed** until the package is actually published — the generator checks the npm registry, so a reader is never handed an install command that fails. |
| Rollback targets | Cloud Run revision `clervo-api-production-00031-kos` (image `sha256:63ad8aaa619f46fac962f9366c26eb13c7c241dc8e3d21c773ede4f43f62f44f`, the pre-B4 origin) — roll back with `gcloud run services update-traffic clervo-api-production --project bloxsniper-prod --region us-central1 --to-revisions clervo-api-production-00031-kos=100`. The older `clervo-api-production-00028-nor` (image `sha256:78718e50a50c2a74f639a4da5a03e80988d95611014d9c310cba1fe4d5d79df9`) remains available behind it. API edge `6e17ea78-32eb-4b87-8781-72aa37f90321` (the pre-B3 edge); site `4939f9da-765d-4f3c-a96f-6f0384fe8338`. Roll a worker back with `npx wrangler rollback <version> --config apps/worker/wrangler.jsonc` or `apps/site/wrangler.jsonc`. |
| Latest externally verified customer outcome | A settled x402 payment on `https://api.clervo.dev/v1/search/paid`: 0.006 USDC (6000 atomic) on Base mainnet `eip155:8453` to `0xBd11d82d8Dbd01Ba3eed279d3bACf74659fFca28`, operation `op_0549a567589cc87d31231376f9986602`, receipt `rcpt_582a23e6f1e066fe25984119c59c2ab0`, returning a real search result. Replaying idempotency key `idem_b4_bazaar_entry_search_01` returned the same operation with no second authorization and no second charge; the on-chain USDC delta is exactly one transfer of 6000 atomic units. `search.web` reaches `paid_outcome_verified`. The free path outcome above still holds at `externally_repeated`. |
| Current blockers | **B7 EXTERNALLY BLOCKED only:** authenticated `ai.clervo.dev` qualified-catalog endpoint and frozen schema; production catalog token/binding; owner commercial-permission decisions for immutable supply IDs; production migration/deploy/live proof. The three legacy gateway qualifications are now expired and the other 18 expire 2026-08-14; the legacy expiry failure is truthful and is not dynamic supply authority. B6 residues remain a valid npm publish/provenance path and USDC for one paid Router proof. |
| External dependencies | B7: authoritative `ai.clervo.dev` catalog endpoint, production binding/deploy, owner commercial permission and any subsidy/free-tier activation decision. B6: npm publication authority/provenance and funded proof wallet. Later milestones retain their own terms/supply dependencies. |
| Owner approvals waiting | All three B6 approvals were granted 2026-08-07. **Production deploy: spent** (edge worker `74efc7db-d0a7-49a1-8d4e-9f20e049fb0e`, generated files only, verified live, no regression, no rollback needed). **Two could not be executed and need an owner action, not another approval:** (1) **npm publish of `@clervo/router` 0.1.0** — needs a valid `@clervo`-scoped write token, and a choice between publishing from CI with provenance intact or dropping `provenance: true`; the tarball is ready (35 files, 40.4 kB, shasum `852dd6105c29debf52459d45cff2bcec6df4ff94`). Until it lands, install-from-npm is unverified. (2) **One real paid operation** — send a small amount of USDC on Base mainnet to `0x6B10DDcD5AB0e00a87d02C7F11188F55474bB1Ef`, then `clervo run search.web "<query>" --key <key>`; the machine already enforces per-operation 0.007 and daily 0.01 USDC. Separately, a Bazaar keepalive settlement inside 30 days of `2026-08-06` will need approval again, as will any further Bazaar listing requiring its own settlement. |
| Dates that move on their own | **PROVEN:** the three legacy gateway qualifications reached expiry on 2026-08-09; the other 18 reach expiry 2026-08-14. The dynamic composer fails closed on snapshot, qualification, cost, competitor-evidence, policy, and permission expiry. **30 days after any Bazaar listing:** a resource with no settlement in that window is dropped from the CDP catalog. |
| B1 metrics baseline (observed 2026-08-06T11:40:50.003Z) | Live products 3 of 6; live AI routes 18 of 21; supply-paused AI routes 3; AI routes quoting below the Bazaar 1000-atomic minimum 18; conformance defects open 2 (`api.search_free_accepts_naive_request`, `site.not_found_is_404`). |
| B2 metrics (observed 2026-08-06T14:42:37.447Z) | Conformance defects open 0. Naive free-search rejection rate 0: `withoutIdempotencyKeyStatus` 200. Site 404 correctness: a nonexistent URL returns 404. |
| B3 metrics (observed 2026-08-06T15:14:21.853Z) | Discovery surfaces live 5 of 5, including `api.models`, `api.well_known_x402`, and `api.llms_txt` at status 200. Model list entries 21 (18 sellable, 3 supply-paused with a reason). x402 manifest payable resources 3, free resources 1. |
| B4 metrics (observed 2026-08-06T17:01:41.422Z) | Bazaar-valid resources 3 of 3. Indexed resources 1 of 3: `https://api.clervo.dev/v1/search/paid`, `index.active: true`, last crawled `2026-08-06T16:59:46.261Z`. Settlements executed 1, total 0.006 USDC. AI routes quoting below the 1000-atomic minimum 0 — the floor is applied as a minimum billable charge above the derived price, so no route is sold below cost. Days until the search listing idles out: 30 from `2026-08-06`. |
| B5 metrics (observed 2026-08-07T05:22:00Z) | Products routing through one commerce core 6 of 6 (already true before this milestone). Duplicated commerce-surface copies removed: result verifiers 2 to 1, response-envelope builders 4 to 1, request-hash builders 4 to 1, fixed-price lookups 2 to 1, provenance builders 4 to 1. Duplicate-charge incidents 0. Payment-path defect count 0. Commerce suite 18 of 18 before and after each product move; full acceptance 262 of 262, unchanged. |
| B7 metrics (observed 2026-08-09, current engineering tree) | **PROVEN:** full acceptance 293/293; final B7-focused suite 34/34; dynamic property suite 14/14; contract validation 97 schemas/132 fixtures; lint 699 files; secret scan PASS; external calls 0 and USDC spent 0 during acceptance. Dynamic catalog has no fixed count and the legacy catalog ceiling was removed. BlockRun's direct public model API returned 91 entries; three exact GPT-5.6 comparisons were observed and recorded as refreshable data: Luna 0.2/1.2, Terra 2/12, Sol 5/30 USD per million input/output. **UNVERIFIED after evidence expiry:** those competitor values are ignored after their recorded validity window. **LIVE legacy observation only:** 21 entries, 18 live/3 paused; no dynamic live cutover claim. |
| B6 metrics (observed 2026-08-07T06:53:00Z, at close) | Installs 2, **both from the local tarball, 0 from npm** (unpublished). Wallets created 2 — one throwaway, deleted after confirming on-chain it held nothing; one dedicated test wallet retained at `0x6B10DDcD5AB0e00a87d02C7F11188F55474bB1Ef`, `0700`/`0600`, recovery phrase never printed to any transcript, log, or commit. **Free first success: yes, and it happened before any wallet existed**, which is the ordering advantage over BlockRun. Wallets funded 0. Paid outcomes 0. Settlements 0. **USDC spent 0.** Fail-closed cycle exercised live: 1 refused operation, 1 retry blocked before signing, 1 reconciliation resolving `not_settled`. Buyer-side ceiling configured: per-operation 0.007, daily 0.01 USDC. Live catalog: 4 capabilities, 1 free, 3 payable; `search.web` quoted 0.006 USDC to `0xBd11d82d8Dbd01Ba3eed279d3bACf74659fFca28`. Package: 35 files, 40.4 kB packed, 17 installed dependencies, no TypeScript sources or wallet material. Tests: B6 suite 10 of 10; `shared-paid-operation` 5 of 5 unchanged; full contract suite 720 of 722, the 2 failures being `n13.3` and `n13.5` site tests that fail identically with all B6 work stashed and are therefore inherited from B5. Gates: lint PASS (677 files), secret scan PASS with 0 secret values printed. |
| Exact next task | **Finish B7 live integration:** freeze and expose the authenticated qualified-supply contract from `ai.clervo.dev`; bind its immutable IDs to compatibility customer IDs; record owner commercial permission decisions; configure `CLERVO_AI_RUNTIME_MODE=qualified_catalog`, catalog URL/token, migration, and generated public model artifact; deploy under explicit approval; then prove every dynamically listed sellable route from outside. Do not open B8 until that proof passes. |
| Files and services for that task | Permanent B7: `qualified-ai-supply.ts`, `catalog-source.ts`, `product-catalog.ts`, `product-runtime.ts`, `free-tier.ts`, `clervo-ai-gateway.ts`, `ai-dynamic-production-runtime.mjs`, `compose-qualified-ai-catalog.mjs`, dynamic policy/identity/evidence JSON, and `b7-dynamic-ai.test.mjs`. `requalify-ai-routes.mjs`, the per-provider adapters, and merge scripts are explicitly legacy/recovery-only and are not the permanent supply authority. Live external authority remains `ai.clervo.dev`; no `/opt/clervo-ai` change was made. |

---

## 1. What Clervo is

Clervo is one commercial platform selling **verified machine work**, paid per
call over x402 on Base, across six product families:

| # | Family | Public route | What is sold |
|---|---|---|---|
| 1 | Search | `/v1/search/free`, `/v1/search/paid` | Cited web results with authority and freshness scoring |
| 2 | AI | `/v1/ai/execute` | Chat, embedding, image, and speech across many suppliers, one contract |
| 3 | Secure Sandbox | `/v1/sandbox/execute` | Isolated code execution on runtime we operate |
| 4 | Multi-chain RPC | `/v1/rpc/execute` | Chain reads across networks |
| 5 | Prediction | `/v1/prediction/execute` | Derived comparison across prediction markets |
| 6 | Crypto Intelligence | `/v1/crypto/execute` | Derived on-chain analysis and reports |

The differentiator is not access. Competitors sell access. Clervo sells
**provability**: every result carries evidence, provenance, the exact route and
model identity used, the true cost, a replay-safe receipt, and a retry that
never double-charges. That is the thing a pure aggregator structurally cannot
return.

**Final completion of this roadmap requires all six families externally
usable.** A family is not finished when it is in the catalog, on the website,
returning a quote, internally tested, implemented but disabled, blocked by
supplier terms, or honestly labelled unavailable. Temporary blocked states are
allowed while work is in flight. They are not an acceptable end state.

### Definition of a finished product

An unrelated external customer, with no relationship to us, can:

1. discover it;
2. understand its operation, limits, availability, and price before paying;
3. execute a real, useful operation;
4. pay safely where payment is required;
5. receive evidence and provenance bound to the result;
6. receive an accurate receipt;
7. retry without duplicate charging;
8. recover from a failure;
9. repeat the operation successfully.

All nine, from outside, on a public HTTPS URL.

---

## 2. Lifecycle state and proof level are different things

Conflating these is what previously let a quote be mistaken for a working
product. They are recorded separately in the live registry and must be rendered
separately on every public surface.

### Lifecycle state — exactly three values

| State | Meaning | In catalog | Sellable |
|---|---|---|---|
| `live` | Probed, publicly reachable, answers correctly | yes | yes |
| `supply_paused` | Qualified and owned, temporarily unfunded, rate-limited, or upstream-failing. Carries a reason and an expected return date | yes, shown with reason | no |
| `unavailable` | Not built, not qualified, or no longer exists | no | no |

**A failed probe yields `supply_paused`, never removal.** Removing a route
because a probe failed erases supply we own. Three gateway routes are unfunded
right now and must survive every probe until 2026-08-09.

### Proof level — what has actually been demonstrated

| Level | Meaning |
|---|---|
| `none` | Nothing demonstrated |
| `quote_observed_unpaid` | The endpoint is publicly offered, a price was returned, and a valid payment challenge was formed. **Nothing else.** Not settlement, not provider execution, not a useful result, not usage accounting, not receipt accuracy, not replay sameness, not retry safety, not reconciliation |
| `paid_outcome_verified` | We paid once. A real, useful result came back. The receipt was accurate, the replay returned the same operation, and the retry did not double-charge |
| `externally_repeated` | An unrelated party did it, more than once |

**A `live` route at proof level `quote_observed_unpaid` may never be publicly
described as a verified paid product.** Public copy renders the proof level, not
just the state.

### Conformance defects are neither

A surface that is served but behaves wrongly — a soft-404, a free endpoint that
rejects a naive caller — is a defect on a working surface. It is recorded in the
registry's `conformance[]` array and deliberately does not use the three-state
vocabulary.

---

## 3. Rules

These exist because previous attempts failed for reasons we can name.

### Rule 1 — Code and live behaviour are the only truth

No document asserts product status. Status is observed by probing the deployed
system and generated into one machine-readable registry. Everything public
renders from that registry. **A hand-written status line is a bug.**

### Rule 2 — Never pin a status value in a test

Four tests once asserted pre-launch status as an ongoing gate. The moment status
improved, honesty broke the build, so the repository stayed frozen and lying for
weeks. Assert invariants. Compare against the registry. Never assert that a
product is unavailable, that payment is off, or that a public file contains a
literal status sentence.

### Rule 3 — A step is done when it is proven from outside

Not when tests pass. Not when a local script prints OK. **Done means a public
HTTPS URL, reachable from a machine that has never heard of us, returning a real
result.**

Only we ever spend money to verify a step. A prospective customer must be able
to confirm the product works before creating or funding a wallet.

**"Free to demonstrate" has a strict definition. It is not a giveaway.**

- Free demo paths route **only** to supply that costs us nothing: provider free
  tiers, trial allowances, idle owned capacity. Never to paid supply.
- Free tier is subject to a hard per-wallet cap and a hard global daily cap.
  There is no automatic paid overage. At the cap the request is refused, never
  silently billed to us. Declared in `ai-free-tier-pricing.v1.json` under
  `rateGuard`.
- Where a free execution would cost us real money, **there is no free
  execution.** The public proof is a quote and a dry run: exact price, limits,
  runtime identity, and response shape, without consuming compute.

| Product | Public proof path | Our cost |
|---|---|---|
| Search | `/v1/search/free`, already live | $0, already capped |
| AI chat | free tier on zero-cost supplier routes | $0, provider free tier |
| Sandbox | quote and dry run only, no free execution | $0, no compute consumed |
| RPC, Prediction, Crypto | none until rights are resolved per milestone | $0 |

### Rule 4 — Suppliers are data, never code

Every product implements one capability contract:
`discover, quote, authorize, execute, receipt, replay, reconcile, status`.

Suppliers are rows in a registry: cost, quality, terms status, limits, health,
region. The router picks at runtime by policy. Adding, removing, or replacing a
supplier is a registry edit — no code change, no redeploy, no migration. This is
what stops us creating legacy: nothing is ever wired in, so nothing ever has to
be torn out.

### Rule 5 — Poor mode until 100 wallets

Phase A supply is free tiers, trial allowances, and owned infrastructure only.
Owner cash target for supply: **$0**, excluding the named exceptions each
milestone declares. Phase B begins at 100 connected wallets, when real usage
numbers become negotiating material for paid contracts.

Never sell below cost to appear cheap. Free tier is acquisition spend from a
single named, capped pool.

### Rule 6 — Research is targeted, per decision, never a phase

Each milestone names the one market question that changes what gets built.
Answer that question, inspect what Clervo already has, choose the stronger
option, build, prove externally, measure, continue. **Do not run a large
competitor-research phase before implementation.**

### Rule 7 — Visibility ships with the product

When a product becomes usable, the same milestone exposes its registry state,
catalog entry, price, status, product page, quick start, curl example, and
machine-readable discovery. **A hidden working product is not commercially
launched.** Equally, no discovery surface may claim more than the runtime and
the proof level support.

---

## 4. Measured current state

Established by probing the deployed system on 2026-08-06 with
`scripts/probe-live-registry.mjs`. No payment was sent; paid routes answered
with a 402 quote and nothing settled. Read
`packages/catalog/live-registry.json` for the current machine-readable version —
where it and this section disagree, the registry wins.

### Products

| Family | Lifecycle | Proof | Why |
|---|---|---|---|
| Search | `live` | `externally_repeated` free, `quote_observed_unpaid` paid | Free path returns real cited results; paid path quotes 6000 atomic |
| AI | `live` | `quote_observed_unpaid` | Quotes and serves all four modalities |
| Sandbox | `live` | `quote_observed_unpaid` | Quotes 120000 atomic |
| RPC | `unavailable` | `none` | Edge returns 404; `CLERVO_RPC_PUBLIC_ENABLED` unset |
| Prediction | `unavailable` | `none` | Edge returns 404; `CLERVO_PREDICTION_PUBLIC_ENABLED` unset |
| Crypto Intelligence | `unavailable` | `none` | Edge returns 404; `CLERVO_CRYPTO_PUBLIC_ENABLED` unset |

### AI routes — 18 `live`, 3 `supply_paused`

Only `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol` are paused, reason
`upstream_authentication_unavailable` (provider error code `auth_unavailable`),
expected return **2026-08-09**. They stay in the catalog.

**Recorded so it is not repeated:** an earlier probe reported 11 live and 10
paused. That was a defect in the prober, not in the runtime. It sent a
`kind: 'chat'` body to every route, and
`packages/contracts/src/ai-execution.ts` defines four distinct input shapes
(`chat`, `embedding`, `image`, `speech`). Seven image, embedding, and speech
routes rejected the wrong shape, and the rejection was indistinguishable from
paused supply. `probeBodyFor(route)` now selects the shape each route declares.
**A probe that sends the wrong request shape manufactures fake outages.** Any
new product added to the prober must be probed with its own declared contract.

### Bazaar readiness

The CDP x402 Bazaar requires the CDP facilitator, which we already use. There is
no registration form and no fee. Indexing triggers on a settled payment through
that facilitator. The observed minimum is **1000 atomic units**. Descriptions
must be ≤500 characters. Declared `input` must validate against
`schema.properties.input`. Quality ranking recomputes every 6 hours. Resources
idle 30 days without a settlement are dropped. Validator:
`POST https://api.cdp.coinbase.com/platform/v2/x402/validate`.

Search (6000 atomic) and Sandbox (120000 atomic) already validate `true`.
**15 of the 18 live AI routes quote below the 1000 atomic minimum** — chat,
embedding, and speech routes quote between 2 and 563 atomic. Only the three
image routes (75000, 35000, 15000) clear it. This is wider than previously
recorded, which described it as an AI-wide 113-atomic problem.

### Public truth is broken in the conservative direction

`clervo.dev/llms.txt` states "Public API callable: no" and "x402 public payment:
unavailable" while `/v1/ai/execute` and `/v1/sandbox/execute` return real
payment challenges. Deployed `catalog.json` marks five families `unavailable`.

The generator is not at fault. `generated/public/llms.txt` is already truthful.
The stale copy sits in `apps/site/public/`, because
`scripts/site/prepare-public.mjs` throws `site_public_projection_unsafe` unless
`noPublicDistribution === true` and `publicAvailable === false`. That is a
frozen-status gate — Rule 2's disease — living in the publish path rather than
in a test. It is the single reason the site contradicts the API.

### Conformance defects on served surfaces

- `/v1/search/free` returns 400 when `idempotency-key` is absent, so a
  first-time caller is rejected.
- The site returns 200 for every nonexistent URL
  (`not_found_handling: single-page-application` in `apps/site/wrangler.jsonc`).
  A crawler will not index a site that answers yes to everything.
- `api.clervo.dev` serves no `/v1/models`, no `/llms.txt`, no
  `/.well-known/x402`. `skill.md` and `agent.md` return the SPA shell.

### The three unavailable products, accurately

They are not one problem.

- **Prediction** is largely built. `services/prediction`, `adapters/prediction`,
  and `apps/api/src/x402-paid-prediction.mjs` exist, are wired, and pass their
  contract tests. Upstreams (Polymarket Gamma, Kalshi) are publicly reachable
  and unauthenticated. It is off because `CLERVO_PREDICTION_MODE` defaults to
  `disabled` and `infra/production/gcp/public-launch.v1.json` has no block for
  it. **What is missing is a commercial-terms decision and external proof, not
  code.**
- **Crypto Intelligence** is built against Blockscout, whose qualification
  passed with `restricted` terms. The runtime additionally requires a Solana
  endpoint it does not have, which currently blocks the whole product for the
  sake of one chain. A narrower EVM-only derived-output launch is the likely
  first shape.
- **RPC** is the genuine blocker. The runtime binds one adapter against a single
  configurable Ethereum endpoint that needs a key. All 46 catalogued supply
  routes are terms-blocked or blocked. This needs supply, owned or licensed —
  real money or real infrastructure. It is not a config change.

### Engineering that is duplicated

Quote, authorization, idempotency, replay, receipt, and reconciliation logic is
implemented separately in each `apps/api/src/x402-paid-*.mjs`. Each copy is
correct. The problem is that a seventh product means a seventh copy, and a fix
to one is not a fix to the others. **The logic is sound and must be preserved;
only its duplication is the defect.**

### Test inventory

`npm test` runs 14 gates and about 231 tests from a hardcoded filename list in
`scripts/run-acceptance.mjs`. The full `tests/contract/` directory holds roughly
686 tests, with 6 currently failing. The public-HTTP tests for AI, RPC,
Prediction, and Crypto exist and are simply absent from that list. **They are
excluded by an omission in a filename array, not by a policy decision.** The
smallest safe correction is to add those four files and triage the 6 failures —
not to launch a 686-test cleanup programme.

### Uncommitted work

`scripts/probe-live-registry.mjs` and `packages/catalog/live-registry.json` are
untracked on `main`. They are reviewed, the modality defect is fixed, and they
are the input to B1. **Do not discard them.** No real payment and no deployment
has been performed for this work.

---

## 5. Already completed

**Total-loss risk removed (2026-08-06).** 37 commits pushed to `origin/main`.
The pre-recovery bundle's refs are ancestors of `origin/main`, so it is a stale
cache rather than a sole copy. Verified with `git ls-remote`, an empty
`git log origin/main..HEAD`, and `git merge-base --is-ancestor`.

**Single authority established (2026-08-06).** `CLAUDE.md` created at the
repository root naming this file as sole authority — there had never been a
project `CLAUDE.md`, so Claude Code sessions loaded nothing project-specific.
`AGENTS.md` reduced to a pointer; it had named three competing authorities, one
of them stored outside version control in two diverging copies. Six product
plans moved to `docs/archive/product-plans/`; nothing deleted, no live code read
them. Four frozen-status gates removed from tests and scripts and replaced with
stage-independent invariants; the frozen core binding and interface hash are
still asserted exactly, because those genuinely are frozen.
`verify-product-scope.mjs` was deleted — its input had been removed in
`eae134c`, so it had been erroring on every invocation, unnoticed, and nothing
called it. `npm test` passed end to end for the first time.

---

## 6. Parallel workstreams

One build milestone is active at a time. These tracks run continuously
underneath it and are never the active milestone.

| Track | Scope | Cadence |
|---|---|---|
| **A — Product execution** | The B-track spine. Exactly one active | one at a time |
| **B — Wallet, payment, receipt, replay** | Shared commerce core, then the client | B5, B6, B11 |
| **C — Supplier rights and owned infrastructure** | RPC node costing and licensing, Prediction terms decision, Crypto derived-output scope, written serper and brave resale terms | **starts at B1, continuous** |
| **D — Discovery and distribution** | Ships inside each product milestone; B12 for scale | every milestone |
| **E — AI qualification, funding, route health** | Scheduled requalification, 2026-08-09 gateway funding, Bazaar keepalive settlements | calendar-driven |
| **F — Website and public truth** | Regenerate public surfaces whenever runtime state changes | every milestone |
| **G — Acquisition and retention measurement** | Funnel, revenue, margin, source, conversion, retention | B13, then feeds R-track |

**Track C begins at B1 and does not wait.** The three blocked products need
commercial answers whose lead time is external. Starting them when their build
milestone opens guarantees the milestone stalls.

---

## 7. Build track

Every milestone below carries the same seventeen fields.

---

### B1 — Truth spine

1. **Milestone:** B1 — Truth spine
2. **Status:** `externally_verified` — deployed 2026-08-06 from `e4a281b`; every
   check in field 12 passes against the public URLs.
3. **Customer-visible outcome:** Every public Clervo surface states what the
   runtime actually does. The site stops denying that the API takes payment.
4. **Why it matters commercially:** The site currently tells arriving buyers the
   product is not callable while the API quotes real prices. That is lost
   revenue at the top of the funnel, and every later milestone publishes claims
   on top of this foundation. Until the registry is the source, each publish is
   a fresh chance to lie.
5. **Preserve:** `scripts/generate-discovery.mjs` and its invariant checks;
   `packages/catalog/launch-state.v1.json`; the reviewed prober and registry;
   the existing `generated/public/*` output shapes.
6. **Current evidence:** Prober and registry committed. `generate-discovery.mjs`
   reads `live-registry.json`, and every generated surface plus the site source
   renders lifecycle state and proof level as separate fields. The frozen-status
   throw in `prepare-public.mjs` is replaced by a projection-equality invariant,
   and `tests/contract/registry-public-consistency.test.mjs` fails the build on
   any disagreement. `generated/public/llms.txt` and `apps/site/public/llms.txt`
   are identical and truthful. Deployed and verified externally on 2026-08-06:
   `https://clervo.dev/llms.txt` returns `Public API callable: yes` with the
   observed lifecycle and proof table, and `https://api.clervo.dev/catalog.json`
   carries the `observedTruth` block matching the registry.
7. **Research:** None. No market question changes this build.
8. **Work:** Commit the prober and registry. Make `generate-discovery.mjs` read
   `live-registry.json` for lifecycle state and proof level, keeping
   `launch-state.v1.json` for what it uniquely owns. Render proof level
   distinctly from lifecycle state on every surface. Remove the frozen-status
   throw in `prepare-public.mjs` and replace it with an invariant that the
   projected files equal the generated files. Add a consistency test that fails
   the build when any public file disagrees with the registry. Add retry before
   pause in the prober so a transient blip cannot publish a false outage. Add
   the four public-HTTP product test files to `scripts/run-acceptance.mjs` and
   triage the 6 failing contract tests.
9. **Dependencies:** None.
10. **Parallel:** Track C opens — begin RPC supply costing, the Prediction terms
    question, and the Crypto scope question.
11. **Launch-critical tests:** registry-to-public-output consistency; the prober
    never drops a catalogued route; no test pins a status value; existing
    payment binding, idempotency, replay, and receipt tests still pass.
12. **External acceptance proof:** `curl https://clervo.dev/llms.txt` and
    `curl https://api.clervo.dev/catalog.json` from an unrelated machine both
    describe the same lifecycle states and proof levels as the registry, and
    neither claims the API is uncallable.
13. **Visibility shipped:** `llms.txt`, `catalog.json`, `pricing.json`,
    `status.json`, `capabilities.json`, site copy — all regenerated.
14. **Metrics:** Baseline snapshot recorded in the continuity block, observed
    2026-08-06T11:40:50.003Z: live products 3 of 6; live AI routes 18 of 21;
    supply-paused AI routes 3; AI routes quoting below the Bazaar 1000-atomic
    minimum 18; conformance defects open 2.
15. **Owner approval:** Production deploy of the site and worker. No money, no
    secret, no DNS.
16. **Stopping condition:** The consistency test is green, and the two public
    URLs above return registry-derived truth from an unrelated machine.
17. **Continuation point:** Open B2. First task there: generate
    `idempotency-key` server-side in the free search handler.

---

### B2 — Front door open

1. **Milestone:** B2 — Front door open
2. **Status:** `externally_verified` — deployed 2026-08-06 from release
   `35a2f7a`. Field 12 passed from outside: a keyless `POST` to
   `https://api.clervo.dev/v1/search/free` returns 200 with three cited results
   and a server-minted `idempotency-key` response header, and
   `https://clervo.dev/does-not-exist` returns 404. The probed registry records
   both conformance defects closed.
3. **Customer-visible outcome:** A stranger runs one curl with no headers and
   gets a cited result. A nonexistent URL returns 404.
4. **Why it matters commercially:** This is the top of the entire funnel. A
   first-time caller currently receives 400 and leaves. A crawler currently sees
   a site that returns 200 for every URL and will not index it, so all later SEO
   spend is wasted until this lands.
5. **Preserve:** Free-tier rate guard and caps; the search evidence and citation
   pipeline; existing idempotency semantics for callers that do supply a key.
6. **Current evidence:** Missing `idempotency-key` returns 400.
   `not_found_handling: single-page-application` in `apps/site/wrangler.jsonc`.
   `skill.md` and `agent.md` return the SPA shell.
7. **Research:** How BlockRun's free path converts without a wallet, key, or
   account — specifically what the first successful call requires from the
   caller. One question, answered before choosing the server-side key strategy.
8. **Work:** Generate `idempotency-key` server-side when absent, without
   weakening replay for callers that supply one. Fix the soft-404. Serve
   `skill.md` and `agent.md` as real files. Publish a copy-pasteable curl on the
   site.
9. **Dependencies:** B1 (public surfaces must already render from the registry).
10. **Parallel:** Track C continues. Track E begins scheduling requalification
    ahead of 2026-08-09.
11. **Launch-critical tests:** free search accepts a naive request; a supplied
    key still replays identically; a generated key does not collide across
    callers; 404 behaviour on the site; free-tier cap still refuses rather than
    silently billing.
12. **External acceptance proof:** From a machine that has never contacted us,
    `curl https://api.clervo.dev/v1/search/free -d '{"query":"..."}'` with no
    other headers returns cited results, and
    `curl -o /dev/null -w '%{http_code}' https://clervo.dev/does-not-exist`
    returns 404.
13. **Visibility shipped:** Quick-start curl on the site and in `llms.txt`;
    `skill.md` and `agent.md` served correctly.
14. **Metrics:** First-call success rate; naive-request rejection rate (target
    zero); 404 correctness.
15. **Owner approval:** Production deploy of the worker and site.
16. **Stopping condition:** Both external proofs above pass from an unrelated
    machine. Records **R1**.
17. **Continuation point:** Open B3. First task there: serve `/v1/models` on
    `api.clervo.dev`.

---

### B3 — API discovery served

1. **Milestone:** B3 — API discovery served
2. **Status:** `externally_verified`
3. **Customer-visible outcome:** An agent that has never seen Clervo can find
   the operation list, the model list, and the payment manifest without human
   help.
4. **Why it matters commercially:** Agents are the buyer. They cannot open
   accounts or read marketing pages; they read discovery documents. Without
   these paths Clervo is invisible to its actual customer.
5. **Preserve:** The existing `DISCOVERY_DOCUMENTS` map in
   `apps/worker/src/api-edge.js` and the eight documents it already serves
   correctly; the `extensions.bazaar` blocks already present in the 402 bodies.
6. **Current evidence:** All three paths are served on `api.clervo.dev` and are
   recorded `live` at status 200 by the probe of 2026-08-06T15:14:21.853Z. From
   an unrelated machine, `/v1/models`, `/.well-known/x402`, and `/llms.txt`
   return 200 with bodies byte-identical to the registry-derived generated
   output, and each of the three resources the manifest advertises returns a
   valid 402 carrying the advertised amount: `search.web` 6000, `ai.chat` 16,
   `sandbox.run` 120000 atomic USDC on `eip155:8453`. The free search path
   returns 200 without payment and is advertised as free rather than as an x402
   item.
7. **Research:** BlockRun's `/llms.txt` and `/.well-known/x402` structure — what
   an agent actually parses, and what field set makes a resource usable on first
   read. One question, answered before fixing the document shape.
8. **Work:** Serve `/v1/models`, free and unauthenticated, OpenAI-shaped so
   existing clients work unmodified, rendered from the registry. Serve
   `/.well-known/x402` from the same registry. Serve `/llms.txt` on the API host
   as a full reference. Every document renders lifecycle state and proof level.
9. **Dependencies:** B1.
10. **Parallel:** Track C continues. Track E requalification.
11. **Launch-critical tests:** every document is registry-derived; every listed
    operation is callable; no document lists a route the registry marks
    `unavailable`; no document claims a proof level the registry does not hold.
12. **External acceptance proof:** From an unrelated machine, all three paths
    return 200 with content matching the registry, and every operation listed in
    `/.well-known/x402` returns a valid response or a valid 402.
13. **Visibility shipped:** All three documents, plus their links from the site.
14. **Metrics:** Discovery document fetches by user agent; agent-sourced first
    calls.
15. **Owner approval:** Production deploy.
16. **Stopping condition:** All three paths verified live and registry-consistent
    from outside.
17. **Continuation point:** Open B4. First task there: determine CDP Bazaar
    resource and indexing granularity before any pricing change.

---

### B4 — Bazaar entry

1. **Milestone:** B4 — Bazaar entry
2. **Status:** `externally_verified` — deployed 2026-08-06 from release
   `777b7c6` as Cloud Run revision `clervo-api-production-00033-vub`. Field 12
   passed from outside: the CDP merchant discovery endpoint returns
   `https://api.clervo.dev/v1/search/paid` with `index.active: true`, and the
   settlement that triggered it returned a real cited search result with an
   accurate receipt and a replay that returned the same operation without a
   second charge.
3. **Customer-visible outcome:** Clervo resources are findable in the CDP x402
   Bazaar, so agents discover them without ever visiting our site.
4. **Why it matters commercially:** This is the largest single distribution
   channel for x402 commerce and it is free to enter. Indexing triggers on
   settled payment, which also produces our first `paid_outcome_verified` proof.
5. **Preserve:** Existing prices where they clear the minimum; the CDP
   facilitator configuration; the valid `extensions.bazaar` blocks; the payment
   binding and idempotency guarantees.
6. **Current evidence:** All three payable resources validate `true` against
   `POST https://api.cdp.coinbase.com/platform/v2/x402/validate`. Bazaar
   granularity is per resource URL, not per domain, operation, or route: the
   merchant listing keys on the exact resource, and one settled payment indexed
   `/v1/search/paid` alone, leaving `/v1/ai/execute` and `/v1/sandbox/execute`
   valid and unindexed. Indexing triggers only on a payment settled through the
   CDP facilitator, so a valid never-paid resource is eligible and unindexed
   rather than defective. The AI defect was a single failed check —
   `Amount 113 is below $0.001 minimum (1000 atomic units)` on
   `accepts[0].amount` — now closed by a 1000-atomic minimum billable charge
   applied above the derived price, which only ever raises a quote and so
   cannot sell below cost. The other defect was structural: the official x402
   client copies `resource` and `extensions` from the challenge into the
   settlement payload, but Clervo rebuilt that payload from the caller's
   `PAYMENT-SIGNATURE` header, so a payer omitting either field would settle
   against an empty resource URL and index nothing. Both fields are now
   re-attached server-side from the issued challenge after verification and
   after the fingerprint is taken, leaving payment binding and idempotency
   identity unchanged.
7. **Research:** **Determine the exact Bazaar resource and indexing granularity
   before any payment.** Is a resource a URL, an operation, or a route within an
   operation? Does one settled payment index the endpoint or only the specific
   route paid for? Does the 30-day idle rule apply per resource or per endpoint?
   Answer from the CDP discovery API and validator responses, not by assumption.
   **Do not assume one settlement per model or per route is required.**
8. **Work:** From the granularity finding, decide the minimum set of settlements
   that proves indexing. **Before requesting approval, state the exact
   endpoints, the exact amount per settlement, and the exact total cost.**
   Correct any price below the minimum for routes we intend to list, without
   breaking Rule 5 — a route whose true cost cannot support a compliant price is
   listed as free-tier or not listed, never sold below cost. Re-validate until
   `valid: true`. Execute the approved settlements. Schedule keepalive
   settlements inside 30 days.
9. **Dependencies:** B3. Owner approval for the settlements.
10. **Parallel:** Track C continues. Track E schedules keepalives.
11. **Launch-critical tests:** payment request binding; idempotency; replay
    without double charge; settlement reconciliation; receipt integrity; a
    listed resource's declared input validates against its schema.
12. **External acceptance proof:** The CDP discovery resource list returns
    Clervo resources with `index` non-null, and a settled payment produced a real
    result with an accurate receipt and a replay that returned the same
    operation. Proof level for those routes moves to `paid_outcome_verified`.
13. **Visibility shipped:** Registry and public surfaces record Bazaar index
    state per resource; keepalive schedule visible in status.
14. **Metrics:** Indexed resource count; Bazaar-sourced calls; days since last
    settlement per listed resource.
15. **Owner approval:** **Real money.** Required, with the exact endpoint list,
    per-settlement amount, and total stated before any payment. Also production
    deploy for the price changes.
16. **Stopping condition:** Met. `index` is non-null and active for
    `/v1/search/paid`, the resource chosen for the first listing, and
    `search.web` is at `paid_outcome_verified`. Records **R2**. Listing AI and
    Sandbox needs one settlement each, at 0.001 and 0.12 USDC respectively, and
    is a separate owner approval rather than a B4 blocker.
17. **Continuation point:** Open B5. First task there: inventory the shared
    surface across the six `x402-paid-*.mjs` handlers.

---

### B5 — Shared commerce core

1. **Milestone:** B5 — Shared commerce core
2. **Status:** `complete` (2026-08-07)
3. **Customer-visible outcome:** Payment, receipt, replay, and retry behave
   identically on every product, so a customer learns them once.
4. **Why it matters commercially:** Three products are about to be switched on.
   Without this, each arrives with its own copy of the money path and its own
   opportunity to lose a payment. Consistency here is what makes multi-product
   usage possible later.
5. **Preserve:** **All existing payment semantics exactly.** The six handlers
   are correct. This milestone changes where the logic lives, never what it
   does. No guarantee may be weakened to simplify the extraction.
6. **Current evidence:** **Corrected on 2026-08-07.** This field previously
   read that the six handlers each implement quote, authorize, idempotency,
   replay, receipt, and reconciliation separately. That was already false when
   B5 opened: all six delegate to `apps/api/src/x402-paid-operation.mjs`, which
   owns the state machine, the quote seal, the payment binding, the settlement
   claim, the receipt seal, and the accounting record. The money path was one
   path before this milestone began. What was genuinely copied per product was
   the surface around it — the runtime request envelope, the RECEIPTED
   response envelope, the request hash, the fixed-price lookup, the runtime
   result verifier, and provenance construction.
7. **Research:** None. This is internal structure.
8. **Work:** Extract one module implementing the capability contract
   `discover, quote, authorize, execute, receipt, replay, reconcile, status`.
   Move each product to it one at a time, proving behaviour is unchanged after
   each move. Product-specific logic stays in the product.
9. **Dependencies:** B4 (do not restructure the money path between validation
   and first settlement).
10. **Parallel:** Track C continues — by now the Prediction terms decision and
    Crypto scope should be converging.
11. **Launch-critical tests:** the complete existing payment, idempotency,
    replay, reconciliation, and receipt suites for all six products, run before
    and after each move with identical results; unknown settlement state still
    fails closed.
12. **External acceptance proof:** The live paid products still return correct
    quotes, results, receipts, and replays from outside, with no observable
    behaviour change.
13. **Visibility shipped:** None new. Public surfaces unchanged.
14. **Metrics:** Payment-path defect count; duplicate-charge incidents (must
    remain zero).
15. **Owner approval:** Production deploy.
16. **Stopping condition:** **Met 2026-08-07.** All six products route through
    one core; the shared commerce surface is extracted into it and the
    per-product copies are gone. Commerce suite 18/18 before and after each
    product move, full acceptance 262/262 unchanged. External behaviour is
    unchanged and was proved by value, not by assertion: the request hash and
    public pricing for `rpc.call`, `crypto.wallet`, and `prediction.markets`
    are byte-identical across the change, and the `sandbox.run` request hash
    matches the one the live edge served during the work
    (`sha256:668d33c40fde8f25c3ff0ca16c4cf241d93893fdd7059a38f92bb2d30649012e`).
    Forged results, wrong schema versions, wrong operation ids, empty
    provenance, unqualified sources, and unpriced products are all still
    refused.

    **No production deploy was performed, and none is required.** The change is
    to `apps/api/src`, which runs on Cloud Run, not to the Cloudflare edge. The
    three live paid routes (`search`, `ai`, `sandbox`) are byte-identical in
    behaviour, so there is no customer-visible change to ship; `rpc`,
    `prediction`, and `crypto` are not publicly mounted on the edge yet
    (`/v1/rpc/execute` answers 404 from `api.clervo.dev`). Field 15's owner
    approval for a production deploy therefore remains **unspent** and is
    carried into whichever milestone next changes live API behaviour.
17. **Continuation point:** Open B6. First task there: choose the client
    distribution channel from the B6 research question.

---

### B6 — Clervo Connect v0

1. **Milestone:** B6 — Clervo Connect v0 (ClervoRouter customer path v0)
2. **Status:** `closed_free_path_shipped_paid_leg_and_publish_blocked` — closed on
   owner instruction 2026-08-07 so B7 can open before the 2026-08-09 expiry, with
   the paid leg and the npm publish carried forward as residue. See fields 12, 15,
   and 16 for exactly what is and is not proven.
3. **Customer-visible outcome:** From a clean machine: install, a local wallet
   is created, the live catalog loads, a free operation succeeds, the wallet is
   funded, a paid operation succeeds, the receipt is correct, and a retry does
   not double-charge.
4. **Why it matters commercially:** This is the conversion engine. Hand-signing
   x402 is a barrier almost no customer will cross. The wallet is identity,
   authentication, payment, and budget control at once — that is why agents can
   buy at all.
5. **Preserve:** The B5 commerce core as the single money path; existing
   idempotency and replay semantics; the registry as the catalog source.
6. **Current evidence:** `@clervo/router` 0.1.0 exists at `packages/router` and
   is proven from outside. Verified 2026-08-07 by packing a real tarball
   (`npm pack`, 35 files, no TypeScript sources, no env files, no wallet
   material) and installing it into an empty directory that had never seen the
   repository, then running the customer path against `https://api.clervo.dev`
   and Base mainnet:
   - `clervo search "…"` returned 10 real results with **no wallet, no key, no
     funding, and no wallet file created**. This is the free-first-success
     ordering advantage over BlockRun, proven rather than asserted.
   - `clervo catalog` loaded the live registry: 4 capabilities, 1 free, 3
     payable, joined against `observedTruth` so an unreachable family is never
     offered.
   - `clervo quote search.web "…"` returned a live 402 quote of 0.006 USDC to
     `0xBd11…ca28`, still with no wallet present and nothing charged.
   - `clervo wallet create` wrote `0700` home and `0600` wallet, printed the
     recovery phrase once, and showed Base USDC funding guidance stating no ETH
     is needed. A second `wallet create` **refused and did not touch the
     existing wallet**.
   - `clervo wallet balance` read the real USDC and native balance from
     `https://mainnet.base.org`.
   - `clervo doctor` reported all checks with the unfunded wallet as the single
     `warn`, and `Ready.`
   - `clervo run search.web "…"` showed the quote and the buyer's own limits and,
     when declined, recorded nothing and signed nothing.
   Payment no longer requires the caller to construct or sign the
   `PAYMENT-SIGNATURE` header. The signing path itself was proven against the
   live 402 with a throwaway mnemonic during design: the EIP-3009 payload matched
   the shape the server verifies, and it was **signed only, never sent**, so
   nothing settled and no money moved.
7. **Research:** Resolved by the owner before work began; no report was produced.
   BlockRun's strongest developer distribution is a one-command npm/MCP install
   that creates or uses a locally stored non-custodial wallet, with funding before
   normal paid use, and public docs that are inconsistent about whether free model
   success truly precedes funding. Clervo deliberately beats this: the first
   useful outcome happens **before wallet creation or funding**, using the
   already-live free Search. B6 therefore ships a minimal installable CLI as the
   v0 distribution channel; the MCP, SDK, and OpenAI-compatible surfaces remain
   B11.
8. **Work:** Done. One local runtime at `packages/router`, published surface
   `clervo`: `search`, `catalog`, `quote`, `run`, `replay`, `receipt`, `history`,
   `reconcile`, `doctor`, `wallet create|address|balance|restore|backup`,
   `limits`, `limits set`; `--json` on every command.
   - **Non-destructive wallet.** `createWallet` writes with the `wx` flag, so the
     refusal is atomic and two concurrent invocations cannot both believe they
     made the wallet. `replaceWallet` demands proof the outgoing wallet is empty
     as an argument, and the CLI reads the on-chain balance to obtain that proof,
     refusing outright when it is non-zero. A wallet that cannot be read is
     treated as possibly funded, never as empty.
   - **Backup and recovery shipped, not deferred.** `wallet create` prints the
     phrase once; `wallet backup` reprints it only after explicit confirmation;
     `wallet restore` recovers from a phrase. Permissions (`0700`/`0600`) are
     re-checked on **every** wallet load, not only by `doctor`, and the recorded
     address is re-derived from the phrase on load so a tampered file is refused.
   - **Fail-closed settlement.** `authorizing` is written to disk *before* a
     signature exists; any ambiguous answer becomes `unknown`; both states block
     every further paid call through `assertNothingUnreconciled`. Reconciliation
     probes with a replay that carries **no payment header**, so reconciliation
     itself cannot charge. A 402 to that probe proves no payment settled.
   - **Buyer-side spend limits** (defaults 0.02 USDC per operation, 0.10 USDC per
     day) checked against the live quote before anything is signed, in addition to
     the seller's own ceiling.
   - **Registry as capability truth.** `products` is joined with
     `observedTruth.products`; a product declaring itself payable inside a family
     the probe found unreachable is not offered.
   Deliberately excluded per the owner's instruction: the MCP server, the SDKs,
   and the OpenAI compatibility layer, which belong to B11.
9. **Dependencies:** B5.
10. **Parallel:** Track C continues; Track D prepares the B12 page templates.
11. **Launch-critical tests:** Shipped in `tests/contract/b6.test.mjs`, 10 tests,
    10 passing, covering the whole list: wallet creation is not destructive (and a
    refused replacement leaves the wallet byte-identical); keys are written `0600`
    under a `0700` home, are absent from the view every command renders, and are
    absent from `doctor` output; spend limits are enforced buyer-side before
    signing (asserted with a wallet present, so a missing wallet cannot be
    mistaken for the limit firing); a retry does not double-charge; a replay
    returns the same operation and sends no payment header; `doctor` detects a
    broken configuration and every failure carries an actionable remedy. Also
    covered: an unknown settlement fails closed and blocks further spend until
    reconciled, reconciliation records a settlement it discovers and counts it
    once, a record stuck in `authorizing` is treated as unreconciled, and the free
    path needs no wallet. Baseline `shared-paid-operation` remains 5/5. Full
    contract suite 720/722; the 2 failures are `n13.3` and `n13.5` site tests that
    **fail identically with all B6 work stashed**, so they are inherited from B5
    and are not caused by B6. `lint`, `scan:secrets`, `validate-contracts`, and
    `verify-clean-room-boundary` all PASS.
    Two defects were found and fixed by these tests rather than in production:
    (a) `spentTodayAtomic` excluded replayed records, so a replay erased a real
    charge from the day's total — a spend limit that failed **open**; `replayed`
    is now provenance only and every settled record counts once, which is correct
    because a key is charged at most once. (b) `createWallet` and `saveLimits`
    took `env` inside an options object while every other module took it
    positionally, so a wrong call silently fell back to the operator's real
    `~/.clervo`; this actually happened during development, wrote a throwaway
    wallet and limits file there, and was cleaned up after confirming on-chain
    that the wallet held nothing. Both signatures are now uniform, and the suite
    additionally repoints `process.env.CLERVO_HOME` at a temporary directory so no
    test can reach a real wallet.
12. **External acceptance proof:** The free-path portion of the clean-machine
    sequence is proven from outside — see field 6 for the verified commands.
    Re-verified 2026-08-07 from a fresh clean install of the exact publishable
    tarball: free search returned 10 real results with no wallet file created,
    and `~/.clervo` was untouched by that run.
    **Outstanding and explicitly not claimed:** the paid leg (funded wallet →
    paid operation → correct receipt → retry that does not double-charge) has
    **not** been performed against live settlement. The owner authorized it, but
    it could not be executed: the dedicated test wallet
    `0x6B10DDcD5AB0e00a87d02C7F11188F55474bB1Ef` was created and holds **0
    USDC**, and funding it requires a real USDC transfer that only the owner can
    make. No key material for a funded wallet exists on this machine.
    What the attempt did prove, live and for real, is the **fail-closed path**.
    A paid run against the unfunded wallet was answered 502; the client recorded
    `unknown`, refused a second paid call (`b6-proof-002` was blocked before
    anything was signed), and `clervo reconcile` then resolved
    `b6-proof-001 → not_settled`, confirmed by the balance still reading 0 USDC.
    That is the real-money safety property exercised against live infrastructure
    rather than a test double.
    The 502 was traced rather than assumed: `apps/api/src/search-server.mjs:853`
    defaults unclassified errors to 502, so it was a **pre-payment refusal**,
    not a settlement failure. The commerce core never returns 502 for a failed
    settlement — `x402-paid-operation.mjs:318` returns 503 `settlement_unknown` —
    and the client enumerates that code as ambiguous, so a genuine unknown
    settlement fails closed the same way. A pre-flight check also confirmed the
    CLI sends `synthesize: false` for `search.web`, which is required: the paid
    route returns 503 `search_synthesis_unavailable` otherwise. The paid leg is
    therefore ready to run the moment the wallet holds USDC.
    A buyer-side ceiling matching the owner's authorization is now enforced on
    this machine: per-operation 0.007 USDC, daily 0.01 USDC, checked before
    anything is signed. Field 16 is not yet met.
13. **Visibility shipped:** Install instructions are in `llms.txt` (a new
    `## Command line` section, generated only when the free entry route is
    actually served, so a reader is never told to install something whose first
    command would fail) and in `packages/router/README.md`. **Deployed
    2026-08-07T06:52Z** under the owner's B5/B6 deploy approval: worker
    `clervo-api-edge-production` version `74efc7db-d0a7-49a1-8d4e-9f20e049fb0e`,
    generated files only, no runtime code in the diff. Live and verified at
    `https://api.clervo.dev/llms.txt` — the install line
    `npx @clervo/router search "..."` is being served, and `/v1/health`,
    `/readyz`, `/.well-known/clervo.json`, `/skill.md`, `/agent.md`,
    `/catalog.json` all returned 200, free search 200, paid 402. No
    customer-visible regression, so the rollback path was not used.
    **`clervo.dev/llms.txt` is deliberately still stale.** That host serves its
    own copy, produced by `scripts/site/prepare-public.mjs` during the site
    prebuild, so refreshing it requires a full site build — and four unshipped
    site commits sit between the last site deploy (2026-08-06T12:31Z) and now,
    including `bb473ed` (layout). Deploying it would have shipped unrelated
    visual changes, which the approval excluded. `api.clervo.dev` is the host the
    registry and the router read, so the machine-facing document is correct.
    Fixing the site copy belongs to **B12**, which rebuilds the site.
14. **Metrics:** Observed 2026-08-07 across both clean-machine runs: installs 2
    (both from the local tarball, **0 from npm** — it is unpublished); wallets
    created 2 (one throwaway, deleted after verifying on-chain it held nothing;
    one dedicated test wallet retained at
    `0x6B10DDcD5AB0e00a87d02C7F11188F55474bB1Ef`, `0700`/`0600`, recovery phrase
    never printed to any transcript or log); free first success **yes, before any
    wallet existed**, 10 real results; wallets funded 0; paid outcomes 0;
    settlements 0; USDC spent **0**. Live figures: catalog 4 capabilities (1
    free, 3 payable), `search.web` quoted 0.006 USDC against payee
    `0xBd11d82d8Dbd01Ba3eed279d3bACf74659fFca28`, quote version
    `search-web-usdc-2026-08-03.1`. The funnel is instrumented only as far as the
    free step. One fail-closed cycle was exercised live: 1 refused operation, 1
    blocked retry, 1 reconciliation resolving `not_settled`.
15. **Owner approval:** All three were granted on 2026-08-07. One was spent; two
    are blocked on credentials or funds that do not exist on this machine.
    - **Production deploy — SPENT and verified.** See field 13.
    - **npm publish of `@clervo/router` 0.1.0 — BLOCKED, two separate causes.**
      (a) `publishConfig.provenance: true` requires a CI OIDC provider; from a
      local machine npm fails with `EUSAGE: Automatic provenance generation not
      supported for provider: null`. Provenance is a supply-chain guarantee, so
      it was **not** removed to force the publish through — that is an owner
      decision, and the honest options are to publish from CI (GitHub Actions,
      keeping provenance) or to drop provenance deliberately.
      (b) The npm credential in `~/.npmrc` is **invalid or expired** — a
      40-character legacy-format token. `npm whoami` returns 401 and `PUT` of the
      package returns 404, which for a scoped package means no write access. The
      scope itself is fine and owned: `@clervo/sdk@0.3.0` is published under npm
      user `clervo`. A valid token with write access to `@clervo` is required.
      The package is otherwise ready: `npm publish --dry-run` passes, 35 files,
      40.4 kB, shasum `852dd6105c29debf52459d45cff2bcec6df4ff94`, no `src/`, no
      `.env`, no wallet material. Because it is unpublished, the clean-machine
      check was performed against that exact tarball rather than the registry;
      an install *from npm* remains unverified and cannot be verified until the
      publish succeeds.
    - **One real paid operation — BLOCKED on funds.** The dedicated wallet exists
      and holds 0 USDC; see field 12. The authorized ceiling is configured.
16. **Stopping condition:** **Not met, and B6 is closed anyway on owner
    instruction** ("Close B6 in ROADMAP, commit, and immediately stop B6",
    2026-08-07), because B7 is time-critical: all 21 AI route qualifications
    expire 2026-08-09. Everything within this environment's power is done and
    verified from outside. Three things are not, each blocked on something only
    the owner holds — a valid npm token, a CI publish or a provenance decision,
    and USDC in the test wallet. They carry forward as B6 residue rather than
    being restated as achievements: **npm publish**, **install-from-npm
    verification**, and **one real paid settlement with receipt and replay**.
    Anyone reading this later should treat the paid leg as unproven against live
    settlement, however complete the rest of the milestone looks.
17. **Continuation point:** Open B7. First task there: requalify routes and
    re-verify which supply is commercially permitted.

---

### B7 — AI catalog unshelved

1. **Milestone:** B7 — AI catalog unshelved
2. **Status:** `integration_ready` — **PROVEN ENGINEERING-COMPLETE and
   FIXTURE-BOUND; EXTERNALLY BLOCKED for live dynamic cutover.** It is not
   `closed`: Rule 3 still requires an outside proof against the authoritative
   authenticated `ai.clervo.dev` catalog and runtime.
3. **Customer-visible outcome:** **Every freshly verified, commercially
   permitted AI route is accurately priced, genuinely callable, publicly
   discoverable, and continuously monitored. Catalog size is determined by
   verified supply, not by a fixed target.** **EXTERNALLY BLOCKED:** the
   customer-visible dynamic outcome has not been deployed; the public system
   still exposes the legacy 21-entry projection.
4. **Why it matters commercially:** AI is the highest-volume family and the one
   customers comparison-shop. Breadth is only an asset when every listed route
   works; a listed route that fails costs more trust than a small honest
   catalog.
5. **Preserve:** **PROVEN COMPLETE.** The legacy
   `packages/catalog/ai-model-catalog.v1.json`, its evidence hashes, the
   free-tier inventory and rate guard remain preserved as historical/recovery
   evidence. `providerNamesPublic: false` is now enforced by an explicit
   private/public projection boundary: internal routing identity survives,
   while public output cannot expose provider identity, gateway supply ID,
   runtime model ID, supply-family ID, raw upstream cost, or authentication
   material.
6. **Current evidence:** **PROVEN legacy LIVE observation:** 21 public entries,
   18 live and 3 paused, with registry evidence dated 2026-08-06. The three
   gateway qualifications reached expiry on 2026-08-09; the other 18 reach
   expiry on 2026-08-14. This legacy fixed inventory is not the permanent B7
   authority. **PROVEN fixture-bound:** a strict normalized qualified-supply
   snapshot can contain an open-ended number of models and drives identity,
   category, lifecycle, pricing, discovery, and generic execution without an
   application-source change. **UNKNOWN:** the production authenticated
   internal catalog endpoint and final schema are not available in this
   worktree.
7. **Research:** **PROVEN COMPLETE as refreshable input, not permanent market
   truth.** BlockRun's public model API exposed 91 entries when observed on
   2026-08-09. Exact Luna, Terra, and Sol input/output prices were stored with
   source, timestamp, confidence, and expiry in data rather than composer code.
   The pricing engine ignores stale evidence. Future market calibration is a
   data operation; unmatched or expired comparisons remain **UNVERIFIED**.
8. **Work accounting:**
   - **SUPERSEDED BY PROVEN IMPLEMENTATION — permanent qualification and route
     health.** Direct-provider requalification remains explicit
     legacy/recovery tooling. The permanent composer consumes qualification,
     expiry, availability, reason, and observation time from the authoritative
     `ai.clervo.dev` supply snapshot and fails closed when they are missing or
     stale. The legacy scheduled expiry guard remains preserved.
   - **PROVEN COMPLETE — stable identity and dynamic inventory.** Immutable
     gateway supply identity maps through a durable registry to stable Clervo
     customer model and route IDs. Snapshot A to B adds a new qualified model,
     preserves old IDs, and updates lifecycle, price, discovery, and execution
     with no application-source edit. Equivalent supplier routes can retain one
     customer product identity.
   - **PROVEN COMPLETE — commercial gate engineering.** Technical
     qualification and owner-controlled commercial permission are separate.
     Missing or expired permission prevents public sellability without blocking
     identity, pricing preparation, lifecycle, or private execution binding.
     **EXTERNALLY BLOCKED:** the owner must decide permission per real immutable
     production supply identity; no resale permission is inferred here.
   - **SUPERSEDED BY PROVEN IMPLEMENTATION — pricing.** The universal fixed
     margin assumption is gone. Normalized cost flows through category/model
     policy, minimum and target margin, fresh competitor evidence, a sustainable
     price-to-win ceiling, and optional bounded owner-authorized subsidy. Missing
     cost, invalid units, stale required inputs, or unauthorized negative margin
     fail closed. Different models produce different outcomes from data.
   - **PROVEN COMPLETE — fallback architecture.** Multiple qualified supplies
     for an equivalent customer product remain private routes; routing selects
     a currently eligible sustainable route and records the route that served.
     **EXTERNALLY BLOCKED:** actual fallback breadth depends on the real gateway
     snapshot containing equivalent qualified supply.
   - **PROVEN COMPLETE — free-tier control.** Only zero-upstream-cost supply can
     enter the free tier; atomic per-wallet and global daily caps refuse after
     exhaustion and never convert to paid overage. The durable store hashes the
     subject and locks the combined quota update. **EXTERNALLY BLOCKED:** live
     activation requires real zero-cost qualified supply plus the owner's
     acquisition-budget decision.
   - **PROVEN COMPLETE — public/private projection and generic execution.** One
     OpenAI-compatible gateway adapter accepts arbitrary composed private
     runtime bindings while responses retain the stable public Clervo ID.
     Supplier metadata and raw cost never enter public catalog or discovery.
9. **Dependencies:** **PROVEN COMPLETE:** B3 discovery and B4 sustainable
   pricing-floor machinery. **EXTERNALLY BLOCKED:** authoritative authenticated
   catalog endpoint/schema, production token and binding, owner commercial
   decisions, migration/deploy, and outside execution proof. Legacy gateway
   funding is not an engineering dependency for dynamic B7 closure.
10. **Parallel:** Track C; Track E owns the requalification schedule from here.
11. **Launch-critical tests:** **PROVEN COMPLETE in current engineering tree.**
    Tests cover supply validation, revision/freshness, qualification expiry,
    stable identity, add/remove/pause/degrade, availability and cost changes,
    discovery updates, duplicates and runtime-binding conflicts, unsupported
    modality and pricing units, missing cost/permission, varied pricing,
    competitor input, strategic override bounds, negative-margin prevention,
    free-tier refusal, supplier privacy, fallback route selection, generic
    execution, and public projection. No test pins a route count.
12. **External acceptance proof:** **EXTERNALLY BLOCKED.** The local public HTTP
    path and fixture-backed quote-to-execution flow are **PROVEN**. The dynamic
    catalog has not been deployed, so it is **UNVERIFIED** that every model
    listed by the eventual production snapshot executes from outside with zero
    registry drift. The previously omitted AI public-HTTP test is now part of
    acceptance; that does not convert local proof into live proof.
13. **Visibility shipped:** **PROVEN COMPLETE fixture-bound:** customer-safe
    `/v1/models` and discovery projections carry price and truthful lifecycle
    without supplier leakage. **EXTERNALLY BLOCKED:** deploy and outside proof
    of the dynamic projection. Per-model public visual pages remain
    **UNVERIFIED** and the frozen B12 visual branch was not modified.
14. **Metrics:** **PROVEN AVAILABLE:** eligible/withheld models, lifecycle
    reasons, route availability, expected margin, competitor comparison state,
    and free-tier quota outcomes are composition/runtime data rather than fixed
    counts. **EXTERNALLY BLOCKED:** live production telemetry starts at cutover.
15. **Owner approval:** real-supply commercial permission; any explicit
    below-cost/subsidized or free-tier activation budget; production migration
    and deploy. No provider permission, loss-leading decision, or deployment is
    asserted by engineering.
16. **Stopping condition:** **PROVEN ENGINEERING-COMPLETE / FIXTURE-BOUND.** No
    count is asserted. A normal new qualified model requires only a valid supply
    revision and data/config decisions. Every published model must pass fresh
    technical qualification, availability, stable identity, valid current cost
    and price, and current commercial permission; otherwise it is withheld or
    truthfully non-sellable. Generic execution uses the composed private binding
    and public stable ID. **EXTERNALLY BLOCKED:** B7 cannot be `closed` until the
    production gateway contract is bound, owner decisions are recorded, the
    system is deployed, and Rule 3's outside proof passes.
17. **Continuation point:** Finish the B7 live integration described in the
    continuity block. Do not open B8 until that external proof closes B7.

---

### B8 — Prediction live

1. **Milestone:** B8 — Prediction live
2. **Status:** `not_started`
3. **Customer-visible outcome:** Product four is externally usable: an unrelated
   customer executes a real prediction-market comparison, pays, and receives a
   useful derived result with evidence and an accurate receipt.
4. **Why it matters commercially:** Product four moves Clervo from three
   products to four and creates the first natural multi-product workflow —
   prediction analysis pairs with search and AI on the same wallet.
5. **Preserve:** `services/prediction`, `adapters/prediction`,
   `apps/api/src/x402-paid-prediction.mjs`, and their passing contract tests.
   **This code works. Do not rebuild it.**
6. **Current evidence:** Built, wired, tests pass, upstreams publicly reachable
   and unauthenticated, edge returns 404 because
   `CLERVO_PREDICTION_PUBLIC_ENABLED` is unset and the deploy policy has no
   block for it.
7. **Research:** For each upstream, the exact terms distinction between raw
   pass-through (usually forbidden) and derived value-added output (often
   permitted), read from the current published terms. One question: what
   operation may we sell.
8. **Work:** **Technical wiring alone does not complete this milestone.**
   Establish commercially permitted use in writing and record supplier, allowed
   operations, retention policy, price basis, and hard stop. **If current
   supplier terms are insufficient, this milestone chooses another supplier,
   owned infrastructure, or a narrower permitted derived-output product — it
   does not stop at blocked.** Shape the output as comparison, disagreement, and
   uncertainty across markets, which is our analysis, not their feed. Price with
   positive margin. Enable the runtime mode and the public edge flag. Ship
   discovery with it.
9. **Dependencies:** B5 (commerce core); Track C terms decision; owner legal
   decision.
10. **Parallel:** Track C continues on Crypto and RPC.
11. **Launch-critical tests:** the existing Prediction public-HTTP test, now
    inside `npm test`; payment binding; idempotency; replay; receipt integrity;
    SSRF protection on upstream fetches; spend limits.
12. **External acceptance proof:** From an unrelated machine — discover the
    product, read its price and limits, execute a real operation, pay, receive a
    useful derived result with evidence, receive an accurate receipt, retry
    without double charge, and repeat successfully. Proof level
    `paid_outcome_verified`.
13. **Visibility shipped:** Registry state, catalog, pricing, status, product
    page, quick start, curl example, `llms.txt`, `/.well-known/x402`,
    `/v1/models`-adjacent operation listing, Connect catalog entry.
14. **Metrics:** Prediction calls, revenue, gross margin, wallets using it,
    multi-product wallets.
15. **Owner approval:** **Legal and commercial decision on derived output.**
    Production deploy; secret changes if a new supplier is chosen.
16. **Stopping condition:** All nine finished-product conditions pass from
    outside, with recorded commercial authority.
17. **Continuation point:** Open B9. First task there: fix the Crypto launch
    scope from Track C.

---

### B9 — Crypto Intelligence live

1. **Milestone:** B9 — Crypto Intelligence live
2. **Status:** `not_started`
3. **Customer-visible outcome:** Product five is externally usable: an unrelated
   customer executes a real on-chain analysis, pays, and receives a useful
   derived report with evidence and an accurate receipt.
4. **Why it matters commercially:** Crypto Intelligence is the highest-value
   derived output in the set and the strongest demonstration of the evidence and
   provenance differentiator.
5. **Preserve:** The existing Crypto service, adapters, and
   `apps/api/src/x402-paid-crypto.mjs`; the Blockscout qualification.
6. **Current evidence:** Built. Blockscout qualification passed with
   `restricted` terms. The runtime additionally requires a Solana endpoint it
   does not have, which blocks the entire product for one chain. Edge returns
   404 because `CLERVO_CRYPTO_PUBLIC_ENABLED` is unset.
7. **Research:** The same raw-versus-derived terms distinction for each on-chain
   data supplier under consideration. One question: which derived report may we
   sell, on which chains.
8. **Work:** **Technical wiring alone does not complete this milestone.**
   Narrow the launch to the permitted derived output on chains we can actually
   serve — an EVM-only first launch is the expected shape — so a missing
   endpoint for one chain no longer blocks the product. Make chain coverage a
   registry-declared property, so adding a chain later is a data edit. Record
   commercial authority, allowed operations, retention, price basis, and hard
   stop. **If terms are insufficient, choose another supplier, owned
   infrastructure, or a narrower derived product.** Price with positive margin.
   Enable the runtime mode and the public edge flag. Ship discovery with it.
9. **Dependencies:** B5; Track C terms decision; the Blockscout key already in
   the deployment environment.
10. **Parallel:** Track C now focuses entirely on RPC supply.
11. **Launch-critical tests:** the existing Crypto public-HTTP test, now inside
    `npm test`; payment binding; idempotency; replay; receipt integrity; SSRF
    and redirect protection; spend limits; declared chain coverage matches
    served coverage.
12. **External acceptance proof:** The nine finished-product conditions from an
    unrelated machine, on the declared chains only, with no operation offered
    that the runtime cannot serve.
13. **Visibility shipped:** Registry state including exact chain coverage,
    catalog, pricing, status, product page, quick start, curl example,
    `llms.txt`, x402 discovery, Connect catalog entry.
14. **Metrics:** Crypto calls, revenue, gross margin, wallets, multi-product
    wallets.
15. **Owner approval:** Legal and commercial decision; secret changes for any
    new endpoint; production deploy.
16. **Stopping condition:** All nine conditions pass from outside for the
    declared scope, with recorded commercial authority.
17. **Continuation point:** Open B10. First task there: pin search supplier
    routing preference by margin.

---

### B10 — Search and Sandbox hardened

1. **Milestone:** B10 — Search and Sandbox hardened
2. **Status:** `not_started`
3. **Customer-visible outcome:** The two oldest products return the full Clervo
   promise — result, evidence, provenance, true cost, replay-safe receipt — not
   just a result.
4. **Why it matters commercially:** These carry the most traffic and the best
   margin. Search routing preference alone is a multiple on gross margin and is
   a configuration value. Sandbox is our one structural margin advantage: we
   operate the runtime rather than reselling someone else's.
5. **Preserve:** Sandbox resource ceilings and isolation — these are never
   weakened for price; the search citation, authority, and freshness pipeline.
6. **Current evidence:** Search free path is `externally_repeated`; both paid
   paths validate for Bazaar. Supplier cost differences make routing preference
   commercially significant.
7. **Research:** What a competitor returns per call versus what we return. One
   question: which part of the evidence payload is a buying reason rather than
   noise.
8. **Work:** Pin supplier routing preference by margin with health-based
   fallback. Obtain written resale terms for the search suppliers. Add a
   short-run Sandbox price class **without weakening any resource ceiling**.
   Make evidence, provenance, exact route identity, and true cost first-class in
   both receipts.
9. **Dependencies:** B5. Track C supplier terms.
10. **Parallel:** Track D prepares B12; Track C on RPC.
11. **Launch-critical tests:** Sandbox isolation; resource cleanup; hard cost
    ceilings; SSRF protection; receipt names the route actually used; replay
    sameness; retry safety.
12. **External acceptance proof:** From outside, each product returns a useful
    result plus a receipt naming route, cost, evidence, and replay state, and a
    retry never double-charges.
13. **Visibility shipped:** Updated product pages, pricing, and receipt
    documentation.
14. **Metrics:** Gross margin per product; routing distribution; fallback rate.
15. **Owner approval:** Production deploy; any supplier contract.
16. **Stopping condition:** Both products meet all nine finished-product
    conditions with evidence and provenance in the receipt.
17. **Continuation point:** Open B11. First task there: MCP profile design per
    product family.

---

### B11 — Clervo Connect v1

1. **Milestone:** B11 — Clervo Connect v1
2. **Status:** `not_started`
3. **Customer-visible outcome:** A customer connects Clervo to the tools they
   already use — MCP clients, SDKs, and OpenAI-compatible clients — with one
   wallet, spend controls, diagnostics, and local usage statistics.
4. **Why it matters commercially:** Repeat usage requires a client that
   remembers the wallet and makes the second call cheaper than the first. This
   is what turns one payment into retention.
5. **Preserve:** The B6 wallet, its backup and recovery, and the B5 commerce
   core.
6. **Current evidence:** B6 delivers the minimum path. No MCP, no SDKs, no
   OpenAI-compatible proxy yet.
7. **Research:** How a competitor exposes MCP and SDK surfaces and what makes an
   agent client adopt one. One question: profile granularity — one server or one
   per family.
8. **Work:** MCP with per-family profiles; SDKs; an OpenAI-compatible proxy so
   existing AI clients work unmodified; spend controls; routing and fallback
   visible to the caller; reconciliation surfaced; local usage statistics;
   `doctor` extended.
9. **Dependencies:** B6; B7 for the OpenAI-compatible surface.
10. **Parallel:** Track D on B12; Track G begins instrumenting.
11. **Launch-critical tests:** spend limits enforced on every surface; wallet
    recovery restores a funded wallet; MCP and SDK paths use the same commerce
    core; OpenAI-compatible proxy never silently substitutes a model.
12. **External acceptance proof:** From a clean machine, an MCP client and an
    SDK client each complete a paid operation on the same wallet with correct
    receipts.
13. **Visibility shipped:** MCP directory submissions; SDK packages published;
    integration docs; OpenAI-compatible base URL documented.
14. **Metrics:** Second paid operation rate; 7-day repeat; multi-product usage
    per wallet; surface mix.
15. **Owner approval:** Package registry publishes; production deploy.
16. **Stopping condition:** Both external client proofs pass from outside.
17. **Continuation point:** Open B12. First task there: generate product and
    model pages from the registry.

---

### B12 — Distribution at scale

1. **Milestone:** B12 — Distribution at scale
2. **Status:** `not_started`
3. **Customer-visible outcome:** Humans and machines find Clervo without being
   told it exists.
4. **Why it matters commercially:** Everything before this makes Clervo worth
   buying. This is what makes it found. Reaching 100 wallets is a volume
   problem, and volume comes from indexed surface area.
5. **Preserve:** The registry as the sole source of every page's factual
   content. **No page may contain a hand-written status claim.**
6. **Current evidence:** Sitemap is small; no JSON-LD; no per-model or
   per-product page generation; the site's 404 behaviour is fixed in B2, which
   is the precondition for indexing.
7. **Research:** A competitor's programmatic page structure and its volume
   model. One question: which page families are worth generating for us.
8. **Work:** Templates rendering from the registry — product pages, model pages,
   free-tier pages, dated comparison pages with stated methodology, pricing,
   status, receipts, quick start. Sitemap generated from real pages. Schema.org
   JSON-LD. `llms.txt` and `llms-full.txt`. RSS changelog. MCP directory and
   x402 ecosystem listings. **The site hides nothing:** blocked products are
   shown as blocked, prices are shown, failures are shown, evidence is linkable.
   **Carried in from B6 (do not lose):** the site must publish the `@clervo/router`
   install instructions. B6 shipped them to `llms.txt` and the package README but
   deliberately did not touch the site, because the owner directed that B12
   rebuilds the site in full.
   **Two concrete consequences to clear here.** First, `clervo.dev/llms.txt` is
   stale: that host serves its own copy written by
   `scripts/site/prepare-public.mjs` during the site prebuild, so it only refreshes
   on a site build. `api.clervo.dev/llms.txt` is current and is what the registry
   and the router read, so this is a human-facing gap, not a machine-facing one —
   verify both hosts agree once the site is rebuilt. Second, four site commits up
   to and including `bb473ed` (layout) were built but never deployed as of
   2026-08-07; the first B12 site deploy will ship them, so review them as part of
   the rebuild rather than being surprised by them. The site's version must lead with the free-first
   ordering — `npx @clervo/router search "…"` returns a real result **before** a
   wallet exists or is funded — since that ordering is the deliberate advantage
   over BlockRun and is the one claim most likely to be flattened by a rewrite.
   Render it from the registry like every other page: show the command only while
   the free entry route is actually served, exactly as the `llms.txt` generator
   already gates it.
9. **Dependencies:** B2 (404 correctness); B1 (registry rendering); the products
   being real.
10. **Parallel:** Track G measurement.
11. **Launch-critical tests:** every page's factual content traces to the
    registry; no page asserts a proof level the registry does not hold; every
    listed operation is callable; nonexistent routes 404.
12. **External acceptance proof:** Pages indexed and reachable; every listed
    operation callable from outside; a spot check finds no page claiming more
    than the runtime supports.
13. **Visibility shipped:** This milestone is visibility.
14. **Metrics:** Discovery impressions; docs visits; acquisition source;
    conversion by source.
15. **Owner approval:** Production deploy; visual direction; any external
    listing submission that names us publicly.
16. **Stopping condition:** Generated pages live, indexed, and registry-true.
17. **Continuation point:** Open B13. First task there: instrument the funnel end
    to end.

---

### B13 — Measurement

1. **Milestone:** B13 — Measurement
2. **Status:** `not_started`
3. **Customer-visible outcome:** Indirect. Internally, we can see which product
   earns, at what margin, from which source, and whether customers return.
4. **Why it matters commercially:** Without this, expansion is guesswork and
   supplier negotiation has no evidence behind it. Transaction count alone is
   not commercial success and is never reported alone.
5. **Preserve:** The receipt and reconciliation records that already exist —
   they are the source of truth for revenue.
6. **Current evidence:** Funnel metrics are introduced piecemeal by earlier
   milestones. Nothing aggregates them.
7. **Research:** None required.
8. **Work:** Instrument the full funnel: discovery impression, docs visit,
   install, wallet created, free first success, wallet funded, first paid
   outcome, second paid outcome, 7-day repeat, 30-day retained payer, second
   product used. Per-product revenue and gross margin from real receipts.
   Acquisition source. Conversion rate. Retention.
9. **Dependencies:** B6, B11.
10. **Parallel:** Track C on RPC.
11. **Launch-critical tests:** revenue figures reconcile against settlement
    records; no metric is derived from a hand-written value.
12. **External acceptance proof:** Reported revenue for a period equals
    reconciled settlements for that period.
13. **Visibility shipped:** Public status may show aggregate uptime and route
    health. Customer data is never exposed.
14. **Metrics:** This milestone is metrics.
15. **Owner approval:** None beyond deploy.
16. **Stopping condition:** The full funnel is observable and revenue reconciles.
17. **Continuation point:** Open B14. First task there: choose RPC supply from
    Track C's costing.

---

### B14 — RPC live — six products

1. **Milestone:** B14 — RPC live
2. **Status:** `not_started`
3. **Customer-visible outcome:** Product six is externally usable, completing
   all six families. An unrelated customer executes a real chain read, pays, and
   receives a correct result with provenance and an accurate receipt.
4. **Why it matters commercially:** This is final completion of the roadmap. It
   also makes the wallet worth holding: chain reads are high-frequency and pair
   with Crypto Intelligence on the same wallet.
5. **Preserve:** The existing RPC service, adapters, and
   `apps/api/src/x402-paid-rpc.mjs`; the supplier-as-data model, so adding a
   chain is a registry edit.
6. **Current evidence:** The runtime binds one adapter against a single
   configurable Ethereum endpoint requiring a key. All 46 catalogued supply
   routes are terms-blocked or blocked. Edge returns 404 because
   `CLERVO_RPC_PUBLIC_ENABLED` is unset. **This is the one genuine supply
   blocker in the set.**
7. **Research:** Cost of owned nodes for the chains that matter most, against
   the cost of commercially licensed supply. Track C has been costing this since
   B1. One question: owned or licensed, per chain.
8. **Work:** Acquire supply we may legally resell — owned infrastructure,
   licensed provider, or both. **Two chains we own and may sell beat forty we
   cannot.** Launch the narrowest chain set that is genuinely permitted and
   genuinely served, with chain coverage declared in the registry so expansion
   is a data edit. Price with positive margin against real infrastructure cost.
   Enable the runtime mode and public edge flag. Ship discovery with it.
9. **Dependencies:** Track C supply decision; owner funding; B5 commerce core.
10. **Parallel:** Supplier expansion driven by B13's real demand data.
11. **Launch-critical tests:** the existing RPC public-HTTP test, now inside
    `npm test`; payment binding; idempotency; replay; receipt integrity; SSRF
    protection; declared chain coverage matches served coverage; spend limits.
12. **External acceptance proof:** The nine finished-product conditions from an
    unrelated machine, on the declared chains, and **all six families
    simultaneously meeting those conditions.**
13. **Visibility shipped:** Registry, catalog, pricing, status, product page,
    quick start, curl example, SDK and MCP access, `llms.txt`, x402 discovery.
14. **Metrics:** RPC calls, revenue, gross margin, infrastructure cost per call,
    multi-product wallets.
15. **Owner approval:** **Infrastructure purchase or supplier contract — real
    recurring money.** Secret changes for endpoints; production deploy.
16. **Stopping condition:** All six families externally usable, each meeting all
    nine finished-product conditions, each with recorded commercial authority.
    **This is completion of the build track.**
17. **Continuation point:** Supplier and infrastructure expansion driven by
    measured demand from B13, and the remaining R-track events as they occur.

---

## 8. Revenue track

**These are observed demand events, not build gates.** They are recorded
whenever they occur. A build milestone may make one more likely, but no revenue
milestone may be prevented, deferred, or back-dated because its associated build
milestone is unfinished. **If an unrelated wallet pays before B6 exists, record
R3 immediately.**

| # | Event | Recorded when | Build work that raises its probability |
|---|---|---|---|
| R1 | First publicly useful free outcome | An unrelated caller gets a real free result | B2 |
| R2 | First externally verified paid outcome | A settled payment returns a real result with an accurate receipt, a matching replay, and a retry that does not double-charge | B4 |
| R3 | First unrelated paying wallet | A wallet we did not ask pays once | B6, B12 |
| R4 | Second payment, same wallet | That wallet pays again | B11 |
| R5 | Ten funded wallets and 7-day repeat | Ten distinct external wallets funded, with repeat usage visible at 7 days | B11, B13 |
| R6 | Multi-product usage, 100 wallets, margin by product | One wallet uses two or more families; 100 connected wallets; revenue and gross margin reported per product with acquisition source, conversion rate, and retention | B12, B13, B14 |

**Never report transaction count alone as commercial success.** Report the
funnel:

```
discovery impression → docs visit → install → wallet created
→ free first success → wallet funded → first paid outcome
→ second paid outcome → 7-day repeat → 30-day retained payer
→ second product used
```

R6 opens Phase B: real usage numbers become negotiating material, and parked
supply flips on as registry rows, not code.

---

## 9. Testing policy

Do not run a 686-test cleanup programme. Each milestone selects only the tests
that protect its customer-visible outcome.

**Always protected, in every milestone that touches the money path:** payment
request binding; idempotency; replay without double charge; settlement
reconciliation; receipt integrity; exact supplier and model identity; spend
limits; Sandbox isolation; SSRF and redirect protection; resource cleanup;
public HTTP behaviour; registry-to-public-output consistency.

**Removing a test that permanently pins an old status can be correct. Removing a
payment, replay, security, isolation, or reconciliation guarantee is not.**

**Why the public-HTTP tests are excluded, and the smallest safe correction:**
`scripts/run-acceptance.mjs` runs a hardcoded list of test filenames. The
public-HTTP tests for AI, RPC, Prediction, and Crypto are simply not in that
array. There is no policy behind it. The correction is to add those four files
and triage the 6 currently failing contract tests individually — fixing the code
where the test is right, and replacing the test where it pins a status value.
Nothing larger.

---

## 10. Competitor research policy

BlockRun is a benchmark and a research subject, **not an authority to copy**.

Research happens only where it changes a real build decision, inside the
milestone that makes that decision. Never as a phase before implementation. The
loop is: research the specific decision, inspect what Clervo already has, choose
the stronger approach, build, prove externally, measure, continue.

Areas worth a targeted question when the relevant milestone opens: onboarding,
installation, wallet creation, free first success, catalog structure, model
routing, pricing, x402 payment, discovery, MCP, SDKs, receipts, usage
statistics, programmatic SEO, retention, product expansion.

**Do not copy their branding, source code, unsupported claims, or weaknesses.**
Their observable weaknesses are instructive: a large catalog invites staleness,
reselling a sandbox supplier caps margin, they return results without evidence,
and transaction count says nothing about retained payers.

**Preserve Clervo's differentiation in every milestone:** verified outcomes,
evidence, provenance, accurate cost, receipt integrity, replay safety,
transparent status, and cross-product workflows.

---

## 11. Safety

Permanent. Not subject to milestone order.

**Stop for explicit owner approval before:** a real payment; owner-funded
provider calls beyond an agreed cap; production deployment; DNS changes; secret
changes; IAM changes; infrastructure purchase; destructive operations; any
modification to `/opt/clervo-ai`; any irreversible action.

**Never:** expose secrets, credentials, wallet material, customer payloads, or
authentication files in chat, source, logs, commits, reports, or test output;
fabricate provider results or proof; hide failures; weaken schemas; or claim
preview or unavailable work is production-ready.

Unknown payment or settlement state **fails closed** and is reconciled before
any new authorization or retry.

`ai.clervo.dev` and its model gateway are protected infrastructure. Never stop,
delete, replace, reconfigure, or include them in cleanup without explicit owner
authorization for that exact action.

Treat `/workspace/x402-platform`, older Clervo runtimes, and legacy state as
read-only evidence. Never import, execute, mount, link, or connect them.

**No secret or credential value appears in this file.**

---

## 12. Research register

Open questions with an owner and a deadline. Do these in a browser, not in
expensive agent context. Track C owns items 1–4 from B1 onward.

1. RPC supply — owned node hosting cost per chain versus licensed provider cost.
2. Prediction — derived-output permission under each upstream's current terms.
3. Crypto Intelligence — permitted derived report scope and chain coverage.
4. Written resale terms for the search suppliers.
5. CDP Bazaar resource and indexing granularity — required before B4 payment.
6. MCP directory submission requirements.
7. x402 listing surfaces beyond CDP.
8. Re-verification of the parked supply inventory under the derived-output
   distinction, before any of it is treated as sellable.

---

## 13. What kills this plan

- Writing documents instead of shipping public URLs.
- Believing a local test.
- Mistaking a quote for a working product.
- Letting the blocked products delay the working ones, or accepting them as a
  permanent end state.
- Selling on trial or evaluation licences and losing free supply.
- Listing a route that 404s.
- Hand-editing a status field anywhere.
- Pinning a status value in a test.
- Dropping a route because a probe failed.
- Probing a route with the wrong request shape and publishing a fake outage.
- Letting Bazaar listings idle 30 days without settlement.
- Letting route qualifications expire.
- Optimizing for route count, test count, schema count, or markdown pages.
- Building another authority hierarchy, gate system, or recovery programme.
