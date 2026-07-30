# ADR-0002: Runtime, database, and durable queue

- **Status:** accepted
- **Date:** 2026-07-29
- **Ticket:** N0.2

## Context

Clervo needs a foundation for a public HTTP/x402 API, durable asynchronous workers, TypeScript and Python SDKs, and six provider-backed product pillars. Its shared commerce kernel requires durable operation states, client idempotency, atomic ledger changes, exactly-once charging at the application boundary, safe unknown-outcome reconciliation, and immutable receipts.

The Stage 0 choice should minimize independent failure domains without pretending that a queue library alone can guarantee exactly-once external side effects.

## Decision

Use this foundational stack:

1. **Runtime:** TypeScript 7 on **Node.js 24 LTS**, using ECMAScript modules and npm workspaces when packages are introduced. Production must stay within `>=24.12.0 <25` until an explicit upgrade ADR. Node 24.12 is the first Node 24 release where built-in type stripping is stable, but Clervo will retain the TypeScript compiler for full type checking and language support.
2. **Database:** **PostgreSQL 18**, with deployment artifacts initially pinned to the current `18.4` minor release. PostgreSQL is the authoritative store for operations, idempotency records, quotes, receipts, reconciliation, and the balanced ledger.
3. **Durable queue:** **pg-boss 12.26.3**, backed by the same PostgreSQL cluster. Jobs may be inserted in the same database transaction as application state. Workers must still use idempotent handlers, explicit state transitions, bounded retries, dead-letter handling, and reconciliation because process crashes and external side effects can produce redelivery or unknown outcomes.
4. **Package manager:** **npm 10.9.8**, committed through `package-lock.json`. Exact direct dependency versions are used; automated upgrades require tests and review.

Version declarations are cross-checked by `scripts/verify-stack-decision.mjs`. N0.2 selects versions but does not provision PostgreSQL, create schemas, start workers, or establish CI and environments.

## Evidence reviewed

Freshness date: 2026-07-29.

- Node.js official release guidance says production applications should use Active or Maintenance LTS. Node 24 began LTS on 2025-10-28, enters maintenance on 2026-10-20, and reaches end of life on 2028-04-30. Node 22 reaches end of life on 2027-04-30.
- Node.js documents stable built-in TypeScript type stripping in Node 24.12, while noting that it does not read `tsconfig.json` or support all TypeScript transformations; third-party tooling remains the full-support path.
- PostgreSQL supports each major for five years. The current supported majors are 18 through 14; 18.4 is the current PostgreSQL 18 minor and PostgreSQL recommends staying on the current minor.
- PostgreSQL transactions provide atomic commit/rollback, durable acknowledgement, and isolation of incomplete changes. Unique constraints provide database-enforced idempotency primitives.
- PostgreSQL documents `SKIP LOCKED` as appropriate for avoiding contention among multiple consumers of a queue-like table, while warning that it gives an inconsistent general-purpose view.
- pg-boss is MIT-licensed, requires Node 22.12+ and PostgreSQL 13+, supports transactional job creation, retries, dead-letter queues, scheduling, and PostgreSQL `SKIP LOCKED`. The current registry/release version observed was 12.26.3, with active 12.26.x releases.
- The current x402 repository contains TypeScript, Python, Go, and Java implementations; `@x402/core` was current on the npm registry and is compatible with a TypeScript/Node integration path. No x402 package is added by this ticket.

## Alternatives rejected or deferred

1. **Node.js 22 LTS.** Compatible with pg-boss and locally installed, but has a shorter remaining support window. Local N0.2 metadata tests may run on Node 22; application execution targets Node 24.
2. **Node.js 26 Current.** Not yet LTS as of the decision date; official guidance reserves production for LTS lines.
3. **Python as the primary runtime.** Strong for data/AI workers and retained for the future Python SDK or isolated workloads, but TypeScript aligns more directly with the public HTTP/x402 ecosystem and current repository SDK evidence. A second primary runtime would increase contract and operational complexity.
4. **Go or Rust as the primary runtime.** Strong performance and deployment properties, but neither toolchain is locally available and both increase integration cost for the TypeScript-first x402/API surface. They remain valid for later isolated performance-sensitive components if evidence justifies them.
5. **SQLite.** Excellent local and embedded database, but not selected as the authoritative multi-worker commerce ledger because the target requires concurrent API/worker execution and production-grade operational tooling.
6. **BullMQ with Redis/Valkey.** Mature and fast, with retries and crash recovery, but adds a second durable state system and cross-system atomicity problem. Its documentation describes at-least-once delivery in the worst case.
7. **Temporal.** Provides durable workflow resumption and supports TypeScript, but requires a separate Temporal service or cloud control plane and introduces more operational/conceptual weight than Stage 0 needs. Reconsider if long-running multi-step orchestration outgrows the PostgreSQL queue model.
8. **PGMQ.** Lightweight PostgreSQL queue with a permissive PostgreSQL license, archives, and visibility timeouts. Its explicit visibility-timeout/redelivery model and extension/SQL integration require more queue plumbing for this Node-first application than pg-boss.
9. **A custom PostgreSQL `SKIP LOCKED` queue.** Technically viable, but rejected in favor of maintained retry, scheduling, dead-letter, migration, and monitoring behavior.
10. **Managed proprietary database or queue as the architecture contract.** Deferred. N0.3 may choose hosting, but application contracts must remain portable across conforming PostgreSQL providers.

## Security, licensing, and operational consequences

- Node.js and PostgreSQL use their project licenses; pg-boss is MIT; TypeScript is Apache-2.0; npm is Artistic-2.0. No copyleft runtime dependency was introduced by this decision.
- PostgreSQL credentials, TLS, backups, point-in-time recovery, connection pooling, row-level access, migrations, and provider selection remain unresolved and must be addressed by authorized later tickets.
- Queue delivery is not equivalent to exactly-once charging or execution. Database uniqueness, application idempotency, external request identifiers, result verification, and reconciliation remain mandatory.
- The API and worker share a database failure domain by design. This reduces split-brain state but makes PostgreSQL availability and capacity critical; observability and load gates must cover both transactional and queue workload.