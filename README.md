# Clervo Next

Clean-room repository for the Clervo BlockRun-10x mission.

## Current state

Only ticket **N0.1** is complete here: the independent repository boundary and mandatory architecture directories exist, and the repository includes an executable proof that it does not depend on the legacy runtime.

Runtime, database, queue, package manager, application code, provider integrations, payment code, CI, and deployment configuration are intentionally **not selected or implemented yet**. Those decisions belong to later ordered tickets.

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
```

The command uses standard POSIX tools plus Git and performs no network access, provider calls, cloud changes, or payments.
