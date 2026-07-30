# Clervo Next

Clean-room repository for the Clervo BlockRun-10x mission.

## Current state

Tickets **N0.1** through **N0.3** are complete: the independent repository boundary is enforced; the foundational runtime, database, and durable queue are pinned; and CI, secret scanning, environment separation, and a staging readiness contract are established.

The selected foundation is TypeScript on Node.js 24 LTS, PostgreSQL 18, and pg-boss 12 backed by the same PostgreSQL cluster. npm manages the JavaScript workspace. The repository now contains immutable-action-pinned GitHub workflows, a local and CI secret scanner, distinct development/test/staging/production contracts, and a minimal staging hello-service smoke test. A live remote staging target is **not provisioned**: no Git remote, hosting credential, or deployment provider was available during N0.3.

## Authority

The controlling plan is:

`/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md`

The absolute path above is documentation for operators, not a runtime dependency. Product code must not import, mount, execute, or otherwise depend on the legacy `/workspace/x402-platform` repository or its state.

## Repository boundary

- This directory is its own Git repository.
- Legacy code, databases, queues, catalogs, ledgers, generated artifacts, and deployment state are evidence only.
- No symlink, submodule, gitlink, local package dependency, or runtime path may escape this repository.
- Small concepts may be reimplemented later only when an authorized ticket explicitly permits it.

## Validation

Run:

```sh
npm test
npm run staging:smoke
```

The commands use local POSIX tools, Git, and Node.js. Acceptance performs no external network access, provider calls, cloud changes, or payments; staging smoke uses loopback HTTP only. The checks do not connect to PostgreSQL, start pg-boss, or prove remote GitHub Actions/environment protection or live hosting.
