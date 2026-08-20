# ADR-0001: Repository boundary

- Status: accepted

Clervo is an independent repository. Its top-level ownership boundaries are:

- `apps/`: public API, worker, and site;
- `packages/`: shared contracts, commerce, catalog, routing, observability, and clients;
- `services/`: product implementations;
- `adapters/`: isolated upstream integrations;
- `infra/`: deployment, storage, queues, and secret boundaries; and
- `tests/`: contract, integration, acceptance, security, and load tests.

The repository must not import, execute, mount, or package-link another project,
or share its databases, queues, ledgers, catalogs, volumes, networks, or runtime
state. Symlinks and Git links that escape the repository are forbidden.
`scripts/verify-clean-room-boundary.sh` enforces the mechanical portion of this
decision.
