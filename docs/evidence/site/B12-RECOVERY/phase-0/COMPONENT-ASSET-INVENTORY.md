# B12 recovery — component, state, and asset inventory

## Shared rendering architecture

Every route currently uses `SiteHeader`, `Instrument`, `LifecycleRail`, the
route page, and `SiteFooter`. The router is a small history-based client router
with SSR/prerendered HTML per canonical route.

### Shared navigation

- Desktop header: Product, Models, Pricing, Docs, Status, Set up Clervo.
- Mobile header: independently rendered modal navigation dialog with focus
  management, Escape handling, scroll lock, backdrop close, current-page state,
  and touch-sized controls.
- Footer: Product, Models, Pricing, Start, Docs, Quickstart, OpenAPI, Discovery,
  Proof, Status, Security, Legal, plus a generated family-availability note.
- Trust/support subnav: Pricing, Proof, Docs, Status, Security, Benchmarks,
  Changelog, Legal.
- Operation local nav: twelve anchored contract sections.

### Shared interactive components

| Component/system | Current use | Audit disposition |
| --- | --- | --- |
| `CodeBlock` | Docs and Model detail | Keep, add copy state/accessibility/language switching where truthful. |
| `Catalog` search/filter | Models | Keep truth projection; rebuild hierarchy and add backed technical views. |
| Home fixture search/proof/control | Home | Remove from final journey or replace with real catalog/semantic motion. |
| Product router state | Product | Refine into truthful semantic interaction. |
| Operation scenario/approval/replay | All operation pages | Invalid fixture system; remove from final reference template. |
| Pricing operation selector | Pricing | Keep registry selection; remove local approval fixture. |
| Proof class selector | Proof | Keep/refine; make receipt/evidence anatomy primary. |
| Benchmark topic selector | Benchmarks | Keep only with dated methodology and useful empty states. |
| Proof Lab state machine | Proof Lab | Keep as isolated deterministic fixture. |
| Start stage/failure state machines | Start | Remove legacy fixture; replace with real integration-choice activation. |

### Dynamic state

- Global experience phases: risk, qualified, approval, verified, receipt.
- Home: proof sequence, family filter, catalog query, quote/control tabs, copy
  result.
- Product: request/qualify/verified router state.
- Models: query, creator, modality, lifecycle/state, canonical/alias filters.
- Start: environment, ten journey stages, seven failure/recovery states.
- Operation: interface, scenario, approval, execution, replay.
- Proof Lab: request/route/quote/approval/evidence/result/receipt/recovery and
  shareable browser state.
- Activation: browser-local completion state.
- Mobile menu: open/closed dialog state.

## Legacy source

### Still rendered

- `B12HomepageBelowHero` and its fixture catalog/control/setup systems.
- `Start.tsx` prototype journey and failure fixtures.
- `b12Slice4.FAMILY_FIXTURE` on Product Family pages.
- `Operation.tsx` design-fixture approval/execution/replay controls.
- `TrustSupport` as a shared composition for eight unrelated archetypes.
- the global Lifecycle Rail on nearly every page type.

### Present but not routed

- old page implementations: `Changelog.tsx`, `Compare.tsx`, `Proof.tsx`,
  `Status.tsx`, `Trust.tsx`;
- old `Navigation` plus `CommandPalette` branch (only `LifecycleRail` remains
  imported from that module);
- `Worlds.tsx` and `WebGLWorlds.tsx` plus their canonical asset set.

Do not delete these blindly. Extract any useful truthful structure, then remove
dormant code only after the replacement archetype and route coverage pass.

## Visual assets

`apps/site/public/assets` contains 36 files totaling 2,052,082 bytes:

- 13 canonical brand SVG assets plus packaged identity assets;
- one PNG and one SVG social card;
- four self-hosted font files (Inter, JetBrains Mono, Space Grotesk 500/600);
- six desktop and six portrait optimized prism-state renders;
- two optimized Worlds renders;
- `clervo-prism.glb` (818,616 bytes);
- `clervo-worlds.glb` (828,820 bytes).

Canonical media manifests retain Blender source, generator, camera, state,
action, size, and SHA-256 provenance. Both explicitly state that generated
media is not product proof. The Hollow Apex identity manifest locks geometry,
palette, minimum size, semantic motion order, reduced motion, and forbidden
rotation/idle shimmer/gold-before-verification behavior.

## WebGL/runtime findings

- The prism enhancement is live and lazy-loaded after desktop interaction.
- Mobile and reduced motion use canonical stills.
- Context-loss fallback checks existed in prior B12 tooling.
- Worlds media is canonical but currently unused.
- The current lazy WebGL JS chunk is larger than the GLB itself and remains a
  performance budget risk.
- Docs, Models, Status, Pricing, and reference pages should not inherit a 3D
  scene merely for brand consistency.
