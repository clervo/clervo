# B12 recovery — Phase 0 forensic audit

## Result

The existing B12 site is mechanically coherent but fails the recovered product
contract. The deployed system serves all 153 intended routes with a real 404,
clean route loads, canonical registry projection, and a connected link graph.
The owner-rejected product defects are directly visible in four areas:

1. final customer journeys render prototype or fixture systems;
2. major archetypes share the same oversized marketing composition;
3. useful interaction is concentrated in fixtures instead of real catalog,
   documentation, onboarding, and operational tasks;
4. old and current component generations coexist, increasing visual and
   editorial drift.

No public product page was changed during this phase.

## Direct evidence

| Requirement | Observation | Evidence |
| --- | --- | --- |
| Route inventory | 153 routes: 35 fixed, 29 operations, 89 models | `scripts/site/site-route-inventory.mjs`; production crawl |
| Generated identity | 85 canonical models, 4 aliases, 88 sellable IDs | `generated/public/models.json` |
| Product state | Search, AI, Sandbox, Prediction, and Crypto observed live; RPC unavailable for `commercial_rights_blocked` | `packages/catalog/live-registry.json`; generated observed truth |
| B11 package truth | `@clervo/router` 0.3.1, `@clervo/sdk` 0.5.2, `@clervo/mcp` 0.5.2, `clervo-sdk` 0.4.2; registry versions matched on 2026-08-11 | package manifests plus npm/PyPI registry queries |
| Build | Typecheck, Vite client/SSR build, prerender, and 153-route validation passed | `local/site-build.txt` |
| Production routes | 153/153 returned 200; unknown route returned 404 | `production/forensic-audit.json.gz` |
| Runtime errors | 0 console errors, 0 page errors, 0 failed requests in desktop crawl | `production/forensic-audit.json.gz` |
| Width containment | 0 horizontal-overflow routes at 1280 and reduced-motion 390 | local and production crawl reports |
| Accessibility baseline | 18 representative production loads passed the WCAG 2.2 AA axe rule set and 44px target check | `production/accessibility-baseline.txt` |
| Link graph | 7,165 canonical graph edges; 0 route orphans; 0 pages without onward canonical action | `LINK-GRAPH-AUDIT.md` |
| Link-contract defects | 6 visible links target operation IDs absent from canonical route inventory | `LINK-GRAPH-AUDIT.md` |
| Residue | 508 keyword candidates: one lexical false positive; 507 fixture-semantic hits. Final model: 9 invalid systems / 9 affected source components/templates / 42 routes / 480 invalid occurrences; 27 valid explicit demo/test occurrences. | `PROTOTYPE-FIXTURE-INVENTORY.md` |
| Visual repetition | Manual 1600/390 review shows the same giant-title/void/hairline grammar on Start, Models, Docs, and support pages | `rejected-current-state/contact-sheets/whole-site-1600.png`; `whole-site-390.png` |
| Performance baseline | Main JS 674.96 KB minified / 155.57 KB gzip; lazy WebGL chunk 929.50 KB / 248.11 KB gzip; CSS 202.85 KB / 36.07 KB gzip. Lighthouse lab baseline: mobile 94 performance, 2.6s LCP, 0 CLS; desktop 100 performance, 0.6s LCP, 0 CLS. | Vite production build output; `production/lighthouse-{mobile,desktop}.json` |
| Asset provenance | Canonical Blender sources, GLBs, state renders, identity manifest, and hashes are present | `COMPONENT-ASSET-INVENTORY.md` |

## Route and rendering system

`App.tsx` performs explicit path matching. `site-route-inventory.mjs` is the
single prerender/sitemap route projection. Every route renders through one
global shell:

`SiteHeader → Instrument → LifecycleRail → page → SiteFooter`

The persistent Instrument is progressively enhanced: static canonical stills
render first, then desktop interaction may load the Three.js prism. Reduced
motion and mobile keep static media. The separate canonical Worlds GLB/stills
and `Worlds` component exist but are not currently rendered by any page.

## Product truth boundary

The site correctly derives observed family lifecycle and proof levels from the
generated projection of `packages/catalog/live-registry.json`. It also imports
older discovery/release-scope vocabulary whose `preview` fields are not current
customer lifecycle authority. Recovery work must continue to overlay or replace
those legacy labels without weakening the observed-truth source.

RPC remains unavailable. No audit finding authorizes a public RPC claim.

## Primary product findings

### Home

The first fold retains strong Clervo identity, promise, and Hollow Apex focus.
Below it, the route contains a no-payment demonstration, fixture catalog,
prototype setup, disconnected payment language, and dead example-operation
links. Classification: **REFINE**, preserving the core hero and replacing weak
customer-journey residue.

### Start

Start is a 10-stage design fixture whose first fold says prototype path and
design prototype. This directly conflicts with released B11 packages and the
real free-first client path. Classification: **REBUILD**.

### Docs

`/docs` is a task-first marketing overview rendered inside the trust/support
template. Client quickstart pages contain useful real B11 commands, but there is
no persistent documentation navigation, documentation search, article outline,
or integrated reference workspace. Classification: **REBUILD**.

### Models

The catalog has real text search and creator/modality/state filters backed by
canonical metadata, but the first fold hides the dense browser below a large
marketing opening. There is no list/table switch, supported-parameter filter,
or direct alias/canonical comparison workflow. Classification: **REBUILD**.

### Generated pages

Model pages expose exact ID, creator, capabilities, availability, price lines,
example code, and related models, but they do not consistently link to the
operation appropriate to the modality. Operation pages are extensive, yet each
contains approval, execution, and replay design fixtures on all 29 pages. Their
interface examples are not consistently copyable and switchable. Model detail:
**REBUILD TEMPLATE**. Operation detail: **REBUILD TEMPLATE**.

### Product families

All six family pages use one template and the `FAMILY_FIXTURE` content model.
Family truth is present, including honest RPC unavailability, but interaction
and visual emphasis are generic. Classification: **REBUILD**.

### Status, Proof, Pricing, Trust, and Changelog

These current pages share `TrustSupport` and a common hero/subnav/section
grammar. Their source data and several information structures are valuable.
Status still opens as a marketing-scale page; Proof is the strongest of the
group; Pricing has a useful registry-driven ledger but adds local fixture
approval; Trust is specific but fragmented; Changelog is evidence-backed but
too narrowly generated. Decisions are in the archetype map.

## Mechanical baseline is not acceptance

The rejected-state whole-site harness reports zero technical findings. That is
preserved as mechanical evidence only. It does not satisfy product or visual
acceptance, and the evidence directory is explicitly marked as owner-rejected.

## Phase 0 exit

**PHASE 0 COMPLETE — RECOVERY FOUNDATION ACCEPTED**

The final corrections reconcile fixtures, normalize defects/interactions,
resolve `/build` as a compatibility route to Start, record the external legal
dependency, deepen benchmark observations, and establish performance and
interaction-accessibility delta gates. See `PHASE-0-EXIT-GATE.md`.

Phase 1 is automatically authorized for Global Shell/shared primitives and
Home only. B12 remains open. B13 remains blocked.
