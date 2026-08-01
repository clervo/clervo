# Clervo Next

Clean-room repository for **Clervo — outcome infrastructure for agents.** The permanent product narrative is **Find → Understand → Act**.

The First Revenue Release is the all-six **Clervo Platform**: Live Intelligence/Search, AI, Secure Sandbox, RPC, Prediction, and Crypto Intelligence. It is not ready. Search is the only current `preview`; the other five pillars are `unavailable`, and implementation of those five product cores has not started. The product cores must be built and stabilized privately before a cross-pillar contract freeze. Only after that freeze does one shared API, MCP, SDK, onboarding, design, documentation, discovery, JSON-LD, sitemap, SEO, and distribution pass begin. This order does not rebrand Clervo or silently change stable capability identifiers, schemas, endpoints, request hashes, commerce semantics, tools, or lifecycle truth.

## Current state

Tickets **N0.1** through **N4.27S**, NPLAN.1, NPLAN.2, NPLAN.3, and its NPLAN.3R handoff repair are complete at their recorded boundaries. NPLAN.3 changes the future launch program; it does not rewrite those historical outcomes. N4.27S completed one frozen private-staging qualification and failed its mandatory product gate: combined recall/precision were 0.8000/0.6803, browser qualification was 4/20, and hostile-page execution was 0/8. Five Stage 4 blockers remain: isolated JavaScript retrieval, prompt-injection boundaries, separate raw and synthesis prices, a deployed paid route, and cost-cap compliance. Mock x402 and payment were not started. Search is not commercially competitive, production-qualified, or the reference pattern, and Stage 5 remains unauthorized.

NPLAN.4 is complete at its governance boundary. It installs one-ticket fresh-
cycle dispatch, bounded repair tickets, a one-time owner prerequisite package,
and a USD 0 mandatory paid-API cash rule. **N4.27T** is the next admitted
repository-local ticket under its existing owner authorization. Its cloud phase
remains blocked on exact owner-prepared resource/cost/cleanup inputs and a
separate explicit owner action until trusted signed-manifest enforcement exists.
That authorization does not start N4.28, mock x402, payment, Stage 5, any unavailable
product core, or a later roadmap stage.

The selected foundation is TypeScript on Node.js 24 LTS, PostgreSQL 18, and pg-boss 12 backed by the same PostgreSQL cluster. npm manages the workspace. `packages/contracts` remains the source of truth for versioned contracts and lifecycle. The truthful launch scope is all six pillars, with Search `preview`, five pillars `unavailable`, the release gate false, and public payment readiness false. N4.18's immutable private recorded-only release `2f6fd6c` remains the last verified release deployment; N4.26 through N4.27S were temporary qualification work, not releases. N4.27S cleaned up its isolated resources, leaving USD 0/day active incremental exposure. The remaining Stage 4 proof, all five unavailable product cores, cross-pillar freeze, shared access and distribution layer, payable settlement, production deployment, and external useful paid demand remain unimplemented or unverified.

## Authority

The controlling plan is:

`/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md`

The canonical repository launch authority is:

`docs/product/CLERVO-LIVE-INTELLIGENCE-LAUNCH-AUTHORITY.md`

Autonomous completion and the owner-only package are documented at:

`docs/operations/AUTONOMOUS-COMPLETION.md`

`docs/operations/OWNER-ONLY-PREREQUISITES.md`

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
npm run verify:autonomous-completion
npm test
npm run staging:smoke
```

The repository requires exactly Node.js 24.18.1. `.nvmrc`, `.node-version`, and `.tool-versions` select that runtime in common version managers; npm uses strict engine enforcement; install and acceptance fail closed if the executing Node.js version differs. The commands use local POSIX tools, Git, and Node.js. Acceptance performs no external network access, provider calls, cloud changes, or payments; staging smoke uses loopback HTTP only. The checks do not connect to PostgreSQL, start pg-boss, or prove remote GitHub Actions/environment protection or live hosting.
