# Clervo Next

Clean-room repository for **Clervo — outcome infrastructure for agents.** The permanent product narrative is **Find → Understand → Act**.

The First Revenue Release is the all-six **Clervo Platform**: Live Intelligence/Search, AI, Secure Sandbox, RPC, Prediction, and Crypto Intelligence. It is not ready. Search is the only current `preview`; the other five pillars are `unavailable`, and implementation of those five product cores has not started. The product cores must be built and stabilized privately before a cross-pillar contract freeze. Only after that freeze does one shared API, MCP, SDK, onboarding, design, documentation, discovery, JSON-LD, sitemap, SEO, and distribution pass begin. This order does not rebrand Clervo or silently change stable capability identifiers, schemas, endpoints, request hashes, commerce semantics, tools, or lifecycle truth.

## Current state

Stage 4 passed its evidence-bound exit. Stage 5 work N5.1 established the
unfrozen six-pillar registry and explicit schema-visibility boundary; N5.2 added
deterministic hash-bound evidence comparison and typed change detection. Search
remains `preview`; AI, Sandbox, RPC, Prediction, and Crypto Intelligence remain
`unavailable`. Monitoring execution and delivery, the other five product cores,
cross-pillar freeze, shared access/distribution, production deployment, real
settlement, and external paid demand remain unimplemented or unverified.

The selected foundation is TypeScript on Node.js 24 LTS, PostgreSQL 18, and
pg-boss 12 backed by the same PostgreSQL cluster. npm manages the workspace.
`packages/contracts` remains the source of truth for versioned contracts and
lifecycle.

## Roadmap and workflow

The product-scope roadmap is:

`/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md`

Its stages and ticket identifiers are an ordered implementation checklist, not
task authorization boundaries. Continuous engineering rules are in `AGENTS.md`;
genuine owner-only prerequisites are in
`docs/operations/OWNER-ONLY-PREREQUISITES.md`. Retired process history is under
`docs/archive/process-control/`.

## Runtime setup

Repository execution is pinned exactly to Node.js `24.18.1` and npm `10.9.8`. Select the committed version before installing or running commands: `nvm install && nvm use`, `asdf install`, or `mise install`. The same pin is recorded in `.nvmrc`, `.node-version`, `.tool-versions`, `package.json`, `package-lock.json`, and `infra/stack-versions.env`; `npm install` and every npm script fail immediately if the active Node.js process differs. Run `npm run verify:runtime` to diagnose the active process and `npm test` for canonical acceptance.

The absolute path above is documentation for operators, not a runtime dependency. Product code must not import, mount, execute, or otherwise depend on the legacy `/workspace/x402-platform` repository or its state.

## Repository boundary

- This directory is its own Git repository.
- Legacy code, databases, queues, catalogs, ledgers, generated artifacts, and deployment state are evidence only.
- No symlink, submodule, gitlink, local package dependency, or runtime path may escape this repository.
- Small proven concepts may be reimplemented inside the clean-room boundary.

## Validation

Run:

```sh
npm run verify:runtime
npm test
npm run staging:smoke
```

The repository requires exactly Node.js 24.18.1. `.nvmrc`, `.node-version`, and `.tool-versions` select that runtime in common version managers; npm uses strict engine enforcement; install and acceptance fail closed if the executing Node.js version differs. The commands use local POSIX tools, Git, and Node.js. Acceptance performs no external network access, provider calls, cloud changes, or payments; staging smoke uses loopback HTTP only. The checks do not connect to PostgreSQL, start pg-boss, or prove remote GitHub Actions/environment protection or live hosting.
