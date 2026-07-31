# Clervo Next

Clean-room repository for the Clervo BlockRun-10x mission.

## Current state

Tickets **N0.1** through **N4.19** are complete. The clean-room foundation, contracts, mock commerce, observability, routing, deterministic recorded search path, bounded deterministic query rewriting, isolated JavaScript retrieval boundary, cache-freshness disclosure, language/region options, separate raw/synthesis product pricing, bounded search monitoring snapshots, an isolated private Cloud Run staging slice, and a provider-neutral retrieval-supply qualification contract are implemented. The source-bound exit verifier covers all 22 §7.1 checks and truthfully blocks Stage 4 exit: only the deployed recorded free sample has staging verification, 21 checks remain blocking, search is not yet the reference pattern, and Stage 5 is not authorized.

The selected foundation is TypeScript on Node.js 24 LTS, PostgreSQL 18, and pg-boss 12 backed by the same PostgreSQL cluster. npm manages the workspace. `packages/contracts` remains the source of truth for the versioned contracts; `services/search/src/recorded-pipeline.ts` is an offline evidence executor, not a live provider adapter. Generated discovery marks separately priced `search.web` and `search.answer` products as `implemented_unverified` and keeps public deployment and payment-readiness claims false. N4.18 deployed immutable release `2f6fd6c` to private authenticated Cloud Run revision `clervo-stage4-slice-staging-00001-7fn`; checked-in smoke and request-log evidence verifies release health, the recorded free sample, and the non-payable paid challenge while keeping mock-paid execution disabled. N4.19 makes Brave an optional exact-identity adapter and defines the minimum free-first gate: a self-hosted metasearch broker with at least two independently qualified upstream providers plus direct independently qualified Common Crawl archive access. Public shared SearXNG is ineligible for production supply. Crawl4AI is the sole evaluated extraction worker but remains unselected because its deterministic fixtures, timeouts, resource limits, and failure isolation are not yet proven against Clervo's bounded adapter. Query rewriting, the injected isolated-JavaScript boundary, cache-freshness disclosure, language/region options, product pricing, internal monitoring snapshots, provenance, citations, ranking, synthesis, and benchmarks remain unchanged. Live provider-to-fetch execution, calibrated/live quality, durable distributed state, real payment verification/settlement, delivered monitoring, and public deployment remain unimplemented or unverified.

## Authority

The controlling plan is:

`/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md`

## Runtime setup

Repository execution is pinned exactly to Node.js `24.18.1` and npm `10.9.8`. Select the committed version before installing or running commands: `nvm install && nvm use`, `asdf install`, or `mise install`. The same pin is recorded in `.nvmrc`, `.node-version`, `.tool-versions`, `package.json`, `package-lock.json`, and `infra/stack-versions.env`; `npm install` and every npm script fail immediately if the active Node.js process differs. Run `npm run verify:runtime` to diagnose the active process and `npm test` for canonical acceptance.

The absolute path above is documentation for operators, not a runtime dependency. Product code must not import, mount, execute, or otherwise depend on the legacy `/workspace/x402-platform` repository or its state.

## Repository boundary

- This directory is its own Git repository.
- Legacy code, databases, queues, catalogs, ledgers, generated artifacts, and deployment state are evidence only.
- No symlink, submodule, gitlink, local package dependency, or runtime path may escape this repository.
- Small concepts may be reimplemented later only when an authorized ticket explicitly permits it.

## Validation

Run:

```sh
npm run verify:runtime
npm test
npm run staging:smoke
```

The repository requires exactly Node.js 24.18.1. `.nvmrc`, `.node-version`, and `.tool-versions` select that runtime in common version managers; npm uses strict engine enforcement; install and acceptance fail closed if the executing Node.js version differs. The commands use local POSIX tools, Git, and Node.js. Acceptance performs no external network access, provider calls, cloud changes, or payments; staging smoke uses loopback HTTP only. The checks do not connect to PostgreSQL, start pg-boss, or prove remote GitHub Actions/environment protection or live hosting.
