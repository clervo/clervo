# ADR-0001: Clean-room repository boundary

- **Status:** accepted
- **Date:** 2026-07-29
- **Ticket:** N0.1

## Context

The legacy Clervo runtime contains useful lessons but also inherited application wiring, operational state, provider assumptions, and deployment history. The controlling plan requires a new repository whose architecture and release lifecycle are independent.

## Decision

`/workspace/clervo-next` is an independent Git repository with these mandatory top-level architecture boundaries:

```text
apps/       public API, worker, and site
packages/   shared contracts, commerce, catalog, routing, observability, SDKs, and MCP
services/   six product-pillar implementations
adapters/   isolated upstream integrations
infra/      deployment, storage, queues, and secret boundaries
tests/      contract, integration, acceptance, security, and load tests
```

The repository must not:

- import, execute, mount, or locally package-link the legacy runtime;
- use legacy databases, queues, ledgers, catalogs, generated artifacts, volumes, or networks;
- contain symlinks or Git links that escape the repository;
- select the runtime, database, or queue before ticket N0.2;
- establish CI, environment separation, or staging before ticket N0.3.

The boundary is enforced by `scripts/verify-clean-room-boundary.sh` and by review. The automated check is necessary but cannot prove conceptual originality; later tickets must continue to document implementation sources and clean-room decisions.

## Alternatives rejected

1. **Continue inside `/workspace/x402-platform`.** Rejected because it inherits the old runtime and state boundary.
2. **Fork or copy the legacy repository.** Rejected because copied wiring and hidden dependencies would defeat the clean-room mission.
3. **Create a package inside the workspace root repository.** Rejected because N0.1 explicitly requires a new repository and release identity.

## Consequences

- Initial progress is slower than copying existing modules, but provenance and operational isolation are explicit.
- Concepts and tests may be reimplemented only under a later authorized ticket.
- Runtime and infrastructure choices remain open and must be decided by their ordered tickets.
