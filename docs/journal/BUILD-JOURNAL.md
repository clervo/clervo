# Clervo Next append-only build journal

Do not edit or delete completed entries. Add a new dated entry for each ticket.

## 2026-07-29 — N0.1 clean-room repository boundary

- Created `/workspace/clervo-next` as an independent Git repository.
- Added the mandatory architecture directory skeleton without selecting a runtime, database, queue, or package manager.
- Recorded ADR-0001 and the N0.1 ticket evidence.
- Added a local, non-networked boundary verifier covering repository identity, mandatory directories, symlinks, submodules, gitlinks, legacy-runtime path references, and escaping local dependency references.
- Cost/network effects: no network calls, provider calls, cloud/IAM changes, deployment mutations, or payments; 0 USDC spent.
- Claims still unknown: runtime/database/queue selection, application contracts, CI, environments, staging, deployment, provider health, and production behavior.
- Exact next ticket: N0.2 — select runtime/database/queue with a bounded two-hour decision.

## 2026-07-29 — N0.2 runtime, database, and durable queue

- Ran a bounded current-state preflight across official Node.js and PostgreSQL support/semantics documentation, maintained queue repositories, x402 language support, public package metadata, licenses, and local tool availability.
- Selected TypeScript 7 on Node.js 24 LTS with ESM/npm, PostgreSQL 18 as the authoritative transactional store, and pg-boss 12 on the same PostgreSQL cluster as the durable queue.
- Recorded rejected alternatives and explicit limitations in ADR-0002. Queue delivery does not replace application idempotency, exactly-once charging controls, or reconciliation.
- Added exact version declarations, an npm lockfile, and a local consistency verifier. Updated the boundary verifier to ignore generated `node_modules` links while continuing to reject source-tree links. No application, database schema, queue worker, CI, environment, or deployment was created.
- Validation: a clean dependency install under Node.js 24.18.1 installed 25 packages; TypeScript 7.0.2 executed; the production audit found 0 vulnerabilities; `npm test` passed; injected PostgreSQL-major drift and an escaping source-tree symlink were both rejected with exit 1; clean checks passed after restoration.
- Cost/network effects: read-only public documentation, Git, and npm registry requests; no provider/cloud/IAM mutations or payments; 0 USDC spent.
- Claims still unknown: running database and queue behavior, schema/migrations, application contracts, CI, environments, staging, deployment, provider health, and production behavior.
- Exact next ticket: N0.3 — establish CI, secret scanning, environments, and staging.
