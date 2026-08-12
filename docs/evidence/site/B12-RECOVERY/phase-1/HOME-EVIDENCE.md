# Phase 1B — Home evidence checkpoint

Implementation source: `7f36e8d`.

Status: **ARCHETYPE READY FOR REVIEW: HOME**. This is not owner visual
approval and is not a new approved visual baseline.

## Contract result

| Home requirement | Direct evidence | Result |
| --- | --- | --- |
| What is Clervo? | First-fold category, locked promise, and outcome-layer explanation | PASS |
| Why does it matter? | Bound route, cost, evidence, and recovery explained without provider-integration repetition | PASS |
| What can I do now? | Canonical setup action plus observed free-first Search entry | PASS |
| Locked identity | Black world, Space Grotesk/Inter/JetBrains Mono, Hollow Apex header mark, established faceted hero Apex, hairlines | PASS |
| Semantic lifecycle | Request red → qualification/execution cyan → proved outcome gold | PASS |
| No false execution | Trace is labeled “Product model · no request is sent”; it changes explanatory state only | PASS |
| Registry truth | Family state/count/timestamp are generated from `observedTruth`; RPC renders unavailable | PASS |
| B11 truth | Released TypeScript, MCP, and Python versions come from `publishedClients`; Router/CLI and OpenAI-compatible entry points are present | PASS |
| Free-first truth | Curl derives from `quickStartCurl`, itself derived from the observed public Search route | PASS |
| Proof meaning | Verified outcome anatomy separates operation, result, evidence, settlement, and replay | PASS |
| Fixture residue | Automated Home scan found zero invalid occurrences across the six forbidden residue terms | PASS |
| Responsive composition | 1600, 1280, 768, 390, and 320 full pages inspected | PASS |

## Manual visual inspection

| Width | Composition observation | Result |
| ---: | --- | --- |
| 1600 | Three-part first fold balances promise, Apex mechanism, and lifecycle; capability section changes to editorial + dense ledger; no repeated panel stack. | PASS checkpoint candidate |
| 1280 | Hero remains legible without crowding; setup/code and proof/anatomy pairings retain hierarchy. | PASS checkpoint candidate |
| 768 | Hero recomposes into narrative → Apex → interaction; capability ledger becomes single-column; code remains bounded. | PASS checkpoint candidate |
| 390 | Header switches to dialog navigation; CTAs become full-width; lifecycle remains directly selectable; receipt anatomy stacks. | PASS checkpoint candidate |
| 320 | Promise, controls, code, state pills, footer, and long product names fit without horizontal overflow or clipped actions. | PASS checkpoint candidate |

Screenshots:

- `home/screenshots/desktop-1600-full.png`
- `home/screenshots/desktop-1280-full.png`
- `home/screenshots/tablet-768-full.png`
- `home/screenshots/mobile-390-full.png`
- `home/screenshots/mobile-320-full.png`

## Interaction and motion evidence

- Direct state captures: `home/interactions/lifecycle-request.png`,
  `lifecycle-qualify.png`, `lifecycle-execute.png`, `lifecycle-verify.png`, and
  `lifecycle-prove.png`.
- Timed causal motion: `home/motion/home-lifecycle.webm`.
- Reduced-motion equivalent: `home/interactions/reduced-motion-proved.png`.
  The control resolves immediately while all five steps remain readable.
- Desktop header focus: `home/interactions/header-desktop-focus.png`.
- Mobile menu: `home/interactions/mobile-390-menu.png` and
  `mobile-320-menu.png`.
- 200% text reflow: `home/interactions/text-zoom-200.png`.
- Copy control writes the generated free-call command and exposes “Copied”
  feedback.

## Accessibility, console, and browsers

- Axe: zero violations at 1600, 1280, 768, 390, and 320.
- Lighthouse accessibility: 100 mobile / 100 desktop.
- New interactions: 44px targets, pointer, keyboard, and touch activation pass.
- Mobile dialog: initial focus, focus trap, Escape, scroll lock, and trigger
  focus return pass at 390 and 320.
- Text zoom: 200% with no horizontal page overflow.
- Reduced motion: same final information without waiting for animation.
- Chromium, Firefox, WebKit: lifecycle, reduced motion, 390 layout, overflow,
  and console smoke pass.
- Console/page errors: zero.

Machine record: `home/home-qa-report.json`.

## Performance delta

Comparable Lighthouse measurements:

| Measure | Rejected B12 baseline | Home checkpoint | Delta |
| --- | ---: | ---: | ---: |
| Mobile Performance | 94 | 95 | +1 |
| Mobile LCP | 2.60s | 2.517s | -0.083s |
| Mobile CLS | 0 | 0 | 0 |
| Mobile TBT | 0ms | 43ms | +43ms, still well below a material blocking threshold |
| Desktop Performance | 100 | 100 | 0 |
| Desktop LCP | 0.60s | 0.562s | -0.038s |
| Desktop CLS | 0 | 0 | 0 |
| Initial JS gzip, Vite report | 155.57 KB | 146.62 KB | -8.95 KB |
| CSS gzip, Vite report | 36.07 KB | 31.17 KB | -4.90 KB |
| Lazy WebGL gzip | 248.11 KB | 248.11 KB | 0; not requested by Home |

The QA runner's direct gzip method reports 141.99 KB JS and 30.41 KB CSS;
those numbers are retained in the machine report but are not mixed with the
Vite-reported baseline. No image asset or WebGL scene was added.

## Link validation

All 19 rendered Home links/fragments resolve. Semantic source intent and future
destination archetype state are separated in `HOME-LINK-CONTRACTS.md`.

## Known limitations / review boundaries

- Owner visual acceptance is outstanding; these screenshots are not approved
  baselines.
- Start, Product, product families, Docs, Models, and Proof are intentionally
  still their rejected-state archetypes. Phase 1 was ordered to stop before
  modifying them. Home links use their final canonical destinations so those
  journeys can improve in place without another Home CTA migration.
- The legacy Instrument remains restricted to unrecovered internal routes. It
  is absent from Home and will be decided at each later archetype gate.
- The initial bundle still contains legacy route code/CSS required by the
  remaining unrecovered site. Home added no optional 3D runtime.

## Rejection-condition audit

No automatic Home rejection condition was found in the implemented source or
production build: identity and promise are preserved; gold appears only on the
proved state or explicitly verified outcome anatomy; the operating trace is
not represented as execution; capability families appear once; motion is
causal; mobile is recomposed; reduced motion is equivalent; 320px has no
horizontal overflow; keyboard/focus passes; and payload measurements improved.

The owner remains the authority on the visual/product judgment.
