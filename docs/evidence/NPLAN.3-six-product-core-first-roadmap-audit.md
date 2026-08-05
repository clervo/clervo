> **Historical restoration notice (Gate 4.5):** This file preserves earlier
> project history at its original path. Its original status and instructions
> below are historical metadata only. It is not part of the active authority
> chain and cannot authorize work. The Gate 4.5 six-family correction controls
> every conflict.

# NPLAN.3 six-product core-first roadmap audit evidence

- Evaluated: 2026-08-01
- Starting commit: `5a34e4de12aff85c9d25f49abe19084e92e82572`
- Final commit: the commit containing this evidence
- Authority effect: forward roadmap and versioned release-scope synchronization
- Runtime/Search behavior: unchanged
- Current lifecycle: Search `preview`; AI, Sandbox, RPC, Prediction, and Crypto
  Intelligence `unavailable`
- Product-core and First Revenue Release ready: false / false
- Stage 4 blockers before/after: 5 / 5
- Search reference pattern and Stage 5 authorization: false / false
- N4.27T: owner-authorized under its recorded scope, paused before
  implementation, not widened or executed
- Cloud/IAM/deployment/provider/payment/production/legacy effects: none
- Provider/infrastructure cost: USD 0.000000
- USDC: 0 spent; 0.03 reserve untouched
- Secrets, credentials, wallet material, customer payloads: none inspected,
  used, or printed
- Sealed/frozen benchmark contents: not inspected, modified, rerun, or used for
  tuning

## Audit method and boundary

The audit read the controlling authority, current handoff, active product and
positioning sources, package/service/app/infra structure, contract/discovery
code, generated public preview structure, and path-limited Git history. It did
not execute a benchmark, browser, product route, provider, cloud command,
payment path, or legacy code/data plane.

Completed decisions, tickets, evidence, scores, failures, costs, deployment
records, and prior journal entries remain historical. NPLAN.1 and NPLAN.2 are
not rewritten; NPLAN.3 supersedes only their future release/stage authority.

## Current-state standards preflight

The planning preflight used current primary documentation:

- OpenAPI 3.1 reusable components and JSON Schema references:
  <https://spec.openapis.org/oas/v3.1.0.html>;
- JSON Schema Draft 2020-12 schema resources, `$id`, and `$ref`:
  <https://json-schema.org/draft/2020-12/json-schema-core>;
- MCP tool input/output JSON Schema contracts:
  <https://modelcontextprotocol.io/specification/2025-06-18/server/tools>;
- Google Search structured-data guidance, including visible-page truth and
  JSON-LD maintenance:
  <https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data>;
- Google Search sitemap scope:
  <https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview>.

These sources support reusable schema/component projection, schema-bound MCP
tools, and generating structured discovery from visible product truth. They do
not make an unavailable product discoverable, indexed, ranked, or recommended.
The calls were read-only, unauthenticated official-documentation access with no
billable product-provider action.

## Six-product implementation inventory

| Product core | Machine-declared identities | Repository truth |
| --- | --- | --- |
| Live Intelligence / Search | `search.web`, `search.answer`, `web.fetch`, `web.extract` | Only implemented foundation. Search contracts, schemas, service, adapters, HTTP routes, mock prices/commerce, monitoring, and preview discovery exist. Live Intelligence compare, customer monitoring, changes, alerts, and full productization remain unimplemented. |
| AI | `ai.chat`, `ai.embed`, `ai.image`, `ai.speech` | `services/ai` is empty; unavailable and unqualified. |
| Secure Sandbox | five `sandbox.*` IDs | `services/sandbox` is empty; unavailable and unqualified. |
| RPC | five `rpc.*` IDs | `services/rpc` is empty; unavailable and unqualified. |
| Prediction | five `prediction.*` IDs | `services/prediction` is empty; unavailable and unqualified. |
| Crypto Intelligence | five `crypto.*` IDs | `services/crypto-intelligence` is empty; unavailable and unqualified. |

The master plan also names `research.report`, AI aliases, and conditional
capabilities not yet reconciled with machine scope. Product, capability,
operation, endpoint, route, and SKU concepts are not yet consistently separated.
Stage 5's registry-foundation work must settle that ontology without changing
stable IDs silently.

## Shared-platform inventory

| Surface | Repository truth |
| --- | --- |
| Wire contracts | 43 Draft 2020-12 source schemas, fixtures, TypeScript contracts, runtime assertions, and deterministic canonicalization under `packages/contracts`. JSON Schema, TypeScript, and semantic validators remain separately maintained. |
| Catalog | `packages/catalog` is empty. A generic `CatalogEntry` type/schema exists, but no conforming registry exists. |
| Generated catalog | `generated/public/catalog.json` reuses Search discovery-product records with `implemented_unverified`; those records omit required `CatalogEntry` identity, capabilities, schema links, adapters, terms, retention, and update fields. |
| Discovery/OpenAPI | `generate-discovery.mjs` deterministically emits OpenAPI, catalog, `/.well-known`, `llms.txt`, and schema copies. `discovery.ts` directly imports Search routes, IDs, selection, and prices; every source schema is currently copied/embedded regardless of public reachability. |
| Commerce/routing/observability | Intended shared package directories are empty. Current mock commerce, routing, and observability primitives live under contracts or Search wiring. |
| Worker | `apps/worker` is empty; no durable cross-product execution plane exists. |
| SDK/MCP | `packages/sdk-typescript`, `packages/sdk-python`, and `packages/mcp` are empty. |
| Site/design | `apps/site` has prototype Markdown and scope JSON only. There is no site runtime, component system, semantic token source, responsive/accessibility/reduced-motion implementation, product page, or release visual QA. |
| SEO/GEO/LLM | Preview `llms.txt` exists. JSON-LD, sitemap, robots/canonical policy, and task-oriented SEO/GEO/LLM page generation do not exist. |
| Public docs/status/legal | No production product, pricing, benchmark, public status/incident, security, legal, changelog, quickstart, example, or documentation pages exist. |
| Onboarding | The journey/recovery contract is prose only; no published client, wallet flow, payment automation, clean-environment suite, or implemented recovery path exists. |
| Deployment | Environment descriptors and ticket-specific qualification/deployment material exist, but no reusable six-product release topology or full-platform IaC exists. |

## Repetition and drift evidence

Path-limited history returned 22 commits touching `generated/public`, 23
touching source schemas, and four touching the audited site/builder/brand/
marketing set. The 22 generated-output changes are mechanical projection churn,
not 22 public releases. The design/site/SEO system has not been repeatedly
implemented—it has not been implemented at all—but lifecycle and narrative
copy has already drifted across repeated prose and site JSON.

Concrete pre-amendment drift included a README ending at N4.27/N4.27R and
prototype copy reporting ten Stage 4 blockers after N4.27S had recorded five.
The existing regex-only consistency check did not catch those stale claims.

Additional structural risks:

1. TypeScript types/runtime assertions and JSON Schemas are hand-maintained
   separately without general acceptance-equivalence proof.
2. Product scope was copied into `apps/site/capability-scope.json` and several
   prose files rather than projected from a registry.
3. Search prices/routes are product-specific constants rather than catalog
   entries consumed by generic transport and generators.
4. OpenAPI exposes internal benchmark/qualification/supply schemas that are not
   reachable public wire shapes; public/internal/sealed visibility is absent.
5. CI generates discovery but does not fail when generation leaves a dirty
   diff, and current type/lint coverage omits much app/infra JavaScript and all
   future site/SDK/MCP surfaces.
6. Ticket-specific deployment definitions have repeated because no reusable
   release topology exists; historical qualification infra must not be
   rewritten into production evidence.

## Source-of-truth decision

NPLAN.3 assigns one source per class of truth:

1. master plan and canonical launch authority for stage/order/product meaning;
2. versioned JSON Schema for wire structure, with generated language models
   where practical and semantic conformance tested against schemas;
3. a real platform registry for pillar → capability → operation → product/SKU,
   schema refs, routes, delivery/access modes, lifecycle, qualification, public
   visibility, price versions, ceilings, and terms;
4. approved public-evidence manifests referencing immutable evidence hashes;
5. separate redacted runtime status/incident truth;
6. one semantic design-token source; and
7. reviewed human narrative, evidence interpretation, and legal policy.

Stage 13 projects those sources into API routing, OpenAPI, catalog, discovery,
MCP, SDKs, examples, site facts, JSON-LD, sitemaps, robots/canonical metadata,
SEO/GEO/LLM pages, packages, and x402 discovery. Public generators never scan
sealed corpora or raw qualification directories.

## Forward stage transition

| NPLAN.2 forward stage | NPLAN.3 authoritative stage |
| --- | --- |
| 5 — Live Intelligence productization | 5 — Live Intelligence productization and platform-registry foundation |
| 6 — Live Intelligence access/onboarding/distribution | 6 — AI product core |
| 7 — Live Intelligence hardening/deployment | 7 — Secure Sandbox product core |
| 8 — Bounded real x402 proof | 8 — Universal multi-chain RPC product core |
| 9 — External paid Live Intelligence launch | 9 — Prediction-market Intelligence product core |
| 10 — AI supply/reasoning | 10 — Crypto Intelligence product core |
| 11 — Secure Sandbox | 11 — Combined workflows and private six-product stabilization |
| 12 — Combined workflows | 12 — Cross-pillar contract and product-core freeze |
| 13 — RPC expansion | 13 — Shared access, design, onboarding, and distribution |
| 14 — Prediction expansion | 14 — Full-platform production hardening and deployment |
| 15 — Crypto expansion | 15 — Bounded real x402 settlement proof |
| 16 — Full Platform Expansion verification | 16 — External paid result and First Revenue Release |

Stage 13 may be split into bounded tickets but is one shared system consuming
the same freeze. No product core is redesigned there.

## Versioned scope synchronization

- Scope/discovery version moved from `2026-07-31.2` to `2026-08-01.3`.
- Umbrella release moved from `clervo.live_intelligence` to `clervo.platform`.
- First Revenue Release now requires the unchanged six pillar IDs.
- `productCore` replaces `fullPlatformExpansion` and requires all six
  `coreQualified` values plus frozen interfaces and verified compatibility.
- First Revenue Release adds nine exact post-core shared proofs and all-six
  public availability.
- Search remains `preview`; the other five become conservatively
  `unavailable` rather than post-launch; all qualifications/readiness remain
  false.
- Existing capability IDs remain unchanged.
- Generated artifacts remain a truthful repository-local Search preview, not a
  full-platform/public/payment/deployment claim.

## Accidental canonical-acceptance incident

An audit helper attempted a text-presence check using a double-quoted shell
argument containing Markdown backticks around `npm test`. Shell command
substitution unintentionally invoked the canonical acceptance once. Retained
output was exactly:

```text
acceptance: FAIL at typecheck (exit 1)
```

The worktree contained concurrent incomplete NPLAN.3 type changes. Acceptance
order proves lint ran before typecheck, then stopped. Clean-room, environment,
secret, build, discovery generation, Stage 4 verifier, and contract-test gates
after typecheck did not run. The canonical suite was not rerun. This process
failure is preserved and does not alter Stage 4 evidence.

## Validation

Canonical `npm test` was not rerun and the Stage 4 verifier remained
unexecuted by NPLAN.3 after the accidental incident recorded above.

- Decision SHA-256:
  `1ddf058d8ee7b9d75ab8d238e5cd30784a49fc110a8a511c8deebb726f07a910`
- Ticket SHA-256:
  `512372d3089415c928389fd71d2cf16ce45e2a99353bc4032e6fc58502cfcc4d`
- External master-plan SHA-256:
  `509679046a834a75b28f6f004f4b7ddbd369d40053e9efe04d0caeb2eea43a4a`
- `npm run typecheck`: passed under Node.js 24.18.1.
- `npm run lint`: passed across 257 source/contract files.
- `npm run contracts`: passed 43 schemas / 81 fixtures.
- `npm run test:n1.3`: passed 6/6 after deterministic generation of 43
  schemas.
- `npm run test:nplan.1`: first focused run passed the preserved-history test
  and failed one stale assertion that still expected NPLAN.2 to be current;
  the assertion was synchronized to NPLAN.3 and the rerun passed 2/2.
- `npm run test:nplan.2`: passed 2/2, preserving the NPLAN.2 ticket/evidence as
  history and recognizing only its forward supersession.
- `npm run test:nplan.3`: passed 5/5, including six-pillar identity, core and
  release fail-closed gates, false-live rejection, and exact Stage 5–16 order.
- `npm run verify:product-scope`: passed.
- `npm run scan:secrets`: passed working tree and committed history; zero
  secret values printed.
- `npm run verify:boundary`: passed with zero legacy runtime dependencies.
- JSON parsing for the site scope, source product-scope schema, and both
  fixtures: passed.
- Exact Stage 5–16 comparison: passed with 12 unique, contiguous, identically
  titled master-plan and repository-authority stages.
- Active-authority contradiction scan: passed across 11 active/generated
  positioning files with no Search-only launch, post-launch initial-pillar, or
  superseded stage claim.
- Discovery determinism: a second generation produced identical SHA-256 hashes
  for OpenAPI, catalog, `/.well-known`, `llms.txt`, and the copied product-scope
  schema. The hashes were respectively
  `5ce221d1aa3bfd4cbb623847de9ef9657d12733c4845b03ca7e76f2059c4b282`,
  `fb79e6743d723c868934623b244729ae68d6cee1395f8a1eb8c7fe352f2d092e`,
  `c57a53e3bc444e52e23389fd71b2a1f5eb53667373f18f054409adc5dc394e89`,
  `c764c0ef186aeada52d25b4e241fa1c6ebe862528a4ce79d0e975bd432585f2c`,
  and
  `52f696639dfac59129d3dec5d8b8a4b9a2b34508150930b3887e7dcd2eb65d2c`.
- `git diff --check`: the first focused check exposed Markdown trailing spaces
  in two newly written authority/state headers; they were removed and the
  rerun passed.

## Claims still unknown or false

- all five current Stage 4 blockers and Search reference-pattern authority;
- every unimplemented Live Intelligence productization requirement;
- AI, Sandbox, RPC, Prediction, and Crypto implementation/qualification;
- combined private workflows and the product-core freeze;
- the conforming platform registry and public/internal/sealed schema boundary;
- shared API/MCP/SDK/onboarding/site/docs/discovery/JSON-LD/sitemap/SEO;
- production hardening/deployment and payable commerce;
- bounded real settlement and any external useful paid result; and
- demand, revenue, First Revenue Release, or full-platform availability.

## Stop

Commit the NPLAN.3 authority/scope synchronization and stop. N4.27T remains the
exact next product ticket under its recorded owner authorization, but no
N4.27T, N4.28, Stage 5, later pillar, cloud, deployment, provider, payment,
production, or legacy action begins in this roadmap ticket.
