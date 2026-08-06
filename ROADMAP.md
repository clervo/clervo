# Clervo Roadmap 0 → 100

**Status:** active and sole authority. Written 2026-08-06.

This file replaces every other planning, gate, authority, ticket, and status
document in this repository. Where this file and any other document disagree,
this file wins. Where this file and observed live behaviour disagree, **live
behaviour wins and this file is corrected.**

Goal: reach BlockRun's league, then pass it. We are not copying BlockRun. We
are copying the parts of their machine that provably work, and beating them on
the parts they cannot easily fix.

---

## 0. Rules that make this roadmap different

These five rules exist because the previous attempts failed for reasons we can
name precisely. They are not style preferences.

### Rule 1 — Code and live behaviour are the only truth

No document asserts product status. Status is observed from the deployed
system and generated into one machine-readable registry. Everything public
renders from that registry. A hand-written status line is a bug.

*Why:* the repository accumulated four mutually contradictory descriptions of
itself. An agent could not decide which was authoritative, so it invented
answers. `AGENTS.md` pointed at a master plan living outside version control in
two diverging copies.

### Rule 2 — A step is done when it is proven from outside

Not when tests pass. Not when a local script prints OK. Not when a private
proof is recorded. **Done means: a public HTTPS URL, reachable from a machine
that has never heard of us, that returns a real result.**

Only we ever spend money to verify a step. A prospective customer must be able
to confirm the product works before creating or funding a wallet.

**"Free to demonstrate" has a strict definition — it is not a giveaway.**

- Free demo paths route **only** to supply that costs us nothing: provider free
  tiers, trial allowances, and idle owned capacity. Never to paid supply.
- Free tier is subject to a hard per-wallet cap and a hard global daily cap.
  There is no automatic paid overage. When a cap is reached the request is
  refused. It is never silently billed to us. This is already declared in
  `ai-free-tier-pricing.v1.json` under `rateGuard`; the roadmap enforces it.
- Where a free execution would cost us real money, **there is no free
  execution.** The public proof is a quote and a dry-run instead: the caller
  sees the exact price, the limits, the runtime identity, and the response
  shape without consuming compute.

| Product | Public proof path | Our cost |
|---|---|---|
| Search | `/v1/search/free` — already live | $0, already capped |
| AI chat | free tier on gpt-oss-120b, gpt-oss-20b, qwen3.6-27b | $0, provider free tier |
| Sandbox | quote and dry-run only, no free execution | $0, no compute consumed |
| RPC, Prediction, Crypto | none until rights are resolved | $0 |

*Why:* the project has one owner-funded 0.006 USDC settlement and zero external
users. Internal proof was mistaken for readiness for months.

### Rule 3 — Suppliers are data, never code

Every product implements one capability contract:
`discover, quote, authorize, execute, receipt, replay, reconcile, status`.

Suppliers are rows in a registry: cost, quality, terms status, limits, health,
region. The router picks at runtime by policy. Adding, removing, or replacing a
supplier is a registry edit — no code change, no redeploy, no migration.

*Why:* this is what stops us creating legacy. A supplier running out of trial
balance, a contract signed in month six, an enterprise deal — all are data
edits. Nothing is ever wired in, so nothing ever has to be torn out.

### Rule 4 — Poor mode until 100 wallets

Phase A supply is free tiers, trial allowances, and owned infrastructure only.
Owner cash target: **$0**. Phase B begins at 100 connected wallets, when real
usage numbers become negotiating material for paid contracts.

Never sell below cost to appear cheap. Free tier is acquisition spend from a
single named, capped pool.

### Rule 5 — Every step carries its own research

Each step below states what to check in the market before building, and what
proves it worked after. No step is "build X." Every step is
**research → build → prove publicly → make discoverable.**

---

## 1. Where we are — measured, not assumed

Established by probing the live system on 2026-08-06, not by reading docs.

### Working and public

| Surface | Evidence |
|---|---|
| `/v1/health` | 200, `paidExecutionEnabled:true`, Postgres durable state |
| `/v1/search/free` | Returns 3 real cited results with authority/freshness scoring |
| Search replay | Same idempotency key returns `replayed:true`, identical operationId |
| `/v1/search/paid` | Valid x402 402, 6000 atomic USDC on Base |
| `/v1/ai/execute` | Valid x402 402, 113 atomic USDC |
| `/v1/sandbox/execute` | Valid x402 402, 120000 atomic USDC |
| Site | `clervo.dev` serves, 32 prerendered routes, WebGL instrument |

### Verified against the CDP x402 Bazaar validator

`POST https://api.cdp.coinbase.com/platform/v2/x402/validate`

| Endpoint | valid | Blocking issue |
|---|---|---|
| `/v1/search/paid` | **true** | none — `simulation.outcome: accepted` |
| `/v1/sandbox/execute` | **true** | none — `simulation.outcome: accepted` |
| `/v1/ai/execute` | **false** | amount 113 below 1000 atomic minimum |

All three carry a complete, valid `extensions.bazaar` block with input and
output JSON Schema. `index: null` on all three — **we are not in the catalog.**

We are already using the CDP facilitator
(`https://api.cdp.coinbase.com/platform/v2/x402`), which is the required
facilitator for Bazaar listing. The x402.org facilitator maintains a separate
catalog and would not list us.

### Broken

| Problem | Evidence |
|---|---|
| Not in x402 Bazaar | `index: null`; indexing triggers on first settled payment |
| AI unlistable | 113 atomic < 1000 minimum required by CDP |
| Free search rejects newcomers | Missing `idempotency-key` returns 400 |
| No model list | `/v1/models`, `/v1/ai/models`, `/models` all 404 |
| No agent discovery | `api.clervo.dev/.well-known/x402` 404, `/llms.txt` 404 |
| Site soft-404 | Any nonexistent URL returns 200 (SPA fallback) |
| Public files lie | `llms.txt` states "not publicly callable" while API takes money |
| `skill.md` / `agent.md` | Return HTML shell, not files |
| Sitemap | 31 URLs; BlockRun has 1834 |
| Unpushed | 37 commits exist only on this disk; backup bundle on same disk |
| Priced above competitor | luna $0.50/$3.00 vs BlockRun $0.20/$1.20, same model id |
| Docs | 165 markdown files, three competing authorities |

### The shelf we are not using

`packages/catalog/ai-model-catalog.v1.json` — **21 routes, every one
`resaleAllowed: true`**, all technically qualified with evidence hashes.
Only 3 are priced and public.

| Supplier | Routes | Kinds |
|---|---|---|
| Clervo AI gateway | luna, terra, sol | chat |
| Google Vertex | gemini 3.6/3.5 flash, 3.5 flash-lite, 3.1 flash image, 3.1 flash-lite image, 3 pro image, embedding-001 | chat, image, embed |
| Cloudflare Workers AI | llama-4-scout-17b, nemotron-3-120b, gpt-oss-120b, gpt-oss-20b, qwen3-30b, aura-2 | chat, speech |
| Groq | gpt-oss-120b, gpt-oss-20b, qwen3.6-27b | chat |
| Deepgram | aura-2-arcas, aura-2-thalia | speech |

**All 21 qualifications expire 2026-08-09.** Three days from writing.

`ai-free-tier-pricing.v1.json` — 15 assets: 3 sellable now (gpt-oss-120b,
gpt-oss-20b, qwen3.6-27b), 10 pending qualification (llama-3.3-70b,
llama-3.1-8b-instant, groq/compound, groq/compound-mini, allam-2-7b Arabic,
orpheus speech ×2, prompt-guard ×2, gpt-oss-safeguard), 2 whisper
integration-pending.

`ai-owned-source-pricing.v1.json` — 612 priced listings across 8 working
services, **owner cash spent $0**. 518 are `terms_blocked` (OpenRouter 337,
NVIDIA 102, SiliconFlow 73), Mistral 52 `evaluation_only`, Cohere 31
`trial_limit`, Cerebras 3 `no_balance`.

**Total sellable with zero permission asked and zero dollars: ~36 models.**
We list 3.

### Commercially blocked, not broken

| Product | Routes | Status |
|---|---|---|
| RPC | 46 | 33 `priced_terms_blocked`, 13 `blocked`. Zero sellable. |
| Prediction | 5 | all `terms_blocked` |
| Crypto Intelligence | 5 | all `terms_blocked` |

This is not an engineering gap. No amount of building closes it.

### Search economics

`supply.serper` costs $0.001/call. `supply.brave_search` costs $0.005/call.
We charge $0.006. Routing preference is worth 5× gross margin and is a config
value.

---

## 2. The competitor, reverse engineered

BlockRun: 14M+ settled transactions, 90 models live at
`blockrun.ai/api/v1/models`.

### Their machine

```
discovery surface → one-command install → auto local wallet
→ free first success → visible catalog → fund same wallet
→ pay per call → routing + fallback → local usage proof → repeat
```

### Their discovery surfaces, all confirmed live

- `/.well-known/x402` — resource manifest, ~100 operations
- `/llms.txt` — full API reference written for LLMs to cite
- `/skill.md` + `/agent.md` — one-time installers for agent clients
- `/claude-code-plugin` — direct Claude Code channel
- Programmatic SEO: `/markets/{country}/{ticker}` ≈1700 pages,
  `/services/{partner}`, `/vs-{competitor}`, `/free-{model}`
- Schema.org JSON-LD Organization + SoftwareSourceCode on homepage
- 1834 sitemap URLs

### Their real insight

Agents cannot create accounts or enter credit cards. Agents can sign
transactions. Therefore a wallet becomes identity, authentication, payment,
and budget control simultaneously. That is stronger than "we aggregate APIs."

### Where they are weak

1. **90 models is a liability.** Breadth invites staleness. A listed route that
   fails costs more trust than a small honest catalog.
2. **They resell Modal for sandbox.** Their margin is capped by a supplier.
3. **No verification layer.** They return results. They do not return evidence,
   provenance, and a replay-safe receipt.
4. **Transaction count is not customers.** 14M settled transactions says
   nothing about retained paying wallets.

### Our position

> One wallet for **verified** outcomes across Search, AI, Sandbox, RPC,
> Prediction, and Crypto Intelligence — with evidence, cost, and a
> replay-safe receipt.

We sell provability. They sell access. Every product we ship must return
something they structurally cannot: evidence bound to the result.

---

## 3. The roadmap

Each step: **research → build → prove publicly → make discoverable.**
Do not start a step before the previous step's public proof exists.

---

### STEP 1 — Stop the total-loss risk

**Research:** none.

**Build:**
- Push 37 commits to `origin/main`.
- Move `/workspace/handoffs/clervo-next-pre-recovery-20260805.bundle` off this
  disk.

**Prove:** `git log origin/main` shows `b21ee74`. Backup exists elsewhere.

**Why first:** every launch commit and its backup are on one drive. One
hardware failure ends the company. Cost: one command.

---

### STEP 2 — Establish single truth

**Research:** list every file asserting product status.
Known: `AI_BUILDER.md`, `platform-registry.v1.json`,
`release-candidate-freeze.v1.json`, `CURRENT-ENGINEERING-STATE.md`,
`generated/public/*`, `full-platform-readiness.v1.json`.

**Build:**
- `packages/catalog/live-registry.json`, generated by probing the deployed
  system — never hand-edited. Records per product: lifecycle, routes, prices,
  supplier terms status, health, public reachability.
- Every public surface renders from it: site copy, `catalog.json`,
  `pricing.json`, `status.json`, `llms.txt`, `.well-known/*`, OpenAPI, SDK,
  MCP.
- CI fails when any public file disagrees with the registry.
- Move all 165 markdown files to `docs/archive/`. **Nothing is deleted.** They
  are kept as a research and history library — supplier findings, terms
  research, competitor notes, past design reasoning. That knowledge was paid
  for and stays readable.
  What archiving removes is **authority**, not information. An archived file
  may not assert current product status, readiness, gates, rules, or
  authorization. Anything in an archived file that contradicts the live
  registry is history, not instruction.
  Add `docs/archive/README.md` stating exactly that, so a future agent reading
  one of those files cannot mistake it for a live directive.
  Keep active at root: `README.md`, `AGENTS.md` (short operating rules only),
  `ROADMAP.md` (this file), `docs/OPERATIONS.md`.
- Delete the external master-plan reference from `AGENTS.md`. Copy anything
  still valuable into this file first.

**Prove:** regenerate all public artifacts; every claim traces to observed
state. No file says "unavailable" for a product that takes money. Every
archived file is still readable and still in git history.

---

### STEP 3 — Open the front door

**Research:** how BlockRun's free tier converts. Confirmed: `/free` plus
`/free-{model}` pages, no wallet, no key, no account.

**Build:**
- **Free search accepts a naive request.** Generate `idempotency-key`
  server-side when absent. Currently a first-time caller gets 400 and leaves.
- Fix site soft-404. `not_found_handling: single-page-application` in
  `apps/site/wrangler.jsonc` returns 200 for every URL. Google will not index a
  site that answers yes to everything. **This must land before any SEO work or
  the SEO is wasted.**
- Serve `skill.md` and `agent.md` as real files, not the SPA shell.

**Prove:** from a clean machine, one curl with no headers returns cited
results. A nonexistent URL returns 404.

---

### STEP 4 — Become findable by agents

**Research (done, recorded here):**
- CDP facilitator is required for Bazaar listing — we already use it.
- There is no registration form and no fee.
- Indexing triggers on the **first successfully settled payment** through the
  CDP facilitator.
- Minimum amount is **1000 atomic units** ($0.001).
- Descriptions must be ≤500 characters or verify/settle is rejected.
- Declared `input` must validate against `schema.properties.input`.
- Quality ranking recomputes every 6 hours.
- **Resources idle 30 days without a settlement are dropped from the catalog.**
- Validator: `POST https://api.cdp.coinbase.com/platform/v2/x402/validate`

**Build:**
- **Raise AI price above the 1000 atomic minimum.** At 113 it is permanently
  unlistable. This is the single blocking defect on AI discovery.
- Serve `/.well-known/x402` on `api.clervo.dev` — currently 404. The manifest
  content already exists inside our 402 bodies; serve it at the discovery path.
- Serve `/llms.txt` on `api.clervo.dev` — full API reference, BlockRun-style.
- Re-validate all three endpoints until `valid: true`.
- Settle one minimum payment per endpoint to trigger indexing.
- Add a keepalive settlement per listed resource inside 30 days, or we are
  silently dropped.

**Prove:** validator returns `valid: true` and `index` non-null for every paid
route. Our resources appear in `GET /v2/x402/discovery/resources`.

**Note:** search and sandbox already pass validation today. AI is one price
change away.

---

### STEP 5 — Unshelve the AI catalog

**Research:** fetch `blockrun.ai/api/v1/models` — public, unauthenticated.
Compare model-for-model against our 21 qualified routes.

**Build:**
- **Requalify all 21 routes before 2026-08-09.** Evidence expires in three
  days. Automate requalification on a schedule so this never recurs.
- Qualify the 12 pending free-tier assets — no permission needed, only work.
- `GET /v1/models` — free, unauthenticated, OpenAI-shaped so existing clients
  work unmodified. Currently 404.
- Price every qualified route. ~36 models, not 3.
- **Automated daily competitor price sync.** Build fails if we exceed BlockRun
  on a matched model id. Today luna is $0.50/$3.00 against their $0.20/$1.20.
- Set `positiveMarginRequiredAtLaunch: true`, with one named capped subsidy
  pool for free tier.
- Free chat tier on gpt-oss-120b / gpt-oss-20b / qwen3.6-27b. Hard per-wallet
  and global daily caps. No paid overage.
- Fallback chains where two suppliers serve the same model — Groq and
  Cloudflare both serve gpt-oss.
- Keep `providerNamesPublic: false`. Terms are `restricted`: sell freely,
  do not publicly name which provider backs which route.

**Prove:** `/v1/models` lists ~36 models; every one returns a real completion;
no listed route 404s.

**On the 518 `terms_blocked` listings:** use them internally for benchmarking,
routing development, and quality measurement — an evaluation licence permits
evaluation. Do not sell them. Our entire supply is free tiers and trials; a
terminated account costs us the model, the supply, and possibly other routes
on the same account. They stay parked and pre-priced. At 100 wallets we sign
contracts and they flip on as **registry rows, not code**.

---

### STEP 6 — Harden the three live products

**Research:** what BlockRun returns per call vs what we return. Their gap is
evidence.

**Search (85 → 100):**
- Pin serper-first routing — 6× margin vs brave.
- Confirm supplier resale terms in writing.
- Sell verification: citations + evidence + replay-safe receipt.

**AI (40 → 100):**
- Steps 4 and 5 complete most of this.
- Streaming, usage accounting, visible fallback history.
- Exact model identity — never silently substitute.

**Sandbox (70 → 100):**
- **Our structural win: we own gVisor/GKE. BlockRun resells Modal.** Their
  margin is supplier-capped; ours is not.
- Add a sub-cent short-run class without weakening resource ceilings.
- Position: verify the code your agent wrote, in a runtime we operate.

**Prove:** each product returns a useful result plus a receipt naming route,
cost, evidence, and replay state. Retry never double-charges.

---

### STEP 7 — Unblock the three dead products

Runs in parallel from Step 1. Blocks nothing.

**Research per product:**
- **RPC:** cost of owned Base + Ethereum nodes. Two chains we own beat 40 we
  cannot sell.
- **Crypto Intelligence:** re-read every terms document for the distinction
  between *raw pass-through* (usually forbidden) and *derived value-added
  output* (often permitted). Our catalog already prices this way —
  `crypto.report` sits above raw lookups.
- **Prediction:** same distinction. Comparison, disagreement, and uncertainty
  across markets is our output, not their feed.

**Build:** only terms-compatible routes. Derived output only, never raw echo.

**Prove:** each product has a recorded supplier, written commercial authority,
allowed operations, retention policy, price basis, and hard stop.

---

### STEP 8 — Discovery hardening

**Research:** every place an agent or crawler could find us. Audit each against
what we serve.

**Build:**
- Audit code behind every discovery surface — no surface may assert anything
  not in the live registry.
- Sitemap 31 → several hundred, generated from real product and model pages.
- Schema.org JSON-LD on the homepage.
- MCP directory submissions.
- x402 ecosystem listings.
- `llms.txt` and `llms-full.txt`.
- RSS changelog.

**Prove:** every discovery surface returns current truth. Nonexistent routes
404. Every listed operation is callable.

---

### STEP 9 — The website

Last, because it renders from everything above.

**Requirement: the site hides nothing.** Blocked products are shown as blocked.
Prices are shown. Failures are shown. Evidence is linkable. A
visible-but-uncallable route costs more trust than a small honest catalog.

**Build:** templates rendering from the live registry —
6 product pages, ~36 model pages, `/free-{model}` pages, `/compare/*` dated
with methodology, `/pricing`, `/status`, `/receipts`, `/docs/quickstart`.

Owner supplies the visual direction. Page prose is drafted externally (GPT in
browser) and pasted in — do not spend expensive tokens on near-identical
marketing copy.

**Prove:** every page's factual content traces to the registry. No page
contains a hand-written status claim.

---

### STEP 10 — ClervoRouter

Only after four products are public, honest, and discoverable.

One local runtime: install, local wallet (BIP-39, restrictive permissions,
backup and recovery, refuse to silently replace a funded wallet), balance,
live catalog, spend limits, x402 signing, idempotency, replay handling,
reconciliation, routing and fallback, local receipts and stats, `doctor`,
CLI, MCP with per-family profiles, OpenAI-compatible proxy.

**Prove:** from a clean machine — install, wallet created, catalog loaded,
free operation succeeds, fund wallet, paid operation succeeds, receipt correct,
retry does not double-charge, `doctor` detects a broken config.

---

## 4. Milestones

| # | Milestone | Test |
|---|---|---|
| 1 | Not one-disk-fatal | `origin/main` current, backup off-disk |
| 2 | One truth | All public files generated from live registry |
| 3 | Front door open | Naive curl works; 404s are 404s |
| 4 | In the Bazaar | `index` non-null for every paid route |
| 5 | Catalog unshelved | `/v1/models` lists ~36, all callable |
| 6 | Priced to win | No model above BlockRun on matched id |
| 7 | **First external wallet** | Someone we did not ask pays once |
| 8 | 10 wallets | Repeat usage visible |
| 9 | **100 wallets** | Phase B — negotiate paid supply |
| 10 | Six products | All six sellable or honestly marked |

---

## 5. Metrics

Track the funnel, not the volume:

```
discovery impression → docs visit → install → wallet created
→ free first success → wallet funded → first paid outcome
→ second paid outcome → 7-day repeat → 30-day retained payer
→ second product used
```

Never report alone: transaction count, catalog size, test count, schema count,
markdown pages.

---

## 6. Research register

Open questions. Each needs a decision, an owner, and a deadline — no
open-ended loops. Do these in the browser, not in expensive agent context.

1. Terms review of the 518 blocked listings under the derived-output
   distinction.
2. Owned Base + Ethereum node hosting cost.
3. x402 directory and bazaar listing surfaces beyond CDP.
4. MCP directory submission requirements.
5. BlockRun's programmatic SEO page structure, for volume modelling.
6. Supplier resale terms in writing for serper and brave.

---

## 7. What kills this plan

- Writing documents instead of shipping public URLs.
- Believing a local test.
- Letting the blocked three delay the working three.
- Selling on trial or evaluation licences and losing free supply.
- Listing a route that 404s.
- Hand-editing a status field anywhere.
- Letting Bazaar listings idle 30 days without settlement.
- Letting route qualifications expire — the current set dies 2026-08-09.
