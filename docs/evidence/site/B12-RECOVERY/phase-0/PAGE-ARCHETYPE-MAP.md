# B12 recovery — page archetype map

The route system is classified by reusable page job, not by raw route count.
No route is intentionally unassigned.

`route-archetypes.json` expands the route rules below into 153 explicit
route-to-archetype assignments and reports zero unassigned routes. The deployed
404 document is audited separately because it is intentionally not a
prerender/sitemap route.

| Archetype | Routes / rule | Count | Decision | Current-system disposition |
| --- | --- | ---: | --- | --- |
| Home | `/` | 1 | REFINE | Keep first-fold promise, Hollow Apex, and cinematic identity; remove customer-path fixture residue and dead example links. |
| Product overview | `/product`, `/platform` | 2 | REFINE | Keep operating-layer premise and alias; rebuild repeated body composition and real request-to-receipt explanation. |
| Product family | `/products/{search,ai,sandbox,rpc,prediction,crypto}` | 6 | REBUILD | Replace `FAMILY_FIXTURE` as the page experience; retain canonical shared truth and distinct family jobs. |
| Models catalog | `/catalog` | 1 | REBUILD | Retain canonical catalog projection and reviewed creator mapping; redesign as a dense discovery product. |
| Model detail | `/models/:slug` | 89 | REBUILD TEMPLATE | Preserve route generation and model truth; add operation path, supported-parameter truth, better alias identity, and executable examples. |
| Operation detail | `/operations/:id` | 29 | REBUILD TEMPLATE | Preserve generated contract extraction; remove page-wide design fixtures and make real interfaces mechanically copyable/validated. |
| Docs / developer portal | `/docs`, `/docs/quickstart`, `/docs/{http,typescript,python,mcp,cli,openai}`, `/docs/{receipts,replay,failures,x402,catalog}` | 13 | REBUILD | Consolidate useful B11 content into a docs-specific shell, search index, hierarchy, TOC, and prev/next graph. |
| Start / Connect | `/start` | 1 | REBUILD | Replace prototype setup with actual Router, MCP, TypeScript, Python, and OpenAI-compatible activation. |
| Activation compatibility | `/build` | 1 | RETIRE PRODUCT, PRESERVE URL | Remove fixture/local-progress framing. `/build` is a compatibility route to the one canonical `/start` onboarding system. |
| Pricing | `/pricing` | 1 | REFINE | Keep registry-driven ledger; remove fixture approval and compactly explain free, fixed, and request-derived economics. |
| Status | `/status` | 1 | REBUILD | Put observation timestamp and family/model/route state before art direction; do not invent history or uptime. |
| Proof | `/proof` | 1 | REFINE | Keep owner-funded/customer-demand boundary and proof taxonomy; strengthen receipt/evidence anatomy and remove non-lab fixture wording. |
| Proof Lab / demo | `/proof-lab` | 1 | KEEP + REFINE | Keep deterministic local mechanism and explicit boundary; improve relationship to real proof and preserve isolation. |
| Trust center domains | `/trust`, `/security`, `/legal` plus Proof/Payment Safety/Privacy destinations as architecture evolves | 3 current | REFINE / SEPARATE DOMAINS | Share wayfinding, but preserve separate Proof, Payment Safety, Security, Privacy/Data, and Legal purposes; Legal stays dependency-bound until approved copy exists. |
| Compare / research / benchmarks | `/research`, `/benchmarks`; dormant `Compare.tsx` | 2 routed | REBUILD / REMOVE LEGACY | Preserve dated methodology and truthful empty states; remove dormant comparison generation until a sourced comparison route exists. |
| Changelog | `/changelog` | 1 | REFINE | Keep dated evidence source; make release/product/why-it-matters and documentation links useful without a giant hero. |
| Utility / 404 | deployed unknown route / `404.html` | 1 document | REFINE | Preserve true 404 and noindex; add deliberate routes to Home, Models, Docs, Start, and Product. |

## Global systems

| System | Decision | Reason |
| --- | --- | --- |
| Header | REFINE | Primary destinations are correct and mobile dialog mechanics exist; active-state grouping and docs/product context need tightening. |
| Footer | REFINE | Core sitemap is current; remove global audit-report tone and keep factual note compact. |
| Persistent Instrument | REFINE | Canonical static/WebGL progressive enhancement is valuable; it currently imposes one shared visual grammar on too many archetypes. |
| Lifecycle rail | REFINE OR SCOPE DOWN | Semantic sequence is valuable but should not make Docs, Models, Status, and reference pages feel like the same narrative page. |
| `TrustSupport` mega-template | REMOVE LEGACY AFTER EXTRACTION | Useful structures should become archetype primitives; one template must not dictate Pricing, Proof, Docs, Status, Security, Benchmarks, Changelog, and Legal. |
| `FAMILY_FIXTURE` | REMOVE FROM FINAL FAMILY JOURNEYS | Keep only if repurposed inside a named lab; it cannot remain the public product-family content source. |
| Rejected visual baselines | KEEP AS HISTORY | Never overwrite as approved baselines. New baselines require archetype approval. |

## Dormant source inventory

The following exported systems are not reachable from `App.tsx` and are legacy
removal candidates: `pages/Changelog.tsx`, `pages/Compare.tsx`,
`pages/Proof.tsx`, `pages/Status.tsx`, `pages/Trust.tsx`, the old
`Navigation`/`CommandPalette` branch, and `Worlds`/`WebGLWorlds` (asset and
component retained but unrouted). Dynamic imports of `WebGLInstrument` are live
and are not dormant.
