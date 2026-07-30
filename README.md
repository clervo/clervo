# Clervo Next

Clean-room repository for the Clervo BlockRun-10x mission.

## Current state

Tickets **N0.1** through **N4.10** are complete. The clean-room foundation, contracts, mock commerce, observability, routing, and deterministic search stages are implemented. Search now has strict free and paid HTTP boundaries plus an injected repository-local recorded executor that composes two-path qualification and federation, bounded fetch, isolated extraction, content deduplication, deterministic ranking, exact citations, optional cited synthesis, replay coalescing, and the explicit test-only mock-paid receipt path end to end over loopback.

The selected foundation is TypeScript on Node.js 24 LTS, PostgreSQL 18, and pg-boss 12 backed by the same PostgreSQL cluster. npm manages the workspace. `packages/contracts` remains the source of truth for the versioned contracts; `services/search/src/recorded-pipeline.ts` is an offline evidence executor, not a live provider adapter. Generated discovery marks `search.query` as `implemented_unverified` and keeps public deployment and payment-readiness claims false. Brave Search API and Common Crawl remain provisionally selected but not live-qualified. Live provider-to-fetch execution, browser rendering, calibrated/live quality, durable distributed state, real payment verification/settlement, telemetry delivery, and live deployment remain intentionally unimplemented.

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
