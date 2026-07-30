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

## 2026-07-29 — N1.2 catalog, adapter, receipt, and audit contracts

- Added strict catalog entries with activation gates for qualified supply, reviewed terms, non-free maximum charges, exact-identity non-substitution, schema references, delivery modes, and bounded payload-retention policy.
- Defined the provider-neutral adapter interface (`capabilities`, `qualify`, `health`, `estimateCost`, `execute`, `normalize`, `classifyError`) plus dated/expiring qualification artifacts and fail-closed unknown-consumption retry classification. Manifests accept secret names only, never values.
- Added canonical SHA-256 sealed receipts that bind request/quote/result/provenance and keep customer charge separate from supplier cost, plus append-orderable audit events with an allowlist of scalar facts and optional W3C-compatible trace identifiers. Raw payloads, credentials, authorization proofs, settlement material, and provider responses are not contract fields.
- Published five additional strict JSON Schema Draft 2020-12 schemas and nine positive/negative fixtures. Failure evidence rejects active unqualified catalogs, exact-identity substitution, non-free products without a charge ceiling, secret values in manifest name lists, paid unsettled receipts, and secret-bearing arbitrary audit fields.
- Validation: Node.js 24.18.1 with npm 10.9.8 ran `npm test` with exit 0. All Stage 0/N1.1 gates passed; 9 schemas and 15 fixtures validated; N1.1 passed 8/8 and N1.2 passed 7/7. Focused staging smoke, production audit (0 vulnerabilities), syntax, typecheck, secret scan, and diff checks passed.
- Cost/network effects: read-only public standards evidence and local dependency audit metadata; local compilation/tests and loopback HTTP only; no provider/cloud/IAM/deployment/payment mutations; 0 USDC spent.
- Claims still unknown: generated OpenAPI/discovery; transactional persistence/immutability; signatures or external anchoring; real adapter qualification, lawful terms, health, identity, cost, or execution; observability pipeline; payload retention enforcement; payment and production behavior.
- Exact next ticket: N1.3 — generate/test OpenAPI and discovery.

## 2026-07-30 — N1.3 generated OpenAPI and truthful discovery preview

- Ran a bounded preflight against OpenAPI 3.1.1 and the current informal `llms.txt` proposal; stopped without competitor/provider research. An attempted official x402 resource-server documentation URL returned 404, so no x402 discovery contract was inferred or published.
- Added deterministic OpenAPI 3.1.1 generation from all nine existing Draft 2020-12 schemas, exact versioned public schema copies, `/.well-known/clervo.json`, and `/llms.txt`.
- Kept the preview truthful: OpenAPI has no paths or production server claim; discovery is non-callable with no products, unimplemented x402 payment, unverified settlement, and unverified deployment. A generator guard rejects injected false-live or false-payment states before writing artifacts.
- Added six focused tests covering OpenAPI shape/schema count, strict schema compilation and copy parity, discovery truth, `llms.txt` proposal structure, false-readiness rejection, and common secret patterns.
- Validation: Node.js 24.18.1 with npm 10.9.8 ran `npm test` with exit 0. Clean-room, stack, environment, working-tree/history secret, and N0.3 injected-failure gates passed; 9 schemas and 15 fixtures validated; N1.1 passed 8/8, N1.2 passed 7/7, and N1.3 passed 6/6. A second generation produced byte-identical top-level OpenAPI, discovery, and `llms.txt` hashes; `git diff --check` passed.
- Cost/network effects: three bounded read-only specification requests, one returning 404; local generation/tests only; no provider, cloud, IAM, deployment, or payment mutations; 0 USDC spent.
- Claims still unknown: live HTTP artifact serving, product paths/schemas/examples, security/x402 behavior, persistence, real providers, catalog publication, payment/settlement, remote publication, and production behavior.
- Exact next ticket: N2.1 — build quote and mock x402 challenge.

## 2026-07-30 — N2.1 hash-bound quote and mock x402 challenge

- Ran a bounded preflight against the official `x402-foundation/x402` v2 core and HTTP transport specifications after the former Coinbase raw path returned 404. No provider, facilitator, wallet, or competitor survey was performed.
- Added deterministic quotes binding operation, product, request hash, price version, maximum charge, issue/expiry times, and a canonical SHA-256 quote hash.
- Added an x402 v2-shaped offline 402 response using the canonical base64 `PAYMENT-REQUIRED` header. The only accepted payee is `mock:*`; the challenge is marked non-payable and explicitly disables signature acceptance, verification, facilitator use, authorization, settlement, and execution.
- Added strict schemas/fixtures and seven adversarial tests. Expired/tampered quotes, excessive timeout, asset mismatch, non-mock payees, altered request binding, and injected payment-readiness claims fail closed.
- Validation: Node.js 24.18.1 compiled successfully; contract validation passed 11 schemas and 19 fixtures; N1.1/N1.2 passed 15/15, N1.3 passed 6/6, and N2.1 passed 7/7. The N0.3 injected-secret acceptance and loopback staging smoke passed; the working-tree/full-history secret scan passed without printing values; generated top-level artifacts were byte-stable; `git diff --check` passed.
- Cost/network effects: bounded read-only official specification requests and local work only; no provider, facilitator, wallet, cloud, IAM, deployment, or payment mutations; 0 USDC spent.
- Claims still unknown: live HTTP challenge serving, PaymentPayload parsing, real networks/assets/payees, verification, authorization, ledger, settlement, reconciliation, product execution, and production behavior.
- Exact next ticket: N2.2 — build ledger, mock settlement, replay, and reconciliation.

## 2026-07-30 — N2.2 mock ledger, settlement, replay, and reconciliation

- Reviewed only the controlling Stage 2 exit criteria and repository-local N1/N2 contracts; no external provider, facilitator, wallet, or competitor research was needed.
- Added a deterministic dependency-injected mock commerce kernel that verifies exact mock payment/quote/request/ceiling bindings before one execution, then seals authorization, settlement, balanced ledger, and receipt evidence.
- Added idempotent replay and conflict behavior. Same-key retries replay stored completion or quarantine evidence without another execution or posting; changed requests fail closed.
- Added settlement quarantine and reconciliation. Unknown outcomes create no ledger entry or receipt; only definitive, tamper-valid evidence bound to the same authorization and settlement ID can complete from stored execution evidence.
- Added three strict schemas, six fixtures, and eight adversarial tests covering the complete flow, replay, conflicts, cross-key payment reuse, rejected payments, quarantine, reconciliation, and tampered evidence.
- Validation: lint and strict TypeScript typecheck passed; 14 Draft 2020-12 schemas and 25 fixtures validated; N1.1 passed 8/8, N1.2 7/7, N1.3 6/6, N2.1 7/7, and N2.2 8/8. Clean-room/stack/environment checks, deterministic regeneration, loopback staging smoke, full-history secret scan, and diff checks passed. Long history-scan commands exceeded the tool's 30-second foreground limit; N0.3 signal cleanup was hardened so its intentionally injected fixture is synchronously removed on termination. The shell resolved Node.js 22.23.1, so exact pinned Node.js 24 acceptance remains a CI/provisioned-shell check.
- Cost/network effects: local work only; no provider, facilitator, wallet, cloud, IAM, deployment, or payment mutations; 0 USDC spent.
- Claims still unknown: PostgreSQL transactionality, process-crash recovery, pg-boss recovery, live HTTP/payment/provider behavior, alert delivery, real settlement, and remote deployment.
- Exact next ticket: N3.1 — build redacted observability and alerts.
