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

## 2026-07-29 — N0.3 CI, secret scanning, environments, and staging readiness

- Added GitHub Actions CI and staging-readiness workflows with immutable action SHAs, read-only token permissions, non-persisted checkout credentials, disabled install scripts/cache, bounded timeouts, and the canonical `npm test` gate.
- Added a zero-dependency scanner for committable working-tree files and committed history. Its injected credential failure test rejected the file and exposed only rule/path metadata, not the matched value.
- Defined isolated development, test, staging, and production contracts with distinct database, queue, secret-source, data, provider, and approval policies. Added a safe `.env.example` containing names/defaults only.
- Added the minimal hello service, loopback staging smoke test, provider-neutral release manifest, and previous-verified-commit rollback contract. Recorded GitHub environment configuration requirements and the risk that an absent referenced environment is created without protections.
- Validation: clean Node.js 24.18.1 install resolved 25 packages; `npm test`, explicit staging smoke, syntax checks, boundary checks, and `git diff --check` passed. No remote exists and `gh`, `gcloud`, and `docker` are absent, so remote CI/protection and live staging/rollback remain unverified.
- Cost/network effects: read-only GitHub documentation/API/Git tag and npm registry requests; local loopback HTTP only during smoke; no provider/cloud/IAM/deployment mutations or payments; 0 USDC spent.
- Claims still unknown: observed remote CI/branch protection; protected GitHub environment settings; live staging/rollback; running PostgreSQL/pg-boss; product API contracts; provider state; payment and production behavior.
- Exact next ticket: N1.1 — define envelopes, errors, operation states, and idempotency.

## 2026-07-29 — N1.1 envelopes, errors, operation states, and idempotency

- Added the `@clervo/contracts` TypeScript source of truth with versioned request/result/problem/snapshot types, a 17-state fail-closed lifecycle, stable problem type URIs, restricted idempotency keys, replay decisions, and SHA-256 canonical request fingerprints.
- Published four strict JSON Schema Draft 2020-12 schemas and six positive/negative fixtures. Errors follow RFC 9457; fingerprints use an RFC 8785/JCS implementation that rejects non-finite numbers and unpaired Unicode surrogates.
- Bound idempotency to canonical request content: matching completed work replays, matching in-progress work resumes/observes, changed input conflicts, and unknown execution or settlement outcomes require reconciliation rather than a new side effect.
- Added repository lint, strict TypeScript typecheck/build, Ajv 2020-12 contract validation, and eight adversarial tests. Hardened the existing secret scanner to tolerate intentionally deleted tracked paths while committed content remains covered by history scanning.
- Validation: downloaded the official Node.js 24.18.1 Linux archive and verified its published SHA-256 checksum; used Node.js 24.18.1 with npm 10.9.8; a clean install resolved 31 packages; `npm test` passed all Stage 0 gates, 4 schemas, 6 fixtures, and 8/8 N1.1 tests. Production audit found 0 vulnerabilities; staging smoke, syntax checks, boundary verification, and `git diff --check` passed.
- Cost/network effects: read-only official standards/Ajv/npm/Node metadata and archive requests; local dependency installation and loopback HTTP only; no provider/cloud/IAM/deployment mutations or payments; 0 USDC spent.
- Claims still unknown: database uniqueness/concurrency/retention enforcement; HTTP status/header behavior; catalog, adapter, receipt, and audit compatibility; OpenAPI/discovery; provider execution; payment and production behavior.
- Exact next ticket: N1.2 — define catalog, adapter, receipt, and audit contracts.
