# Clervo Step 8D browser and visual QA authority

- **Issue:** #20
- **Parent:** PR #19 / `feature/step-8c-source-identity-prerender`
- **Branch:** `feature/step-8d-browser-visual-qa`

## Real-browser matrix

The built static site is served locally and inspected with the Chromium DevTools Protocol without adding a browser runtime dependency.

- all 28 canonical routes at 1280×900;
- all 28 canonical routes at 390×844;
- 10 core routes at 1600×1000;
- 10 core routes at 320×720;
- 76 route/viewport assertions total;
- 30 viewport screenshots for core routes;
- reduced-motion verification at 390px.

## Failure gates

The job fails on:

- horizontal page overflow;
- a missing visible H1 or a heading hidden under the fixed header;
- unnamed interactive elements;
- primary controls below the locked 44×44 baseline;
- duplicate IDs;
- clipped important text;
- stale canonical URLs;
- missing Hollow Apex authority marker;
- JavaScript exceptions or console errors;
- failed local resources;
- non-functional mobile drawer open/Escape behavior;
- reduced-motion transitions that do not collapse.

## Evidence

CI uploads:

- `browser-qa-report.json`;
- `browser-qa-summary.md`;
- 30 PNG viewport captures.

## Remaining independent QA

This does not replace physical iPhone Safari, Android Chrome, virtual keyboard, screen-reader, final self-hosted-font, or production-network testing. Those remain pre-release gates.
