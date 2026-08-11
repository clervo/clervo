# Phase 1A — global shell and shared primitive decisions

The recovery keeps the locked Clervo tokens, typography, Hollow Apex mark,
controls, focus system, shell width, and semantic colors. It does not extend
the legacy page-composition system into the recovered Home.

| System | Decision | Active result | Scope boundary |
| --- | --- | --- | --- |
| `SiteHeader` | REFACTOR | Canonical Product, Models, Pricing, Docs, Status, and Set up Clervo navigation retained. Product-family routes resolve to Product active state; model detail resolves to Models. | Shared final shell. |
| Mobile navigation | REFACTOR | Existing focus trap, Escape, scroll lock, and focus return retained; current-page text/state added; Trust center added without overfilling desktop navigation. | Shared final shell. |
| `SiteFooter` | REFACTOR | Compact sitemap retained; Trust center added above the distinct Proof, Status, Security, and Legal domains. Registry-derived availability note remains authoritative. | Shared final shell. |
| `Instrument` | RESTRICT | Removed from Home. It remains only on unrecovered internal archetypes so their current composition is not silently broken before their gates. | Legacy internal routes only; reviewed per future archetype. |
| `LifecycleRail` | RETIRE | Removed from the application render. It no longer sends every page to Home lifecycle anchors or imposes one narrative on every archetype. | No public route renders it. |
| `Navigation` / `CommandPalette` legacy module | RETIRE | Dormant and unreferenced after `LifecycleRail` removal. | Source retained temporarily to avoid unrelated destructive cleanup; no public render. |
| `B12HomepageBelowHero` | RETIRE | No longer imported or rendered. Its onboarding, fixture catalog, and disconnected control systems cannot leak into Home. | Dormant source only pending safe legacy deletion. |
| `page-lead`, `band`, `section-head`, generic `panel` | RESTRICT | Not used by recovered Home. Existing rules remain for unrecovered routes only. | No new recovery archetype may inherit them by default. |
| Tokens / fonts / `shell` / buttons / focus | KEEP | Space Grotesk, Inter, JetBrains Mono, black surfaces, hairlines, 44px controls, cyan focus, and semantic red/cyan/gold remain canonical. | Shared final primitive layer. |
| Recovery composition CSS | CREATE | `recovery-foundation.css` holds minimal shell adjustments; `recovery-home.css` owns Home composition and motion. | Does not prescribe future archetype layouts. |

## Checks

- Desktop navigation remains restrained at five primary destinations plus one
  setup action.
- Mobile navigation is independently composed as a full-height dialog.
- 390 and 320 touch, focus trap, Escape, focus return, and current-page
  semantics pass the Home QA runner.
- No global factual availability string was hand-written.
- No new WebGL dependency or scene was added.
