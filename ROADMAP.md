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
| Current milestone | **B2 — Front door open** |
| Milestone status | `built_awaiting_deploy` — B1 is `externally_verified` (deployed 2026-08-06 from `e4a281b`). B2 is code-complete at `0555c83` with acceptance green; both B2 field 12 proofs still fail against the live deployment because the fixes are not deployed. |
| Current branch | `main` |
| Latest commit | `0555c83` — `feat(front-door): make the first call succeed with no headers and 404 real` |
| Current production release | Site worker `clervo-site-production` version `2437daaa-e049-472b-9d89-41a1c81056a0`; API edge worker `clervo-api-edge-production` version `99f96564-3824-47d5-b8a5-a84783e6e5cb`; Cloud Run origin `e23264a52c0c2a0254d19ff8062437b05ce1bad8` unchanged behind them. |
| Rollback targets | Site `aed2cb42-aedf-4479-be66-78649f7f9eb9`; API edge `4ee82dea-bc76-4f03-9184-35ab281233ef`. Roll back with `npx wrangler rollback <version> --config apps/site/wrangler.jsonc` or `apps/worker/wrangler.jsonc`. |
| Latest externally verified customer outcome | `/v1/search/free` returns real cited results to an unauthenticated caller that supplies an `idempotency-key`, and a repeated key replays the identical `searchResponse` with `replayed: true` and no second execution. Proof level `externally_repeated`. Nothing else has reached `paid_outcome_verified`. |
| Current blockers | B2 cannot be verified without a production deploy of the API edge worker, the Cloud Run origin, and the site. Until that deploy the two conformance defects stay open in the registry: `/v1/search/free` returns 400 without a caller-supplied `idempotency-key`, and `clervo.dev` returns 200 for a nonexistent URL. |
| External dependencies | Bazaar settlements (owner funds); Prediction terms decision; Crypto resale scope; RPC supply; gateway funding. |
| Owner approvals waiting | **Production deploy of the API edge worker, the Cloud Run search origin, and the site** (B2 field 15). Nothing else in B2 is blocked. |
| Dates that move on their own | **2026-08-09** — `ai.clervo.dev` funding resumes, and all 21 AI route qualifications expire, same day. **30 days after any Bazaar listing** — a resource with no settlement in that window is dropped from the CDP catalog. |
| B1 metrics baseline (observed 2026-08-06T11:40:50.003Z) | Live products 3 of 6; live AI routes 18 of 21; supply-paused AI routes 3; AI routes quoting below the Bazaar 1000-atomic minimum 18; conformance defects open 2 (`api.search_free_accepts_naive_request`, `site.not_found_is_404`). |
| Exact next task | Deploy `0555c83` to production, then re-run `scripts/probe-live-registry.mjs` so both conformance checks record as conformant, regenerate the public surfaces so the published curl drops its `idempotency-key` line, and verify the two B2 field 12 proofs from an unrelated machine. |
| Files and services for that task | Cloud Run service (free-search handler), `clervo-api-edge-production`, `clervo-site-production`; then `scripts/probe-live-registry.mjs`, `scripts/generate-discovery.mjs`, `scripts/site/prepare-public.mjs`. |

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
2. **Status:** `built_awaiting_deploy` — all work in field 8 is implemented and
   the acceptance run is green at `0555c83`. Field 12 is unproven until the
   production deploy in field 15 is approved and applied.
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
2. **Status:** `not_started`
3. **Customer-visible outcome:** An agent that has never seen Clervo can find
   the operation list, the model list, and the payment manifest without human
   help.
4. **Why it matters commercially:** Agents are the buyer. They cannot open
   accounts or read marketing pages; they read discovery documents. Without
   these paths Clervo is invisible to its actual customer.
5. **Preserve:** The existing `DISCOVERY_DOCUMENTS` map in
   `apps/worker/src/api-edge.js` and the eight documents it already serves
   correctly; the `extensions.bazaar` blocks already present in the 402 bodies.
6. **Current evidence:** `api.clervo.dev/.well-known/x402`, `/llms.txt`, and
   `/v1/models` all 404. The x402 manifest content already exists inside the 402
   bodies; it is simply not served at a discovery path.
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
2. **Status:** `not_started`
3. **Customer-visible outcome:** Clervo resources are findable in the CDP x402
   Bazaar, so agents discover them without ever visiting our site.
4. **Why it matters commercially:** This is the largest single distribution
   channel for x402 commerce and it is free to enter. Indexing triggers on
   settled payment, which also produces our first `paid_outcome_verified` proof.
5. **Preserve:** Existing prices where they clear the minimum; the CDP
   facilitator configuration; the valid `extensions.bazaar` blocks; the payment
   binding and idempotency guarantees.
6. **Current evidence:** Search and Sandbox validate `true`. `index: null` on
   all resources. 15 of 18 live AI routes quote below 1000 atomic; only the
   three image routes clear it.
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
16. **Stopping condition:** `index` non-null for every resource we chose to
    list, and at least one route at `paid_outcome_verified`. Records **R2**.
17. **Continuation point:** Open B5. First task there: inventory the shared
    surface across the six `x402-paid-*.mjs` handlers.

---

### B5 — Shared commerce core

1. **Milestone:** B5 — Shared commerce core
2. **Status:** `not_started`
3. **Customer-visible outcome:** Payment, receipt, replay, and retry behave
   identically on every product, so a customer learns them once.
4. **Why it matters commercially:** Three products are about to be switched on.
   Without this, each arrives with its own copy of the money path and its own
   opportunity to lose a payment. Consistency here is what makes multi-product
   usage possible later.
5. **Preserve:** **All existing payment semantics exactly.** The six handlers
   are correct. This milestone changes where the logic lives, never what it
   does. No guarantee may be weakened to simplify the extraction.
6. **Current evidence:** `apps/api/src/x402-paid-search.mjs`,
   `-ai.mjs`, `-sandbox.mjs`, `-rpc.mjs`, `-prediction.mjs`, `-crypto.mjs` each
   implement quote, authorize, idempotency, replay, receipt, and reconciliation
   separately.
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
16. **Stopping condition:** All six products route through one core, all payment
    tests pass, and external behaviour is unchanged.
17. **Continuation point:** Open B6. First task there: choose the client
    distribution channel from the B6 research question.

---

### B6 — Clervo Connect v0

1. **Milestone:** B6 — Clervo Connect v0
2. **Status:** `not_started`
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
6. **Current evidence:** No client exists. Payment currently requires the caller
   to construct and sign the `PAYMENT-SIGNATURE` header themselves.
7. **Research:** BlockRun's install, wallet creation, and free-first-success
   path — what the one command is, what it creates on disk, and where the free
   success happens relative to funding. One question, answered before choosing
   our distribution channel and wallet layout.
8. **Work:** One local runtime: install, local wallet with restrictive file
   permissions, balance, live catalog from the registry, x402 signing,
   idempotency, replay handling, spend limits, local receipts, and `doctor`.
   **The wallet must refuse to silently replace a funded wallet.** Backup and
   recovery is required before any wallet can hold funds — it is not deferred to
   B11.
9. **Dependencies:** B5.
10. **Parallel:** Track C continues; Track D prepares the B12 page templates.
11. **Launch-critical tests:** wallet creation is not destructive; keys are
    written with restrictive permissions and never logged; spend limits are
    enforced client-side and server-side; retry does not double-charge; replay
    returns the same operation; `doctor` detects a broken configuration.
12. **External acceptance proof:** The full clean-machine sequence in field 3,
    performed on a machine that has never contacted us, ending with a correct
    receipt and a retry that does not double-charge.
13. **Visibility shipped:** Install instructions on the site and in `llms.txt`;
    package published to its registry; quick start updated.
14. **Metrics:** Installs; wallets created; free first success; wallet funded;
    first paid outcome. This is the funnel's spine.
15. **Owner approval:** Package registry publish; production deploy; any funded
    test wallet.
16. **Stopping condition:** The clean-machine sequence passes end to end from
    outside.
17. **Continuation point:** Open B7. First task there: requalify routes and
    re-verify which supply is commercially permitted.

---

### B7 — AI catalog unshelved

1. **Milestone:** B7 — AI catalog unshelved
2. **Status:** `not_started`
3. **Customer-visible outcome:** **Every freshly verified, commercially
   permitted AI route is accurately priced, genuinely callable, publicly
   discoverable, and continuously monitored. Catalog size is determined by
   verified supply, not by a fixed target.**
4. **Why it matters commercially:** AI is the highest-volume family and the one
   customers comparison-shop. Breadth is only an asset when every listed route
   works; a listed route that fails costs more trust than a small honest
   catalog.
5. **Preserve:** `packages/catalog/ai-model-catalog.v1.json` and its evidence
   hashes; `ai-free-tier-pricing.v1.json` and its `rateGuard`;
   `providerNamesPublic: false` — terms are `restricted`, so we may sell but not
   publicly name which provider backs which route.
6. **Current evidence:** 21 routes catalogued, 18 live, 3 paused until
   2026-08-09. All 21 qualifications expire 2026-08-09. A separate inventory
   records further assets pending qualification and a large body of listings
   marked `terms_blocked`, `evaluation_only`, `trial_limit`, or `no_balance` —
   **all of those counts require re-verification in this milestone before any
   of them is treated as sellable.**
7. **Research:** A published competitor model list and its prices, fetched
   directly, compared model-for-model against our verified routes. One question:
   where are we above a competitor on a matched model id.
8. **Work:** Requalify every route before the expiry date; **requalify the three
   gateway routes only after funding lands, never before** — an unfunded account
   is indistinguishable from a dead route in the evidence. Automate
   requalification on a schedule so an expiry never again arrives unnoticed.
   Re-verify commercial permission per route and record the basis. Qualify the
   pending free-tier assets. Price every verified permitted route with positive
   margin. Add fallback chains where two suppliers serve the same model. Free
   chat tier only on zero-cost supply, hard per-wallet and global daily caps, no
   paid overage. Continuous route health monitoring feeding the registry.
9. **Dependencies:** B3 (`/v1/models`); B4 (pricing floor); gateway funding for
   three routes.
10. **Parallel:** Track C; Track E owns the requalification schedule from here.
11. **Launch-critical tests:** exact supplier and model identity — never
    silently substitute; no listed route 404s; free-tier cap refuses rather than
    billing; fallback records which route actually served; no test pins a route
    count.
12. **External acceptance proof:** From outside, every route `/v1/models` lists
    returns a real result in its own modality, and the registry's live route set
    equals the callable set with zero drift.
13. **Visibility shipped:** `/v1/models`; per-model pages; pricing; status
    including `supply_paused` routes with reason and expected return date.
14. **Metrics:** Verified permitted routes; callable rate; route health; margin
    per route; free-tier consumption against cap.
15. **Owner approval:** Gateway funding; production deploy; any paid supply
    commitment.
16. **Stopping condition:** Every route the registry marks `live` is callable in
    its declared modality, priced with positive margin, publicly discoverable,
    and monitored. **No count is asserted; the registry reports the number.**
17. **Continuation point:** Open B8. First task there: confirm the Prediction
    commercial basis from Track C.

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
