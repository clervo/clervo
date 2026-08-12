# B12 recovery — performance and interaction-accessibility gates

## Rejected-state baseline

The rejected B12 build remains the comparison baseline, not an approved visual
baseline.

| Measure | Baseline |
| --- | ---: |
| Mobile Lighthouse Performance | 94 |
| Mobile LCP | 2.6s |
| Mobile CLS | 0 |
| Mobile TBT lab proxy | 0ms |
| Desktop Lighthouse Performance | 100 |
| Desktop LCP | 0.6s |
| Desktop CLS | 0 |
| Initial application JS | 674.96 KB minified / 155.57 KB gzip |
| Lazy WebGL chunk | 929.50 KB minified / 248.11 KB gzip |
| CSS | 202.85 KB minified / 36.07 KB gzip |

Sources: `production/lighthouse-mobile.json`,
`production/lighthouse-desktop.json`, and `local/site-build.txt`.

## Performance delta rules

Every archetype checkpoint reports the same baseline and new measurement.

- Primary public archetypes target mobile Lighthouse Performance **≥90**. Any
  lower result needs a specific reviewed product-value reason and remediation
  record; visual preference is not a reason.
- A score decrease greater than 5 points, LCP regression greater than 400ms or
  15% (whichever is smaller), CLS above 0.1 or increasing by more than 0.02,
  and a material INP/TBT regression fail the checkpoint until explained and
  repaired.
- Initial JS gzip may not grow by more than 20 KB or 15% without a measured,
  reviewed interaction need. Optional motion/WebGL remains lazy and cannot
  block semantic content or primary actions.
- Each checkpoint reports CSS, initial JS, lazy chunks, image/media weight,
  font behavior, LCP asset, CLS sources, and console/network failures.
- Expensive enhancements load after the useful semantic page. No section earns
  a large image, canvas, or WebGL runtime solely for atmosphere.
- Measurements use comparable production builds and Lighthouse settings;
  absolute lab values and deltas are both recorded.

## New-interaction accessibility rules

The old 18-load WCAG 2.2 AA baseline remains evidence, but it does not accept
new interaction.

Every unique interaction in `NORMALIZED-INTERACTION-INVENTORY.md` must receive:

- semantic role/name/state and non-color state text;
- logical keyboard entry/order, activation, Escape/focus return where relevant,
  and no trap except a correctly bounded modal/dialog;
- visible focus at all states;
- 44px target behavior for standalone controls and touch testing;
- 320px, 390px, tablet, and desktop composition evidence;
- 200% zoom/reflow and code/table overflow behavior;
- loading, empty, unavailable, refusal, and error states as applicable;
- live-region use only for meaningful state changes without focus theft;
- reduced-motion equivalence preserving the same final information;
- automated axe plus manual keyboard/touch activation;
- back/forward, deep-link, refresh, and mobile-menu interaction where state is
  navigational.

Generated templates use representative extremes, but shared component tests
must cover every unique state. A passing page-load scan cannot substitute for
activating the control.
