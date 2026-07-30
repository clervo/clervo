# Clervo Next

Clean-room repository for the Clervo BlockRun-10x mission.

## Current state

Tickets **N0.1** and **N0.2** are complete: the independent repository boundary is enforced, and the foundational runtime, database, and durable queue have been selected and pinned.

The selected foundation is TypeScript on Node.js 24 LTS, PostgreSQL 18, and pg-boss 12 backed by the same PostgreSQL cluster. npm manages the JavaScript workspace. Application code, database provisioning, provider integrations, payment code, CI, environments, and deployment configuration are intentionally **not implemented yet**. Those outputs belong to later ordered tickets.

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
./scripts/verify-clean-room-boundary.sh
./scripts/verify-stack-decision.mjs
```

The commands use local POSIX tools, Git, and Node.js. They perform no network access, provider calls, cloud changes, or payments. The stack verifier checks decision metadata and version consistency; it does not connect to PostgreSQL or start a worker.
