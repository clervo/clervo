# B12 final visual baseline

This is the approved post-surgery baseline for the final Clervo site. It was
captured only after the held B12 direction, generated model catalog, creator
identity fallback, B11 docs paths, and canonical Hollow Apex pack had been
rendered and visually inspected.

## Capture contract

- Harness: `scripts/site/visual-regression.mjs --update`
- Routes: home, Start, Product, Models, Pricing, Docs, Status, Proof
- Widths: 1600, 1280, 1024, 768, 390, 320 CSS pixels
- Captures: 48 PNGs
- Browser used for baseline: Chromium 151 headless
- Responsive/interactions supplement: `scripts/site/b12-whole-site-qa.mjs`
  (19 routes × 1600, 1024, 390, 320; mobile menu, reduced motion, proof,
  refusal, unresolved, and approval states)
- Baseline directory: `apps/site/visual-baseline/`
- Deterministic tree SHA-256 (sorted tar, fixed metadata):
  `0a1f59d83fe73e498692b4ac94cccb2f109b2d7d8dc0c2639493393f0405a157`

The baseline is a release artifact, not an approval shortcut. A future visual
change must be inspected at all six widths first, then update this baseline
and this identity only when the change is intentional and documented.
