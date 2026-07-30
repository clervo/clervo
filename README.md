# Clervo Next

Clean-room repository for the Clervo BlockRun-10x mission.

## Current state

Tickets **N0.1** through **N1.2** are complete: the independent foundation and staging boundary are established, and product contracts now define versioned operation envelopes, fail-closed lifecycle/idempotency, catalog activation, removable provider adapters, qualification evidence, immutable receipts, and allowlisted audit events.

The selected foundation is TypeScript on Node.js 24 LTS, PostgreSQL 18, and pg-boss 12 backed by the same PostgreSQL cluster. npm manages the JavaScript workspace. `packages/contracts` publishes the repository-local source of truth for operation, catalog, adapter, qualification, receipt, and audit schemas/logic. Persistence, HTTP handlers, generated OpenAPI/discovery, provider implementations, payments, and live deployment remain intentionally unimplemented.

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
