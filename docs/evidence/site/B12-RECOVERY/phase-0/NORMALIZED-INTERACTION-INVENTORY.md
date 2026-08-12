# B12 recovery — normalized interaction inventory

The rendered crawl counted 8,716 repeated control instances across 153 routes.
That number remains mechanical coverage evidence only. Product acceptance uses
the unique interaction systems below.

| Unique interaction type | Component | Archetype | Purpose | States | Keyboard behavior | Touch behavior | Mobile form | Truth source | Routes using it |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Global route navigation | `SiteHeader`, `Link` | Global shell | Reach primary product destinations and expose current location | default, hover/focus, current | Normal link order; Enter activates; visible focus | 44px+ targets | Compact header plus dialog menu | Route inventory | all routes |
| Mobile navigation dialog | `SiteHeader` | Global shell | Expose full navigation without compressing desktop nav | closed, opening, open, closing | Trigger, focus entry, trapped Tab, Escape close, focus return | Backdrop and close target | Full-height scrollable panel | Route inventory | all routes ≤900px |
| Canonical CTA link | shared link/button primitives | Global shell / all | Carry one explicit intent to one destination | default, hover, focus, disabled where applicable | Enter activates; focus visible | 44px+ | Full-width only where composition requires | Link contract + route state | all archetypes |
| Lifecycle explanation | final Home lifecycle (current `Home`/`B12HomepageBelowHero`) | Home | Teach request → qualify → execute → verify → receipt | idle, request, qualify, execute, verify, proved; reduced-motion final | Button activation; status announced; no focus theft | Single deliberate action | Vertical semantic stages | Explanatory contract; no live telemetry claim | `/` |
| Capability navigation | final Home capability index | Home | Move from family outcome to truthful family page/current state | current serving, paused, unavailable | Link semantics; state not color-only | Row/card targets | Compact list, not six tiny cards | Observed family truth | `/` |
| Model search and filters | `Catalog` | Models catalog | Find a model by backed identity and metadata | query, filters, results, empty, reset | Search focus; filter controls; deterministic result order | Touch-safe filters | Sticky search + disclosure/drawer | Canonical models and creator map | `/catalog` |
| Model technical/list view | future Models explorer | Models catalog | Change density without hiding semantics | list, technical table | Toggle announced; preserved focus/order | Segmented control | List default; table disclosed/scroll-safe | Canonical model metadata | `/catalog` |
| Docs search | future docs search | Docs | Find docs, operations, models, errors, and concepts | closed, query, results, active result, empty, error | Shortcut open; arrows; Enter; Escape; focus return | Search button/results | Available from docs drawer/header | Static generated search index | `/docs*` |
| Docs navigation drawer/tree | future docs shell | Docs | Preserve hierarchy and current location | closed/open; group expanded; current article | Tab/Enter/Escape; disclosure semantics | Touch-safe groups | Drawer, not compressed desktop tree | Docs route map | `/docs*` |
| Code/client switcher | `CodeBlock` plus future client tabs | Docs / Model / Operation | Show only released interface examples | client selection, copied, copy blocked | Arrow-key tabs where tabs; copy button | 44px controls | Scroll-safe code; compact tabs | Released packages + operation contract | docs/model/operation pages |
| Copy control | `CodeBlock`, setup/ID controls | Docs / Start / Model / Operation | Copy exact command, model ID, or request | idle, copied, blocked | Button activation; polite result | Touch-safe button | Adjacent or sticky within code header | Canonical command/ID/request | relevant routes |
| Start integration choice | future Start | Start / Connect | Choose Router, MCP, TypeScript, Python, or OpenAI-compatible path | unselected, selected, unavailable | Radio/tab/list semantics; focus retained | Large path rows | Vertical list | Released B11 package manifests | `/start` |
| Pricing operation selector | `PricingPage` future refinement | Pricing | Inspect fixed/dynamic pricing and boundaries | selected operation; fixed, dynamic, unavailable | Labelled select/list; Enter/Space | Native/select-safe | Stacked ledger/detail | Registry pricing | `/pricing` |
| Safe quote/preflight inspector | future Pricing/Operation | Pricing / Operation | Call a supported safe preflight/quote or generate a real request | idle, loading, quoted, refused, unavailable, error | Form labels, submit, live result, error focus | Touch-safe fields/actions | One-column form/result | Public API/OpenAPI and current quote contract | supported pages only |
| Status drilldown | future Status | Status | Move from observed family/component state to affected detail | live, paused, unavailable, degraded if authoritative | Disclosure/link semantics | Row target | Stacked state rows | Production observation | `/status` |
| Proof record inspector | `ProofPage`, future proof refinement | Proof | Compare proof classes and inspect a real/redacted record | engineering, observed, owner-funded, demo, unproven | Proper tabs with arrow keys and panel relation | Touch-safe tabs/list | Horizontal overflow avoided; list fallback | Proof authority and redacted record | `/proof` |
| Proof Lab mechanism | `ProofLab` | Explicit lab | Demonstrate deterministic request-to-receipt state | request, route, quote, approval, evidence, verify, result, receipt, recovery | All controls keyboard reachable; state announced; share/deep link | Touch-safe controls | Linear stages and readable receipt | Browser-local fixture, explicitly isolated | `/proof-lab` |
| Operation schema/request explorer | future `Operation` | Operation detail | Inspect schema and generate or submit only truthful supported requests | schema section, generated request, safe preflight/quote, unavailable/error | Native form, disclosure/tree semantics, copy | Touch-safe; no drag dependency | Stacked schema + request | OpenAPI, operation contract, public API | 29 operation routes |

## Acceptance rule

Every new unique interaction receives focused keyboard, touch, mobile,
loading/empty/error, reduced-motion, console, and accessibility evidence at its
archetype checkpoint. Repetition across generated pages is tested by
representative extremes, while the underlying interaction component is tested
once comprehensively.
