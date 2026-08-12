# B12 recovery — authoritative semantic fixture inventory

Status: **FINAL PHASE 0 FIXTURE TRUTH MODEL**

This document supersedes the earlier route-only classification. Keyword counts
are candidate evidence; classification follows the user-visible system, its
purpose, boundary, and behavior. No other Phase 0 document is authoritative for
fixture validity.

## Reconciled totals

The crawler reported 508 keyword hits. One hit is ordinary prose—“not six
disconnected products”—and is not a fixture semantic. The remaining 507 hits
belong to the systems below.

| Level | Invalid final-product fixture truth |
| --- | ---: |
| Unique semantic defect families | **9** |
| Affected source components/templates | **9** |
| Affected public routes | **42** |
| Rendered keyword occurrences | **480** |

Separately, six explicit demonstration/test categories account for 27 rendered
keyword occurrences across four routes. They are validly bounded in the
rejected state even when their final action is to move or rewrite them for a
better page job.

The regression gate is both:

- **ZERO INVALID SEMANTIC FIXTURE SYSTEMS**, and
- **ZERO INVALID CUSTOMER-VISIBLE FIXTURE OCCURRENCES**.

Changing the word “fixture” without removing the disconnected behavior does
not pass.

## Allowlisted explicit demonstration/test categories

| Route | Visible text / control | Source component | Purpose | Classification | Why valid or invalid | Final action |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | “Demo task · no payment”; “Run a task” | `pages/Home.tsx` | Show the request → qualify → execute → verify → prove lifecycle without a network or payment action | `VALID_EXPLICIT_DEMO_OR_TEST_SEMANTIC` | The boundary is adjacent to the task, states are labelled, and it does not claim a customer transaction | **REWRITE** — keep one causal lifecycle, remove invented route/price/source counts, and preserve the no-live-action boundary without fixture-led copy |
| `/` | “Demonstration · no payment · fixture values”; “Run demonstration” | `components/B12HomepageBelowHero.tsx` outcome trace | Explain result, evidence, receipt, and replay adjacency | `VALID_EXPLICIT_DEMO_OR_TEST_SEMANTIC` | It explicitly says no payment and fixture values; the action changes only a labelled explanatory state | **REWRITE** — merge into the final Home lifecycle so Home contains one strong teaching mechanism rather than two |
| `/` | Quote / Approved / Receipt / Refused / Replay fixture tabs | `components/B12HomepageBelowHero.tsx` control boundary | Teach approval and recovery state vocabulary | `VALID_EXPLICIT_DEMO_OR_TEST_SEMANTIC` | It is explicitly a fixture-state inspector and does not claim execution | **MOVE TO LAB** — Home should explain the contract compactly; detailed state simulation belongs in Proof Lab |
| `/pricing` | “This demonstration does not pay”; “Preview approval boundary”; “Preview refusal” | `pages/TrustSupport.tsx` `PricingPage` | Explain the shape of an approval boundary using current registry fields | `VALID_EXPLICIT_DEMO_OR_TEST_SEMANTIC` | It states local browser state, no API, wallet, payment, settlement, or receipt action | **REWRITE** — retain as non-executing quote anatomy or replace with real safe quote inspection when supported; move state simulation to Proof Lab |
| `/proof` | “Fixture / design proof” proof class | `pages/TrustSupport.tsx` `ProofPage` | Teach that a design-state record is weaker than runtime or settled proof | `VALID_EXPLICIT_DEMO_OR_TEST_SEMANTIC` | Fixture is the subject of the taxonomy and is explicitly denied transaction/receipt authority | **KEEP** — refine terminology and link to the isolated Proof Lab |
| `/proof-lab` | “A deterministic local fixture”; Qualify/Reset fixture controls | `pages/ProofLab.tsx` | Isolated deterministic request-to-receipt demonstration | `VALID_EXPLICIT_DEMO_OR_TEST_SEMANTIC` | The page says no request leaves the browser, no provider is contacted, no wallet message is signed, and nothing is charged | **KEEP** — preserve the lab boundary and distinguish it from approved/redacted real proof |

Rendered keyword counts for the allowlist are: Home first fold 2; Home outcome
trace 8; Home control inspector 7; Pricing 3; Proof taxonomy 2; Proof Lab 5.

## Invalid semantic defect families

| Semantic defect family | Source component/template | Routes | Rendered occurrences | Why invalid | Final action |
| --- | --- | --- | ---: | --- | --- |
| Prototype onboarding presented before released B11 | `B12HomepageBelowHero` bridge/setup | `/` | 11 | The normal Home journey presents prototype setup and no-live-action language instead of released Router, MCP, TypeScript, Python, and OpenAI-compatible paths | **REWRITE** in Home |
| Illustrative capability catalog with intercepted/dead destinations | `B12HomepageBelowHero` catalog | `/` | 8 | It looks like discovery, but uses six invented operation IDs and disconnected local filtering | **REMOVE**; link to canonical Products/Models and real operations |
| Prototype onboarding as the primary Start product | `Start` | `/start` | 40 | The page job is real activation, but the system is a design fixture | **REMOVE / REBUILD** in Start phase |
| Product operating model implemented as a fixture | `Product` | `/product`, `/platform` | 8 | A disconnected conceptual task replaces a truthful operating-layer explanation | **REWRITE** in Product phase |
| Generic family task fixture | `Capability` + `b12Slice4` | six `/products/*` routes | 31 | One fixture system is title-swapped across different products and can imply behavior not serving, especially RPC | **REMOVE / REBUILD** in Family phase |
| Local fixture progress as a second onboarding product | `Build` | `/build` | 3 | Browser-local progress and fixture preflight compete with the canonical onboarding journey | **RETIRE** into a compatibility route to Start |
| Disconnected approval/execution/replay simulator in API reference | `Operation` | 29 `/operations/*` routes | 377 | A visually convincing simulator appears on executable contract pages but does not preflight, quote, execute, or replay production behavior | **REMOVE / REBUILD TEMPLATE** |
| Fixture CTA as normal Research continuation | `Research` | `/research` | 1 | “Run fixture” is offered as the customer next step instead of a real free result or explicit lab | **REWRITE** |
| Internal fixture-audit wording on Benchmarks | `TrustSupport` `BenchmarksPage` | `/benchmarks` | 1 | Audit terminology leaks into editorial customer copy | **REWRITE** |

Affected source file count is nine because the family system spans both the
rendering component and its shared fixture data module.

## Machine-readable output

`llms.txt` and `llms-full.txt` also describe “fixture amounts.” That is invalid
machine-facing final-product copy and must be regenerated when Pricing is
recovered. Contract identifiers such as `real_demonstrations` and
`requirementDemonstrations` are schema vocabulary, not rendered fixture
semantics; they require an intentional contract migration and are not renamed
by a copy purge.

## Raw-crawl interpretation

The compressed production and local crawls retain route, term, count, and
excerpt candidates. They no longer define validity. JavaScript `.prototype`
syntax and the ordinary phrase “not six disconnected products” are excluded by
semantic review. This inventory is the single fixture classification authority
for Phase 0 and the recovery regression gate.
