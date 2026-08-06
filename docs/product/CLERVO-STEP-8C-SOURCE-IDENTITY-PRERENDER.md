# Clervo Step 8C source, identity, and prerender authority

- **Issue:** #18
- **Parent:** PR #17 / `feature/step-8b-page-alignment`
- **Branch:** `feature/step-8c-source-identity-prerender`

## What this slice fixes

1. The legacy diamond-and-`C` favicon is replaced by the exact locked Hollow Apex web geometry.
2. The accessible `clervo-hollow-apex.svg` implementation asset is published without inventing a custom wordmark or unresolved monochrome pack.
3. Root metadata uses the permanent category, human promise, and brand promise.
4. Eight public product/trust pages consume one typed `PublicSiteSource` boundary rather than importing generated discovery fixtures directly.
5. The active source remains `repository-fixture` and fails closed if it ever claims public operations or payable products.
6. A real API source is intentionally unimplemented; selecting it throws rather than silently falling back.
7. A shared route manifest drives 28 canonical prerenders and validation.
8. Legacy `/build` and `/proof-lab` become noindex aliases to `/start` and `/proof`.
9. Site prebuild now validates Step 8 identity, source boundaries, metadata, routes, and fixture truth before public assets are prepared.

## Backend replacement contract

When canonical backend data exists, Codex implements a new `PublicSiteSource` and changes the single binding in `apps/site/src/data/public-site-source.ts`. Pages, routes, composition, motion, and responsive behavior must remain unchanged unless a separately approved design change exists.

## Validation

- Step 8 design validator: PASS — 28 canonical routes and 8 source-bound public pages.
- Step 8 authority tests: 14/14 PASS locally.
- TS/TSX syntax diagnostics: 12/12 PASS.
- Full TypeScript, build, SSR, prerender, alias, and repository acceptance gates run in CI on the stacked PR.

## Still unresolved

- public API adapter;
- final self-hosted font binaries;
- custom wordmark master;
- final social-preview image approval;
- deployment, live execution, wallet, payment, settlement, status ingestion, and benchmark evidence.
