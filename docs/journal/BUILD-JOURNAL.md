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

## 2026-07-30 — N3.1 redacted observability and alerts

- Ran a bounded preflight against the OWASP Logging Cheat Sheet and OpenTelemetry semantic conventions 1.43.0; no vendor, provider, telemetry-backend, or competitor survey was performed.
- Added separate vendor-neutral contracts for structured log records, metric points, trace spans, and delivery-neutral alert events instead of widening immutable audit events into arbitrary diagnostics.
- Added allowlist-first sanitization: secret-bearing names are removed, secret-bearing values are replaced, control characters are normalized, unknown attributes fail closed, and redaction creates a safe signal without reproducing rejected content.
- Added bounded metric names and dimensions, seconds-based duration histograms, unit-1 counters, fixed alert codes/summaries, stable low-cardinality fingerprints, settlement-unknown alerting, and database/facilitator/network/provider dependency alerts.
- Added four strict schemas, eight positive/negative fixtures, and eight adversarial tests covering redaction, injection normalization, raw-payload rejection, metric cardinality/units, trace timing, settlement quarantine alerts, dependency alerts, and fingerprint stability.
- Validation: the pinned acceptance shell resolved Node.js 24.18.1 and npm 10.9.8; lint, strict typecheck, clean-room/stack/environment gates, working-tree/full-history secret scan, and N0.3 injected-secret negative control passed; 18 Draft 2020-12 schemas and 33 fixtures validated; N1.1/N1.2/N1.3/N2.1/N2.2/N3.1 passed 44/44 tests; deterministic generation and loopback staging smoke passed; `git diff --check` passed.
- Claims still unknown: telemetry exporter/backend operation, remote collection, dashboards, retention, SLOs, paging delivery, alert acknowledgement/resolution, PostgreSQL/pg-boss recovery, live providers/payments, and remote deployment.
- Cost/network effects: bounded read-only standards requests and local work only; no provider, facilitator, wallet, cloud, IAM, deployment, payment, or alert-delivery mutations; 0 USDC spent.
- Exact next ticket: N3.2 — build health, routing, budgets, and circuits.

## 2026-07-30 — N3.2 health, routing, budgets, and circuits

- Added deterministic provider routing that fails closed on unavailable required dependencies, insufficient deadlines, exclusions, non-exact products, failed/expired qualification, stale/unroutable health, expired estimates, open circuits, and exhausted cost or request budgets.
- Added rolling-window circuit state with closed/open/half-open behavior, cooldown, one in-flight probe, success recovery, immediate failed-probe reopening, and immutable snapshots.
- Added atomic in-memory budget reservations for supplier-cost and request ceilings, idempotent reservation replay, conflict rejection, and exactly-once settlement or release accounting.
- Added deterministic candidate ordering, pre-selection budget reservation, safe failover only before possible provider consumption, one strict route-decision schema, two fixtures, a decision record, and eight adversarial tests.
- Validation: the pinned shell resolved Node.js 24.18.1/npm 10.9.8; lint/typecheck and clean-room/stack/environment gates passed; 19 Draft 2020-12 schemas and 35 fixtures validated; N1.1 through N3.2 passed 52/52 tests; deterministic discovery generated 19 public schemas; N0.3 injected-secret rejection/cleanup, current working-tree secret scan, loopback staging smoke, semantic route-schema parity, and `git diff --check` passed. The unchanged eight-commit history retains the full-history pass recorded by N3.1; the current uncommitted delta was rescanned with an empty history range because the API shell terminates the intentionally expensive full-history scanner after 30 seconds.
- Claims still unknown: durable PostgreSQL budget/circuit locking, multi-worker races, crash recovery, live health probes, real provider/facilitator/network/database failure behavior, telemetry export, alert delivery, HTTP routing integration, remote staging, and production availability.
- Cost/network effects: one bounded read-only circuit-breaker guidance request plus local validation; no provider, facilitator, database, wallet, cloud, IAM, deployment, payment, or external traffic mutations; 0 USDC spent.
- Exact next ticket: N4.1 — begin advanced search with one bounded ticket defined from the Stage 4 requirements.

## 2026-07-30 — N4.1 deterministic search result integrity

- Began Stage 4 with the deterministic result boundary rather than live retrieval or synthesis: search evidence retains source identity, original/canonical URLs, timestamps, exact evidence text, and bounded quality inputs.
- Added conservative HTTP(S) URL canonicalization and exact canonical-URL deduplication with deterministic winner selection. Semantic and near-duplicate content removal remain explicitly unimplemented.
- Added transparent integer freshness/authority/relevance/diversity components, basis-point totals, stable tie-breaking, immutable ranked results, and honest deduplication accounting that does not treat result limits as duplicates.
- Added an exact citation verifier: citations must identify a retained result, repeat its canonical URL, stay within evidence offsets, and quote the exact retained substring.
- Added one strict schema, two fixtures, and nine adversarial tests covering URL safety/normalization, deduplication, ordering, score components, malformed/future evidence, duplicate IDs, citation binding, truncation/mismatch rejection, immutability, and limit accounting.
- Validation: pinned Node.js 24.18.1/npm 10.9.8 `npm test` passed with exit code 0, including lint/typecheck, clean-room boundary, stack/environment checks, full-history secret scan, N0.3 injected-secret rejection/cleanup, 20 Draft 2020-12 schemas and 37 fixtures, and N1.1 through N4.1 at 61/61 tests. Discovery generation produced 20 schemas; source/generated search schema semantic parity passed; loopback staging smoke and `git diff --check` passed.
- Claims still unknown: lawful/live retrieval, extraction, normalized content and near-duplicate detection, calibrated provider quality, query rewriting, SSRF/browser isolation, prompt-injection defense, synthesis, benchmarks, HTTP/mock-paid integration, and production behavior.
- Cost/network effects: repository-local work only; no provider, crawler, browser, model, database, wallet, cloud, IAM, deployment, payment, or external traffic; 0 USDC spent.
- Exact next ticket: N4.2 — select and qualify two independent lawful retrieval paths and define the retrieval/extraction safety boundary.

## 2026-07-30 — N4.2 retrieval qualification and safety boundary

- Provisionally selected Brave Search API as the real-time primary and Common Crawl URL Index/archive as the fallback based on bounded official-source review; recorded that independent operation does not imply live qualification.
- Added an immutable evidence-dated qualification snapshot with exact primary/fallback roles, independent failure domains, terms state, content-use permissions, expiry, six mandatory checks, derived route eligibility, and an exact two-path gate.
- Added a fail-closed retrieval-target decision boundary covering HTTP(S)/default-port policy, per-hop redirects, DNS results, local/private/link-local/metadata destinations, robots state, MIME allowlisting, byte ceilings, and content-use restrictions.
- Official terms review recorded Brave's plan-specific storage rights and third-party-content limitation, and Common Crawl's limited license, separate publisher terms, legal-compliance duty, and as-is warranty.
- Brave developer/terms endpoints returned HTTP 403 and no credential was available; Common Crawl documentation was reachable but no bounded URL Index/range-read probe was performed. Both live route gates remain closed.
- Validation: pinned Node.js 24.18.1/npm 10.9.8 `npm test` passed with exit code 0, including lint/typecheck, boundary, stack/environment, working-tree plus full-history secret scan, N0.3 injected-secret rejection/cleanup, 21 Draft 2020-12 schemas and 39 fixtures, and N1.1 through N4.2 at 69/69 tests. Discovery generated 21 schemas; retrieval source/generated schema semantic parity, loopback staging smoke, and `git diff --check` passed.
- Claims still unknown: real provider schema/quota/error behavior, archive throttling and extraction behavior, DNS/socket enforcement, robots cache, parser isolation, retrieval quality, and production availability.
- Cost/network effects: bounded read-only official documentation requests plus local validation; no billable provider calls, credentials, cloud/IAM/deployment mutations, wallet/payment, or USDC spend.
- Exact next ticket: N4.3 — implement the bounded retrieval/fetch safety adapter boundary and run explicitly authorized qualification probes; do not begin synthesis.

## 2026-07-30 — N4.3 bounded retrieval/fetch safety adapter

- Added a provider-neutral bounded fetch adapter with injectable DNS/transport seams and a default Node.js HTTP(S) transport that pins the validated address and rejects connected-address mismatch.
- Enforced fail-closed validation on every robots/content redirect hop, absolute deadlines across DNS/connect/streaming, response aborts, declared and streamed byte ceilings, MIME/content-use allowlists, and immutable SHA-256-bound receipts that preserve issued-hop evidence on failure.
- Added robots retrieval and expiring cache behavior with longest matching user-agent specificity, normalized percent-encoded rule precedence, allow-on-equal-specificity, and archive-only explicit `not_applicable` policy.
- Added one strict schema, two fixtures, and fourteen focused tests covering successful/cache behavior, SSRF/rebinding, redirect revalidation, robots uncertainty/disallow/precedence, deadlines, MIME, byte bounds, unsafe inputs, failed-hop evidence, archive replay, and immutability.
- Ran one bounded, non-billable Common Crawl collection-metadata probe: HTTP 200, 34,675 bytes, SHA-256 `eac053eb9d810c1ca519c99e7fdcf3c24a8042809becbbf6c6854a5795c1d52a`. This proves endpoint reachability only; no URL-index lookup or archive range read occurred, and both provider route gates remain closed.
- Validation: pinned Node.js 24.18.1/npm 10.9.8 `npm test` passed with exit code 0, including lint/typecheck, boundary, stack/environment, working-tree plus full-history secret scan, N0.3 injected-secret rejection/cleanup, 22 Draft 2020-12 schemas and 41 fixtures, and N1.1 through N4.3 at 83/83 tests. Discovery generated 22 schemas; fetch-receipt source/generated semantic parity, loopback staging smoke, and `git diff --check` passed.
- Claims still unknown: credentialed Brave behavior; Common Crawl URL-index/range-read behavior; parser/browser isolation; extraction quality; prompt-injection boundaries; content-level deduplication; query rewriting; synthesis; benchmarks; production availability.
- Cost/network effects: one bounded public Common Crawl metadata request plus local validation; no credential, billable provider call, archive object read, cloud/IAM/deployment mutation, wallet/payment, or USDC spend.
- Exact next ticket: N4.4 — build isolated deterministic extraction/normalization and content-level near-duplicate detection; do not begin synthesis.

## 2026-07-30 — N4.4 deterministic extraction and content deduplication

- Added receipt-bound extraction for UTF-8 text, HTML, and XHTML. Successful N4.3 evidence must match final URL, MIME, byte length, body hash, successful content hop, and robots policy before bytes enter extraction.
- Added a bounded worker-thread, non-executing HTML tokenizer with memory/stack/time/output limits, active/non-content removal, fixed entity decoding, Unicode NFKC and whitespace normalization, exact retained-text segment offsets, immutable hashes, and explicit `untrusted_data_only` instruction handling.
- Added deterministic content deduplication with revalidation of all supplied records, exact normalized-text SHA-256 equality, five-word-shingle Jaccard basis points, deterministic URL/ID winner selection, separate exact/near/retained accounting, and deep immutable results.
- Added one strict schema, two fixtures, and ten focused tests covering normalization, active-content removal, prompt-like evidence labels, fetch binding, malformed/unsupported/oversize failures, exact offsets, similarity, deterministic duplicate accounting, forged inputs, bounds, and immutability.
- Validation: canonical `npm test` passed with exit code 0, including lint/typecheck, clean-room boundary, stack/environment checks, working-tree plus full-history secret scan, N0.3 injected-secret rejection/cleanup, 23 Draft 2020-12 schemas and 43 fixtures, and N1.1 through N4.4 at 93/93 tests. Deterministic discovery generated 23 schemas; extraction schema semantic parity, loopback staging smoke, and `git diff --check` passed. The available shell executed Node.js 22.23.1/npm 10.9.8 rather than the pinned Node.js 24.18.1 runtime, so exact Node-24 execution remains required before a runtime-specific release claim.
- Claims still unknown: live extraction quality and language/boilerplate calibration; PDF/JSON/OCR and JavaScript rendering; OS-level parser sandboxing; calibrated near-duplicate threshold and false-merge rate; complete model-facing prompt-injection defense; query planning/federation; synthesis; benchmarks; HTTP/payment integration; production availability.
- Cost/network effects: repository-local validation and loopback smoke only; no live provider, crawler, browser, model, credential, cloud/IAM/deployment mutation, wallet/payment, external traffic, or USDC spend.
- Exact next ticket: N4.5 — build deterministic query planning and parallel two-path retrieval federation with provenance, deadlines, cancellation, and partial-failure accounting; do not begin synthesis.
