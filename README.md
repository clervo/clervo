# Clervo Next

Clean-room repository for Clervo: one wallet and one machine-discoverable x402 platform to **Find → Reason → Execute** through Search, broad AI inference, and a secure Sandbox.

The Initial Commercial Release requires exactly Search, AI, and Sandbox plus the shared commerce, discovery, SDK/MCP, onboarding, deployment, monitoring, settlement, and external-user proof gates. RPC, Prediction, and Crypto Intelligence remain preserved as planned post-launch Full Platform Expansion pillars; their directories and contracts are not availability claims.

## Current state

Tickets **N0.1** through **N4.22**, NPLAN.1, and N4.23A are complete. N4.23A supersedes paid general-Web supplier recommendations for the Initial Commercial Release: the selected core architecture has exactly zero third-party search-provider API cost and uses `clervo.focused-index.v1` plus `clervo.live-federation.v1`. Scrapling 0.4.12, provisional internal Crawl4AI 0.9.2/Playwright 1.61.0, and Meilisearch 1.51.0 community features passed a bounded loopback tool benchmark; neither route is implemented, staging-qualified, or available yet. Public Nominatim remains excluded and Common Crawl bodies remain development-only. Workspace TypeScript 7.0.2 accepts `ES2023`; no repository downgrade is needed. Stage 4 remains `blocked` with 21 checks; search is not the reference pattern and Stage 5 AI implementation is not authorized or started. The exact next ticket is N4.23B, the focused owned-index route.

The selected foundation is TypeScript on Node.js 24 LTS, PostgreSQL 18, and pg-boss 12 backed by the same PostgreSQL cluster. npm manages the workspace. `packages/contracts` remains the source of truth for versioned contracts and release lifecycle; `services/search/src/recorded-pipeline.ts` is an offline evidence executor, not a live provider adapter. Generated discovery marks separately priced `search.web` and `search.answer` products as `implemented_unverified`, Search as `preview`, AI and Sandbox as `unavailable`, and the three expansion pillars as `planned_post_launch`; public deployment and payment-readiness claims remain false. N4.18 deployed immutable release `2f6fd6c` to private authenticated Cloud Run revision `clervo-stage4-slice-staging-00001-7fn`; checked-in smoke and request-log evidence verifies release health, the recorded free sample, and the non-payable paid challenge while keeping mock-paid execution disabled. N4.19–N4.21 remain historical development supply/mechanics evidence. N4.23A now selects the zero-provider-cost Clervo-controlled architecture and pins the bounded toolchain without wiring it into product execution. Public shared SearXNG remains ineligible; public Nominatim remains non-resale; Common Crawl metadata may support discovery but archived bodies remain legal-review gated and excluded from paid output. Crawl4AI is selected only as a provisional internal fallback pending N4.25 isolation. Query rewriting, the injected isolated-JavaScript boundary, cache-freshness disclosure, language/region options, product pricing, internal monitoring snapshots, provenance, citations, ranking, synthesis, and prior benchmarks remain unchanged. Live product retrieval, calibrated general-Web quality, durable distributed state, real payment verification/settlement, delivered monitoring, and public deployment remain unimplemented or unverified.

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
