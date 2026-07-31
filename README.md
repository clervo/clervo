# Clervo Next

Clean-room repository for **Clervo — outcome infrastructure for agents.** The permanent expansion narrative is **Find → Understand → Act**.

The First Revenue Release is **Clervo Live Intelligence**: a finished product for discovering, retrieving, structuring, verifying, comparing, and monitoring live information from the open Web and authorized sources. AI later adds understanding and reasoning; Sandbox later adds bounded transformation and execution. RPC, Prediction, and Crypto Intelligence remain later additive platform expansions. New engines do not rebrand Clervo or silently change stable capability identifiers, schemas, endpoints, request hashes, commerce semantics, MCP tools, SDK behavior, discovery, or lifecycle truth.

## Current state

Tickets **N0.1** through **N4.27**, NPLAN.1, and NPLAN.2 are complete at their recorded boundaries. NPLAN.2 changes only the future launch program; it does not rewrite historical outcomes. N4.27 repaired the N4.26 regression but failed its one-shot frozen holdout: balanced recall/precision were 0.04/0.04, nDCG@10 and MRR@10 were zero, extraction was 0.92, and p95 was 4688.24 ms. Browser qualification reached 18/20, and the complete security suite remains incomplete. All ten blockers remain; mock x402 was correctly never started. Search is not commercially competitive or the reference pattern, and Stage 5 is unauthorized. The exact repair ticket is N4.27R only under separate authority.

The selected foundation is TypeScript on Node.js 24 LTS, PostgreSQL 18, and pg-boss 12 backed by the same PostgreSQL cluster. npm manages the workspace. `packages/contracts` remains the source of truth for versioned contracts and lifecycle; generated discovery names Clervo Live Intelligence as the not-ready First Revenue Release, keeps Search `preview`, AI and Sandbox `unavailable`, later pillars `planned_post_launch`, and public payment readiness false. N4.18's immutable private recorded-only release `2f6fd6c` remains the last verified release deployment; N4.26 and N4.27 were temporary staging qualification, not releases. N4.27 cleaned up all isolated compute/network resources, leaving USD 0/day active incremental exposure. Payable settlement, compatible-baseline improvement, complete browser/security/cache/locale/cost proof, public deployment, compare/change/alert workflows, onboarding, distribution, and external paid demand remain unimplemented or unverified.

## Authority

The controlling plan is:

`/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md`

The canonical repository launch authority is:

`docs/product/CLERVO-LIVE-INTELLIGENCE-LAUNCH-AUTHORITY.md`

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
