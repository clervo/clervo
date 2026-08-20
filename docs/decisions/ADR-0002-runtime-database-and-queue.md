# ADR-0002: Runtime, database, and queue

- Status: accepted

Clervo uses TypeScript on Node.js 24, PostgreSQL 18 as the authoritative durable
store, pg-boss on the same PostgreSQL boundary for durable jobs, and npm with a
committed lockfile. Exact supported versions are declared in `package.json` and
the runtime version files.

PostgreSQL owns operation state, idempotency, quotes, receipts, reconciliation,
and balanced-ledger records. Queue delivery does not imply exactly-once external
effects: workers still require idempotent handlers, explicit state transitions,
bounded retries, dead-letter handling, and reconciliation.

`scripts/verify-runtime.mjs` and `scripts/verify-stack-decision.mjs` check the
executing toolchain against this decision.
