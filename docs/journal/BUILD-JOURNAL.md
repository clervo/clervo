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

## 2026-07-30 — N4.5 deterministic two-path retrieval federation

- Added deterministic query planning that normalizes one identity query, reconstructs the repository-local two-path qualification gate, rejects stale/closed evidence, orders primary then fallback, bounds the absolute deadline, and binds the plan to qualification by canonical SHA-256.
- Added a provider-neutral parallel federation runner with qualification/hash revalidation before adapter invocation, exactly two independent linked abort signals, one absolute deadline, no fail-fast peer cancellation, pre/in-flight cancellation, elapsed-deadline accounting, and terminal late-settlement isolation.
- Added bounded immutable candidate observations with path/provider identity, source ordinal, retrieval timestamp, raw-response hash, fixed safe failure codes, and derived complete/partial/failed/cancelled outcomes from exactly two attempts.
- Added one strict schema, two fixtures, and eleven focused tests covering normalization, closed/stale/substituted gates, forged plans, actual parallel start, deterministic ordering, path isolation, malformed metadata, safe errors, provenance hashes, hanging/elapsed deadlines, cancellation races, late settlement, and deep immutability.
- Validation: canonical `npm test` passed with exit code 0, including lint/typecheck, clean-room boundary, stack/environment checks, working-tree plus full-history secret scan, N0.3 injected-secret rejection/cleanup, 24 Draft 2020-12 schemas and 45 fixtures, and N1.1 through N4.5 at 104/104 tests. N4.5 passed 11/11. Deterministic discovery generated 24 schemas; federation schema semantic parity, loopback staging smoke, and `git diff --check` passed. The available shell executed Node.js 22.23.1/npm 10.9.8 rather than the pinned Node.js 24.18.1 runtime, so exact Node-24 execution remains required before a runtime-specific release claim.
- Claims still unknown: credentialed Brave and Common Crawl URL-index/range-read behavior; live adapter schemas, quota/throttling, quality, freshness, and availability; retrieval-to-fetch integration; synthesis; benchmarks; HTTP/payment integration; production availability.
- Cost/network effects: repository-local validation and loopback smoke only; no live provider, crawler, archive, browser, model, credential, cloud/IAM/deployment mutation, wallet/payment, external traffic, or USDC spend.
- Exact next ticket: N4.6 — assemble federation candidates through bounded fetch, extraction, content deduplication, deterministic ranking, and citation binding while preserving per-path provenance; do not begin synthesis.

## 2026-07-30 — N4.6 bounded retrieval evidence assembly

- Added a deterministic assembly boundary that reconstructs and hash-matches qualification, revalidates federation attempts/observations before fan-out, and requires both selected paths to authorize transient extraction.
- Added stable observation-derived fetch/extraction/result/citation identities, assembly-owned absolute-deadline races, candidate-local safe failures, explicit candidate/result/byte/output/worker limits, and terminal accounting for ranked, retained-unranked, duplicate, rejected, failed, and omitted candidates.
- Reused the real N4.3 fetch-receipt contract, N4.4 worker extraction and content deduplication, and N4.1 ranking/citation verifier to produce immutable result-to-observation/path/provider/raw-response/fetch/body/extraction/text-hash provenance with `synthesisPerformed: false`.
- Added one strict schema, two fixtures, and eight focused tests covering real extraction, deterministic ranking/citations, exact/near duplicates, local failure containment, non-cooperative dependency timeout, limits, forged qualification/federation metadata, content-use gates, unsafe bounds, and deep immutability.
- Validation: canonical `npm test` passed with exit code 0, including lint/typecheck, clean-room boundary, stack/environment checks, working-tree plus full-history secret scan, N0.3 injected-secret rejection/cleanup, 25 Draft 2020-12 schemas and 47 fixtures, and N1.1 through N4.6 at 112/112 tests. N4.6 passed 8/8. Deterministic discovery generated 25 schemas; assembly schema semantic parity, OpenAPI component presence, loopback staging smoke, and `git diff --check` passed. The available shell executed Node.js 22.23.1/npm 10.9.8 rather than the pinned Node.js 24.18.1 runtime, so exact Node-24 execution remains required before a runtime-specific release claim.
- Claims still unknown: credentialed Brave and Common Crawl URL-index/range-read behavior; live provider adapters and retrieval/extraction quality; calibrated ranking/deduplication; complete model-facing prompt-injection defense; synthesis; benchmarks; HTTP/mock-paid integration; production availability.
- Cost/network effects: repository-local validation and loopback smoke only; no live provider, crawler, archive, external fetch, browser, model, credential, cloud/IAM/deployment mutation, wallet/payment, external traffic, or USDC spend.
- Exact next ticket: N4.7 — build a bounded model-facing prompt-injection boundary and citation-preserving synthesis contract over assembled evidence; do not begin benchmarks or HTTP/payment exposure.

## 2026-07-30 — N4.7 bounded citation-preserving retrieval synthesis

- Added an assembly-hash-bound synthesis boundary with a frozen fixed policy that treats evidence as untrusted data, ignores embedded instructions, disables tools/external actions, and requires known citation IDs for every claim.
- Added exact claims-only model-output validation, deterministic answer rendering, copied assembly provenance, no-model insufficient-evidence behavior, safe fixed failure codes, cancellation/deadline containment, and deeply immutable reports.
- Added one strict schema, two fixtures, and eight focused tests covering instruction-like evidence, fabricated/duplicate/missing/uncited citation IDs, extra/empty/oversized output, forged assembly/provenance, cancellation, non-cooperative adapters, safe exceptions, and immutability.
- Focused validation: `npm run test:n4.7` passed 8/8. Canonical totals are recorded under N4.8.
- Claims still unknown: complete live-model prompt-injection resistance, semantic entailment quality, live model schemas/cost/latency, calibrated search quality, HTTP/payment integration, and production availability.
- Cost/network effects: repository-local validation only; no live model/provider/external call, cloud/IAM/deployment mutation, wallet/payment, external traffic, or USDC spend.
- Exact next ticket: N4.8 — benchmark recorded search quality against a named BlockRun-compatible baseline; do not begin HTTP/payment exposure.

## 2026-07-30 — N4.8 recorded search quality benchmark

- Added a pure independent evaluator over immutable recorded observations with canonical ground-truth corpus hashing and required relevance, freshness, citation, duplicate, adversarial-injection, and provider-failure categories.
- Added exact citation re-verification, category-aware recall/freshness/citation/duplicate metrics, all-case p95 recorded latency and average recorded cost, dedicated resilience metrics, weighted quality scoring, named-baseline improvement, fixed thresholds, and fail-closed codes.
- Added one strict schema, two fixtures, and six focused tests covering metric recomputation, corpus identity, invalid citations, latency/cost/resilience/improvement gates, category/identity/binding rejection, and immutability.
- Validation: canonical `npm test` passed with exit code 0 while executing the exact pinned Node.js 24.18.1 runtime and npm 10.9.8, including lint/typecheck, clean-room boundary, stack/environment checks, working-tree plus full-history secret scan, N0.3 injected-secret rejection/cleanup, 27 Draft 2020-12 schemas and 51 fixtures, deterministic discovery, and N1.1 through N4.8 at 126/126 TAP tests. N4.7 passed 8/8 and N4.8 passed 6/6; N4.7/N4.8 source/generated schema semantic parity, OpenAPI component presence, loopback staging smoke, and `git diff --check` passed.
- Claims still unknown: statistically calibrated or live search quality; human relevance judgments; live provider/model quality, latency, cost, quotas, and availability; production SLOs; HTTP/payment integration; durable benchmark history; production availability.
- Cost/network effects: repository-local validation only; no live provider, crawler, archive, external fetch, browser, model, credential, cloud/IAM/deployment mutation, wallet/payment, external traffic, or USDC spend.
- Exact next ticket: define and implement the bounded free-sample HTTP route over the completed search pipeline without payment exposure; keep mock-paid routing separate.

## 2026-07-30 — permanent Node.js runtime enforcement

- Installed the checksum-verified official Node.js 24.18.1 Linux x64 executable at `/usr/local/bin/node`; retained the pinned npm 10.9.8 installation. The active process now reports Node.js 24.18.1 rather than the previous Node.js 22.23.1.
- Replaced the permissive Node engine range with exact `24.18.1` pins across `.nvmrc`, `.node-version`, `.tool-versions`, `package.json`, `package-lock.json`, and `infra/stack-versions.env`; enabled npm `engine-strict`; and added `scripts/verify-runtime.mjs` as the install guard and first step of every repository npm task.
- Extended stack verification to compare the executing process with every committed runtime declaration. A deliberate pre-install mismatch check under Node.js 22.23.1 failed with exit code 1 before the runtime replacement, proving fail-fast rejection.
- Reworked the full-history secret scan to stream each unique reachable Git object once through `git cat-file --batch` instead of spawning `git show` per file per commit. N0.3 keeps an isolated working-tree behavior test while canonical acceptance independently scans the working tree plus all committed history.
- Replaced the deeply nested canonical npm chain with one fail-fast acceptance orchestrator that runs the same validators directly, builds/generates once, and executes all contract tests in one TAP process. Canonical `npm test` passed under Node.js 24.18.1 with 126/126 tests, 0 failures, 27 schemas, 51 fixtures, no external network calls, and 0 USDC spent.

## 2026-07-30 — N4.9 bounded search HTTP routes and truthful publication

- Added shared strict `search.query` HTTP request/result contracts, route-bound canonical request hashing, deterministic operation binding, exact executor output/citation revalidation, and an injectable process-local free quota reference.
- Added a Node.js HTTP server factory exposing only `POST /v1/search/free` and `POST /v1/search/paid`. The free route is bounded, quota-aware, idempotent, and replay-safe. The paid route returns the N2.1 explicitly non-payable mock x402 challenge by default and never executes from a payment-looking header alone.
- Added an explicit constructor-injected test-only mock-paid path through the existing N2.2 quote verification, execution, definitive mock settlement, balanced ledger, and paid receipt mechanics. No real signature, facilitator, authorization, network settlement, or public payment readiness was added.
- Advanced generated OpenAPI/discovery from `contract_preview` to `implemented_unverified`, published only `search.query`, added a versioned catalog and two schemas, and kept public deployment, payable x402, real settlement, and production-readiness claims false.
- Added three fixtures and five focused loopback tests covering free success/replay, conflict/quota/shape failures, non-payable default paid behavior, injected mock-paid completion, and forged executor binding rejection. Updated N1.3 truth guards and canonical N4.9 wiring.
- Validation: exact pinned Node.js 24.18.1/npm 10.9.8 gates passed. The acceptance runner log recorded lint, typecheck, clean-room boundary, stack/environment verification, working-tree plus full-history secret scan, N0.3 injected-secret rejection/cleanup, build, and 29 Draft 2020-12 schemas/54 fixtures before the tool's 30-second foreground limit interrupted the wrapper during discovery. The remaining canonical commands then passed deterministic discovery generation and N1.1 through N4.9 at 131/131 TAP tests; N1.3 passed 6/6 and N4.9 passed 5/5.
- Claims still unknown: a fully wired recorded or live executor behind the HTTP adapter; durable distributed quota/idempotency state; public listener/DNS/TLS/deployment behavior; live provider/model quality, quotas, latency, and cost; real x402 verification, authorization, facilitator, and settlement; production SLOs and load behavior.
- Cost/network effects: repository-local and loopback HTTP validation only; no external provider, crawler, archive, browser, model, cloud/IAM/deployment mutation, wallet/facilitator/real payment, external traffic, or USDC spend.
- Exact next ticket: wire an injected complete recorded pipeline executor through N4.1–N4.7 for end-to-end HTTP evidence without selecting a live provider or enabling real payment.

## 2026-07-30 — N4.10 complete recorded search pipeline through HTTP

- Added a typed recorded search executor under `services/search` that constructs an evidence-dated two-path qualification snapshot, executes one query through two independent recorded adapter boundaries, and requires a complete federation outcome before returning results.
- Routed recorded candidate URLs through the actual bounded fetch adapter using injected public-address DNS/transport responses, then through real worker-thread extraction, exact/near content deduplication, deterministic ranking, exact citation construction, and immutable path/response/fetch/body/extraction provenance.
- Added optional deterministic cited synthesis through the fixed N4.7 no-tools/no-actions boundary. Instruction-like recorded content remains untrusted cited data and is not copied into the synthesized answer.
- Updated the N4.9 HTTP adapter to await asynchronous executors and coalesce concurrent identical idempotent requests onto one in-flight result, preventing duplicate execution and free-quota consumption. The default paid route remains explicitly non-payable.
- Preserved the synchronous N2.2 mock-commerce API and added a separate asynchronous test seam for the recorded pipeline. Failed asynchronous execution releases claimed process-local mock payment/settlement identifiers before settlement, ledger, or receipt creation.
- Added five N4.10 loopback tests covering complete free search+synthesis, concurrent/sequential replay, explicit test-only mock-paid completion, unchanged non-payable default behavior, and fail-closed incomplete federation without adapter-detail disclosure.
- Validation: exact pinned Node.js 24.18.1/npm 10.9.8 passed lint, typecheck, clean-room boundary, stack/environment verification, working-tree plus full-history secret scan, N0.3 injected-secret rejection/cleanup, build, 29 Draft 2020-12 schemas/54 fixtures, deterministic discovery, and N1.1 through N4.10 at 136/136 TAP tests. Focused N2.2 passed 8/8, N4.9 passed 5/5, and N4.10 passed 5/5. Loopback staging smoke and `git diff --check` passed.
- Claims still unknown: live Brave/Common Crawl qualification and provider-to-fetch adapters; public staging search behavior and Stage 4 exit; durable distributed idempotency/quota/commerce state; HTTP disconnect cancellation; calibrated/live quality, quotas, latency, costs, availability, and SLOs; real x402 verification, authorization, facilitator, and settlement.
- Cost/network effects: repository-local recorded bytes, worker threads, and loopback HTTP only; no external provider, crawler, archive, browser, model, credential, cloud/IAM/deployment mutation, wallet/facilitator/real payment, external traffic, or USDC spend.
- Exact next ticket: N4.11 — perform bounded Stage 4 staging/exit verification and decide whether search may become the reference pattern before Stage 5 begins. Paused until explicitly authorized.

## 2026-07-30 — N4.11 bounded Stage 4 exit verification

- Added a source-bound Stage 4 exit evidence manifest covering all 22 §7.1 requirements and gate checks. Repository-local proof, absent evidence, contradictory source state, and staging verification remain distinct.
- Added a deterministic verifier that binds the decision to the checked-in staging release, environment, discovery, and OpenAPI state. Reference-pattern and Stage 5 authorization can be true only when every named check is staging-verified.
- The observed decision is **blocked**: all 22 checks lack staging verification. The release manifest says `not-provisioned`; discovery says deployment is unverified, payment is not implemented, and the paid route is non-payable.
- Named implementation gaps include query rewriting, isolated JavaScript retrieval, robots enforcement, cache-freshness disclosure, language/region options, separate raw/synthesis prices, delivered monitoring, live provider paths, and live hard cost-cap evidence.
- Added four adversarial tests proving forged pass claims, missing requirement coverage, and invented source state fail closed. No discovery/readiness claim or runtime product behavior changed.
- Validation: focused N4.11 passed 4/4. Canonical acceptance passed lint, typecheck, boundary, stack/environment, secret scan, N0.3 negative control, build, 29 schemas/54 fixtures, discovery generation, Stage 4 exit verification, and N1.1–N4.11 at 140/140 tests. Loopback staging smoke and diff checks passed.
- Deployment checked: checked-in staging/discovery state and local loopback hello smoke only. No public search deployment, live provider/model/browser, telemetry delivery, real payment, facilitator/wallet, cloud/IAM mutation, or USDC spend occurred.
- Decision: N4.11 is complete, Stage 4 remains open, search is not the reference pattern, and Stage 5 is not authorized.
- Exact next ticket: N4.12 — implement and test bounded query rewriting as the first named Stage 4 remediation. Paused until explicitly authorized.

## 2026-07-30 — N4.12 bounded query rewriting

- Added a versioned deterministic rewrite contract producing exactly two token-preserving forms: normalized identity and escaped exact phrase. Inputs are capped at 2,000 characters and 64 tokens; no model, synonym expansion, inferred facts, tools, provider syntax, or external state is used.
- Integrated the immutable rewrite artifact into N4.5 federation planning. Its SHA-256, operation ID, timestamp, normalized response query, role mapping, and execution queries are revalidated before adapters can run.
- Preserved the normalized original query for response assembly, ranking, citations, and synthesis while routing identity to primary and exact phrase to fallback.
- Added strict schema fixtures and adversarial tests for determinism, bounds, token preservation, artifact substitution, and execution-query substitution.
- Updated Stage 4 evidence truthfully: query rewriting is now `repository_verified` and remains `stagingVerified=false`. Stage 4, reference-pattern authorization, and Stage 5 remain blocked.
- Validation: focused N4.12 passed 4/4; N4.5/N4.6 regressions passed 19/19. Canonical acceptance passed lint, typecheck, boundary, stack/environment, secret scan, N0.3 negative control, build, 30 schemas/56 fixtures, discovery generation, Stage 4 verification, and N1.1–N4.12 at 144/144 tests. Loopback staging smoke and diff checks passed.
- No external network, live provider/model/browser, deployment, payment, wallet/facilitator, or USDC spend occurred.
- Exact next ticket: N4.13 — implement isolated JavaScript retrieval as the next named Stage 4 remediation. Paused until explicitly authorized.

## 2026-07-31 — N4.13 isolated JavaScript retrieval

- Added a versioned JavaScript retrieval boundary that requires a fresh successful N4.3 static receipt with final robots allowance and renderable HTML/XHTML before an injected browser adapter can run.
- Core-owned authorization restricts every browser request to the preflight origin and public DNS addresses, counts attempts before asynchronous resolution, and validates the adapter's connected-address and byte transcript exactly.
- Required a sandboxed disposable browser process attestation with ephemeral storage, blocked service workers/downloads, denied permissions, and core-authorized network interception. Forged isolation or hidden requests reject output atomically.
- Added absolute deadline and live cancellation races, request/network/rendered-byte ceilings, safe adapter failure codes, immutable receipts, strict schema fixtures, and adversarial tests.
- Updated Stage 4 evidence truthfully: isolated JavaScript retrieval is now `repository_verified` and remains `stagingVerified=false`. No concrete browser dependency or adapter was installed; Stage 4, reference-pattern authorization, and Stage 5 remain blocked.
- Validation: focused N4.13 passed 6/6. Canonical acceptance passed lint, typecheck, boundary, stack/environment, secret scan, N0.3 negative control, build, 31 schemas/58 fixtures, discovery generation, Stage 4 verification, and N1.1–N4.13 at 150/150 tests. Loopback staging smoke and diff checks passed.
- No external network, live browser/provider/model, deployment, payment, wallet/facilitator, or USDC spend occurred.
- Exact next ticket: N4.14 — implement disclosed cache freshness as the next named Stage 4 remediation. Paused until explicitly authorized.

## 2026-07-30 — N4.14 disclosed cache freshness

- Added a versioned cache disclosure on every search response with explicit `miss`, `fresh_hit`, and `stale_revalidated` outcomes bound by canonical request and response SHA-256 hashes.
- Freshness lifetime, validated age, resident age, remaining freshness, and revalidation evidence are recomputed from strict ISO timestamps. Future-dated claims, expired fresh hits, non-stale or non-current revalidation, request/response substitution, and derived-field tampering fail closed.
- The recorded pipeline truthfully emits `miss`; no durable result cache or staging cache behavior is claimed. Public HTTP output includes the disclosure while retaining `Cache-Control: no-store` for transport caching.
- Added strict schema/fixtures, generated discovery/OpenAPI artifacts, executor-boundary verification, a decision record, and five focused adversarial/HTTP tests.
- Updated Stage 4 evidence truthfully: disclosed cache freshness is now `repository_verified` and remains `stagingVerified=false`. Stage 4, reference-pattern authorization, and Stage 5 remain blocked.
- Validation: focused N4.14 passed 5/5. Canonical acceptance passed lint, typecheck, boundary, stack/environment, secret scan, N0.3 negative control, build, 32 schemas/60 fixtures, discovery generation, Stage 4 verification, and N1.1–N4.14 at 155/155 tests. Loopback staging smoke and diff checks passed.
- No external network, live cache/provider/model/browser, deployment, payment, wallet/facilitator, or USDC spend occurred.
- Exact next ticket: select and explicitly authorize the next named Stage 4 remediation; no N4.15 scope is inferred here.

## 2026-07-30 — N4.15 language and region options

- Added provider-neutral `language` and `region` search controls with deterministic `en`/`US` defaults, strict canonical BCP 47 language validation, and recognized uppercase region validation.
- Bound locale options into canonical HTTP request identity and cache request identity, propagated them through both retrieval paths, federation, assembly, and public search responses, and rejected executor output substitution before HTTP output or receipt construction.
- Kept provider claims bounded: the recorded adapters carry the options, but no live Brave, Common Crawl, browser, or other provider was called or shown to honor them.
- Added strict schema coverage, one invalid locale fixture, a decision record, and six focused tests covering defaults, malformed/non-canonical values, request/cache separation, response/cache binding, executor substitution, and end-to-end recorded propagation.
- Updated Stage 4 evidence truthfully: language and region options are now `repository_verified` and remain `stagingVerified=false`. Stage 4, reference-pattern authorization, and Stage 5 remain blocked.
- Validation: focused N4.15 passed 6/6. Canonical acceptance passed lint, typecheck, boundary, stack/environment, secret scan, N0.3 negative control, build, 32 schemas/61 fixtures, discovery generation, Stage 4 verification, and N1.1–N4.15 at 161/161 tests. Loopback staging smoke and diff checks passed.
- No external network, live provider/model/browser, deployment, payment, wallet/facilitator, or USDC spend occurred.
- Exact next ticket: select and explicitly authorize the next named Stage 4 remediation; no N4.16 scope is inferred here.

## 2026-07-30 — N4.16 separate raw retrieval and synthesis prices

- Preserved `search.query` as the stable HTTP operation while introducing exact billable product identities: `search.web` for `synthesize=false` and `search.answer` for `synthesize=true`.
- Published distinct fixed mock-USDC prices and price versions for both products in generated discovery, catalog, and `llms.txt`.
- Bound product identity through canonical request hashing, executor input, HTTP output, quotes, non-payable challenges, mock payment verification, charges, and immutable receipts; synthesis now requires a synthesis report.
- Added focused adversarial tests proving exact quote/receipt pricing and rejecting cross-product quote, payment, and idempotency replay before unauthorized execution.
- Updated Stage 4 evidence truthfully: separate raw and synthesis prices are now `repository_verified` and remain `stagingVerified=false`. Stage 4, reference-pattern authorization, and Stage 5 remain blocked.
- No external network, live provider/model/browser, deployment, real payment, wallet/facilitator, or USDC spend occurred.

## 2026-07-31 — N4.17 bounded search monitoring

- Added an internal search monitor using the existing N3.1 fixed-cardinality metrics and delivery-neutral alerts for availability, latency, execution failures, quota rejections, mock payment challenges, and mock-paid completions.
- Wired lifecycle recording into the search HTTP server without adding a public endpoint or changing customer response schemas; monitor and injected exporter failures are contained.
- Added strict immutable snapshots capped at 128 metric points and 32 alerts, with no query, URL, request hash, subject, error detail, or operation identifier in metric dimensions.
- Added a fixed safe `search.execution_failure` alert plus strict schema fixtures and six focused adversarial/HTTP tests.
- Updated Stage 4 evidence truthfully: monitoring is now `repository_verified` and remains `stagingVerified=false`. No collector, dashboard, paging channel, delivered alert, or staging process is claimed; Stage 4 and Stage 5 authorization remain blocked.
- Focused N4.17 passed 6/6; contract validation passed 33 schemas/63 fixtures. No external network, deployment, payment, or USDC spend occurred.

## 2026-07-31 — N4.18 isolated GCP staging deployment preparation and attempt

- Received explicit owner authorization for new-resource-only GCP staging work in project `bloxsniper-prod`, region `us-central1`, with stop-and-report behavior for unavailable credentials or control-plane ambiguity.
- Inspected the execution environment before mutation: the authorized project/region were present, but `gcloud`, ADC, metadata identity, a container builder, and a usable browser control plane were unavailable. The attempt stopped before Cloud Run inspection or mutation; no resource was created or modified.
- Added a pinned multi-stage Node.js 24.18.1 container, a Cloud Run-compatible staging search entry point, release-bound `/healthz`, periodic bounded monitoring snapshots to structured stdout, and explicit `allowMockPaidExecution=false`.
- Added a guarded GCP operator script pinned to the authorized target and isolated service, with one-instance maximum, pre-deploy revision capture, remote smoke evidence collection, and explicit traffic rollback.
- Added a live smoke collector proving release health, the recorded free sample, and the paid route's non-payable `402` challenge behavior while truthfully recording that live providers and real payment are unproven.
- Added focused N4.18 tests and operator/attempt documentation. No Stage 4 staging claim changed: the release remains `not-provisioned`, all checks remain `stagingVerified=false`, and Stage 4/Stage 5 authorization remains blocked.
- Validation: focused `npm run test:n4.18` passed 4/4. Canonical `npm test` passed with the exact pinned Node.js 24.18.1 runtime, including lint, typecheck, clean-room boundary, stack/environment checks, full-history secret scan, N0.3 negative control, build, 33 schemas/63 fixtures, discovery generation, blocked Stage 4 verification, and N1.1 through N4.18 at 177/177 tests. Contract files run serially in canonical acceptance so bounded worker deadlines measure product behavior rather than cross-ticket CPU contention; concurrency within each file remains unchanged. `git diff --check` and the real unauthenticated GCP fail-closed path passed.
- Cost/network effects: two failed metadata reachability probes and one failed browser-control-plane startup only; no authenticated cloud API, provider, payment, wallet, deployment, resource mutation, billable call, or USDC spend occurred.

## 2026-07-31 — N4.18 isolated GCP staging deployment verified

- Used the explicitly authorized GCE operator path for new-resource-only work in `bloxsniper-prod/us-central1`; no existing workload was selected or modified.
- Exercised scripted rollback on the preceding isolated first deployment, which deleted `clervo-stage4-slice-staging`, verified the service was absent, and established the final deployment from a clean boundary.
- Deployed immutable Git release `2f6fd6c` as private Cloud Run revision `clervo-stage4-slice-staging-00001-7fn`. Cloud Build `52167bac-b84b-4533-b400-1a4769e87b11` succeeded and produced image digest `sha256:16bcfbf77f874c0e323a67b18712df4d92318b71227838de141a0bbca0e72354`.
- Verified authenticated remote behavior: `/v1/health` returned 200 with the exact release and paid execution disabled; the recorded `search.answer` free sample returned 200 with two results and synthesized output; the paid endpoint returned the required non-payable 402 challenge with `executionAllowed=false`. Cloud Run request logs independently recorded all three requests.
- Checked in bounded smoke and control-plane evidence, updated the release manifest to `verified-private-recorded-only`, and changed only `deployed_free_sample` to `staging_verified`. The other 21 Stage 4 gates remain blocking; reference-pattern and Stage 5 authorization remain false.
- Runtime limits remain 1 CPU, 512 MiB, concurrency 8, timeout 60 seconds, min instances 0, and max instances 1. The service is private/authenticated and intentionally left running as the verified staging slice.
- Claims still unproven: live lawful retrieval suppliers, concrete browser execution, durable staging cache semantics, staging security and benchmark runs, payable routing/real settlement, monitoring snapshot collection, dashboards, paging or delivered alerts, and hard live-provider spend stops.
- Cost/network effects: Cloud Build, Artifact Registry, Cloud Run deployment, authenticated smoke, control-plane inspection, and log reads only; no external retrieval provider or model call, no wallet/facilitator call, no real payment, and 0 USDC spent.

## 2026-07-31 — N4.19 provider-neutral lawful free-first retrieval supply

- Added one additive retrieval-supply qualification contract and strict schema without changing completed Stage 4 retrieval, safety, provenance, normalization, deduplication, ranking, citation, synthesis, benchmark, deployment, or exit-verification contracts.
- Made Brave an optional exact-identity adapter. Ready supply requires a self-hosted metasearch broker with at least two independently qualified upstream providers plus direct independently qualified Common Crawl archive access; public shared SearXNG is ineligible.
- Evaluated Crawl4AI first and alone from primary sources. It remains unselected because Clervo-specific deterministic fixtures, timeouts, resource limits, and failure isolation were not proven. All other named worker/browser candidates remain deferred and uninstalled.
- Focused `npm run test:n4.19` passed 6/6. Canonical `npm test` was run once; lint and typecheck passed, then the clean-room boundary stopped on a pre-existing untracked owner master-plan reference file. That owner file was preserved unchanged.
- No provider call, repository installation, deployment, credential use, payment, wallet operation, or USDC spend occurred.
- Stage 4 remains blocked, search is not the reference pattern, and Stage 5 remains unauthorized. No next ticket is inferred.

## 2026-07-31 — N4.20 concrete development-only retrieval supply qualification

- Added an additive development-only decision behind N4.19 that computes readiness from exact provider identity, independent failure domains, evidence freshness, capability/health, bounded use and zero-cost ceilings, terms/resale status, fail-closed behavior, and exact substitution policy. Production authorization remains structurally false.
- Bounded the concrete composition to a self-hosted SearXNG boundary, Wikimedia Wikipedia and OpenStreetMap Nominatim upstream identities, and separate direct Common Crawl. Wikipedia and Nominatim returned one healthy zero-cost response each; Common Crawl returned `CC-MAIN-2026-30` collection/index metadata. No broker instance or WARC range read ran.
- Terms remain explicit: Wikimedia commercial reuse requires applicable license/attribution/share-alike compliance; public Nominatim resale is prohibited; Common Crawl commercial content use requires origin-rights review. Therefore the concrete composition is provisional and development-only, not a general-Web or production-ready route.
- Added SHA-256-bound evidence summaries, a strict schema and generated discovery artifacts, plus deterministic success/failure fixtures for every required N4.20 fail-closed condition.
- Focused `npm run test:n4.20`, contract validation at 35 schemas/66 fixtures, discovery generation at 35 schemas, and `git diff --check` passed.
- Canonical `npm test` was invoked exactly once. Lint, typecheck, clean-room boundary, stack, and environment passed; `scripts/scan-secrets.mjs` then failed with `secret scan: FAIL: spawnSync git EPERM`. Per ticket instruction it was not rerun, the Stage 4 verifier was not started, and no commit was created.
- External hosts contacted: `docs.searxng.org`, `foundation.wikimedia.org`, `en.wikipedia.org`, `operations.osmfoundation.org`, `nominatim.openstreetmap.org`, `commoncrawl.org`, and `index.commoncrawl.org`. No credentials, provider installation, cloud/deployment mutation, payment, wallet/facilitator action, or USDC spend occurred.
- The last verified Stage 4 decision remains blocked with 21 checks; search is not the reference pattern and Stage 5 was not started. Proposed N4.21 remains unauthorized until N4.20 acceptance is explicitly resumed and completed.

## 2026-07-31 — N4.20 closeout after owner-authorized external acceptance

- Recorded owner-supplied external execution evidence for the explicitly authorized canonical retry outside the Codex sandbox: 184 tests, 184 passed, 0 failed, `acceptance: PASS`, Node.js 24.18.1, 0 external network calls, and 0 USDC spent. Codex did not run the successful retry; the earlier Codex invocation had stopped only because sandbox policy denied the secret scanner's `spawnSync git` child process with `EPERM`.
- Ran `npm run verify:stage4-exit` exactly once. Runtime enforcement and verifier integrity passed, but the decision remained `blocked` with 21 blocking checks before and 21 after, reference-pattern authorization false, and Stage 5 authorization false. The verifier made 0 external network calls and spent 0 USDC.
- Preserved the concrete supply truth: the composition is development-only and provisional; no self-hosted SearXNG broker health/configuration ran, public Nominatim is not resale-qualified, and Common Crawl live WARC range access and commercial content clearance remain unproven.
- Updated only the N4.20 completion evidence, active ticket state/handoff, README, and append-only journal. The external master plan is mounted read-only (`fuse.grpcfuse ro`), so its stale N4.19 current-handoff block could not be synchronized from this container and still requires an owner-side update. Final `git diff --check` passed once after the writable documentation updates.
- N4.20 is complete and bounded. Stage 4 remains blocked, search is not the reference pattern, Stage 5 was not started, and proposed N4.21 remains unauthorized.

## 2026-07-31 — N4.20 external master-plan synchronization preparation

- Compared the read-only external master plan's stale N4.19 handoff with committed N4.20 repository evidence at `d5080c9` and the autonomous-container policy at `1da9b73`.
- Added `docs/evidence/MASTER-PLAN-N4.20-SYNC.patch` as the minimal owner-applied synchronization artifact. It records N4.20 completion, owner-supplied canonical acceptance at 184/184, the blocked 21-check Stage 4 decision, false reference-pattern and Stage 5 authorizations, and exact next ticket N4.21.
- The external master plan was not modified and is not yet synchronized because `/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md` remains mounted read-only. No tests ran because only documentation changed; no external host was contacted; no payment or USDC spend occurred; N4.21 and Stage 5 were not started.

## 2026-07-31 — N4.21 isolated SearXNG loopback and Common Crawl WARC range proof

- Applied and verified the prepared N4.20 synchronization patch to the now-writable external master plan before beginning N4.21; no synchronization-only repository commit was created.
- Ran exact SearXNG commit `057a77168d3175ce2e42e5b10f46a8df073886d5` in a dedicated Python virtual environment and one-worker process bound only to `127.0.0.1:18888`. Repository configuration enabled exactly Wikipedia and OpenStreetMap/Nominatim; each returned one bounded broker result with no unresponsive engine. The process was stopped after the proof.
- Installed Docker/Compose and attempted both privileged and rootless repairs. The outer container denied Docker layer mount-namespace creation and rootless subordinate UID/GID mapping, so the ticket truthfully records process/virtual-environment isolation and makes no container-isolation claim.
- The first bounded Common Crawl index request returned HTTP 502 and authorized no range. One repair returned a 467-byte exact `CC-MAIN-2026-30` record for `https://example.com/`; the derived exact 954-byte WARC request returned HTTP 206 with matching `Content-Range`, compressed SHA-256, decoded target URI, and payload digest.
- Added a source/config/identity-bound execution-proof contract, strict schema and generated discovery, normalized live fixture, and deterministic adversarial fixtures/tests for broker unavailable, one upstream unavailable, duplicate failure domain, identity substitution, stale evidence, index miss, invalid/excessive range, content-hash mismatch, and dishonest readiness.
- Preserved production truth: public Nominatim resale remains prohibited, Common Crawl content use remains legal-review gated, neither path is product-connected or staging-verified, general-Web quality is unproven, production readiness is false, and no N4.18 deployment or product route changed.
- Focused N4.21 passed 9/9; lint passed 180 files; contract validation passed 36 schemas/67 fixtures; discovery generation passed 36 schemas; the clean-room boundary and diff checks passed.
- Canonical `npm test` ran exactly once and passed 200/200 with `acceptance: PASS`, Node.js 24.18.1, zero external network calls during acceptance, and 0 USDC. The separate `npm run verify:stage4-exit` command ran exactly once and passed with decision `blocked`, 21 blockers, reference-pattern authorization false, and Stage 5 authorization false.
- External supply hosts were bounded to `en.wikipedia.org`, `nominatim.openstreetmap.org`, `index.commoncrawl.org`, and `data.commoncrawl.org`. Official source/dependency acquisition also used GitHub, Docker Hub, Debian mirrors, and Python package infrastructure. No credentials, billable provider/cloud mutation, wallet/facilitator action, real payment, or USDC spend occurred.
- N4.21 is complete. No next ticket is authorized or inferred; N4.22 and Stage 5 were not started.

## 2026-07-31 — N4.22 source-bound Stage 4 remediation campaign control

- Confirmed workspace TypeScript `7.0.2` accepts the repository's `ES2023` target: `npm run typecheck` passed under Node.js 24.18.1. The Mac warning is an older VS Code language-service mismatch; `tsconfig.json` and dependencies were correctly left unchanged.
- Inspected the exact Stage 4 verifier and bound all 21 remaining identifiers to individual required evidence, missing evidence, dependency group, and local/staging/owner boundary in `infra/staging/stage4-remediation-campaign.json`.
- Grouped the queue into N4.23 lawful supply/access, N4.24 live pipeline, N4.25 browser/cache/security, N4.26 benchmarks/monitoring/cost controls, N4.27 payable route, and N4.28 final verification. Every check requires staging evidence; no local proof-only ticket can reduce the verifier count.
- Verified the genuine external stop: no active gcloud account or access token, no ADC, and no relevant credential environment variable is present. One bounded unauthenticated health request to the existing private Cloud Run service returned HTTP 403, 304 bytes, with recorded hash. No authenticated inspection, deploy, log read, traffic change, or evidence promotion was attempted.
- Recorded additional owner gates: two approved production/resale-eligible suppliers replacing public Nominatim, a Common Crawl legal decision or cleared alternative, selected provider credentials, facilitator/payee authorization for the payable route, and an approved alert delivery channel.
- Added a deterministic campaign verifier and five adversarial tests rejecting missing/substituted blockers, local-as-staging promotion, TypeScript target downgrade, unordered dependencies, and silent external-gate promotion.
- Validation: focused N4.22 passed 5/5; lint passed 182 files; campaign verification passed; canonical acceptance passed 205/205 with 36 schemas/67 fixtures and `acceptance: PASS`; the explicit Stage 4 verifier remained blocked on 21 checks with reference pattern and Stage 5 authorization false; clean-room boundary and diff checks passed.
- External host contacted: `clervo-stage4-slice-staging-jbtbib4yqa-uc.a.run.app` once. Credential values used/read/printed: none. No provider/crawl, deployment mutation, cloud/IAM/billing change, wallet/facilitator action, real payment, or USDC spend occurred.
- N4.22 is complete and N4.23 is `blocked_external`. N4.23–N4.28 and Stage 5 were not started.

## 2026-07-31 — NPLAN.1 focused Initial Commercial Release amendment

- Recorded the final owner decision that the Initial Commercial Release requires exactly Search, broad AI inference, and secure Sandbox, joined as `Find → Reason → Execute`; RPC, Prediction, and Crypto Intelligence remain planned additive Full Platform Expansion pillars rather than launch blockers.
- Preserved completed Stages 0–4 and every future-service directory, contract name, boundary, and expansion path. Reordered only future stages: AI, Sandbox, combined outcomes, distribution, hardening, settlement proof, focused launch, then RPC/Prediction/Crypto expansion and an all-six compatibility gate.
- Added a fail-closed product-scope contract/schema with separate initial and full-platform gates and lifecycle states. Current discovery stays search-only and unverified: Search is `preview`, AI/Sandbox are `unavailable`, expansion pillars are `planned_post_launch`, both release gates are false, payment is unimplemented, and deployment is unverified.
- Added compatibility and false-availability tests, prototype-only site scope/copy, builder authority, Markdown brand/motion addendum, marketing scope, and a ranked ten-agent framework using only Search + AI + Sandbox. No production site or agent was implemented; no binary asset existed or was overwritten.
- Updated the writable external master plan, README, autonomy/Cline authority, active state, and N4.23 payment-stage reference. Historical completed-ticket evidence was preserved; the append-only journal was not rewritten.
- Validation: focused NPLAN.1 passed 4/4; discovery passed 6/6; 37 schemas/69 fixtures passed; product/site consistency, TypeScript, clean-room boundary, secret scan, and diff checks passed. Canonical `npm test` ran exactly once and passed 209/209. Its Stage 4 verifier remained `blocked` on 21 checks with reference pattern and Stage 5 authorization false.
- Network/cost effects: validation made zero external calls and spent 0 USDC. No credentials, provider contact, cloud/IAM/deployment mutation, wallet/facilitator action, payment, AI/Sandbox/future-pillar implementation, or later product stage occurred.
- N4.23 remains valid and paused at its owner prerequisites. The exact next action is to supply the owner response inputs and explicitly resume N4.23; otherwise stop.

## 2026-07-31 — N4.23A zero-provider-cost supply and bounded tool benchmark

- Resumed the preserved N4.23A worktree at `9c792ec` after container recreation. Rebuilt only the lost `/tmp` Scrapling, Crawl4AI/Playwright, and Meilisearch environments; did not inspect or use legacy secret material and printed no secret value.
- Recorded the owner decision that required core search-provider API cost is exactly zero. Preserved the N4.23 paid-supplier package as historical research and appended a superseding amendment rather than rewriting it.
- Selected and hash-pinned Scrapling `0.4.12` (BSD-3-Clause), Crawl4AI `0.9.2`/Playwright `1.61.0` (Apache-2.0; internal fallback provisional until N4.25), and Meilisearch `1.51.0` community features (`MIT AND BUSL-1.1`). SearXNG remains an internal-broker option only; public instances and unreviewed engines remain excluded.
- Ran the bounded loopback corpus: six Scrapling HTTP/XML markers passed, redirect stayed unfollowed at HTTP 302, Crawl4AI rendered the JavaScript marker and destroyed state, and Meilisearch indexed four extracted-text records with `static_commerce` as the required `Northstar` top hit. The existing Clervo boundary rejected robots denial, oversize, binary MIME, loopback IPv4/IPv6, and metadata targets.
- Added the strict zero-provider-cost decision contract/schema/fixtures/tests. Exact future identities `clervo.focused-index.v1` and `clervo.live-federation.v1` cannot share discovery, index, health, or failure-domain identity; tool or route substitution, paid dependencies, public Nominatim, Common Crawl bodies in paid output, unrestricted crawl, and dishonest readiness fail closed.
- Mapped every remaining Stage 4 blocker to N4.23B–N4.27 without promoting local proof to staging. `deployed_free_sample` remains the only staging-verified check; the explicit Stage 4 verifier passed with decision `blocked`, 21 blockers, reference-pattern authorization false, and Stage 5 authorization false.
- Validation: N4.23A passed 7/7; contracts passed 38 schemas/71 fixtures; discovery passed 6/6 and generated 38 schemas; lint passed 196 files; TypeScript, clean-room boundary, secret scan, and the Stage 4 verifier passed. Canonical `npm test` did not run and remains reserved for N4.28.
- Network/cost/deployment: the benchmark and validation used loopback only with zero external calls, USD 0.000000 third-party search-provider cost, no cloud/IAM/deployment mutation, no wallet/facilitator/payment action, and 0 USDC. No credential environment variable or value was used.
- N4.23A is complete. The exact next ticket is N4.23B, but it was not started because `AGENTS.md` requires stopping after one committed ticket. N4.24, Stage 5, and every later stage remain unstarted.

## 2026-07-31 — N4.23B focused owned-index route

- Implemented only `clervo.focused-index.v1`: approved-domain and exact explicit-seed frontier, bounded sitemap/RSS/Atom discovery, fail-closed policy/denylist admission, and the existing Clervo URL/DNS/robots/redirect/MIME/byte/deadline boundary before extraction.
- Added the Scrapling `0.4.12` extraction-only worker and the persisted Meilisearch `1.51.0` community adapter. Analytics is disabled, a master key is required, and exact provider, adapter, health, failure-domain, and worker identities reject substitution or dishonest health.
- Added versioned focused-index documents and provenance, canonical URLs, SHA-256 fingerprints, exact/near-duplicate suppression, stale/expired filtering, deterministic Clervo ranking, deletion, recrawl, rebuild, pause/resume frontier snapshots, corruption checksums, and hard quota/concurrency/delay ceilings.
- Focused `npm run test:n4.23b` passed 8/8; contracts passed 39 schemas/73 fixtures; discovery generated 39 schemas. The temporary pinned Scrapling environment passed a bounded in-memory worker smoke with zero network calls.
- No staging evidence or `stagingVerified` value changed. Stage 4 remains blocked on 21 checks; search is not the reference pattern and Stage 5 is unauthorized.
- Third-party search-provider API cost was USD 0.000000; no credentials, provider account, cloud/IAM/deployment mutation, payment, wallet/facilitator action, or USDC spend occurred.
- Exact next ticket: N4.24 — implement the independent live-federation path. Stop here; do not begin N4.25 or any later stage.

## 2026-07-31 — N4.24 independent live-federation route and connected local pipeline

- Reviewed only official source documentation with bounded read-only requests. Selected Wikimedia Action API and Crossref REST metadata as the smallest qualified open-data set; Wikimedia requires meaningful contact identity, attribution, and page-level license compliance, while Crossref abstracts/full text remain excluded. Common Crawl CDXJ/index is metadata-only provisional; archived WARC/WAT/WET bodies remain rejected and development-only.
- Implemented exact `clervo.live-federation.v1` provider/adapter/health/circuit/failure identities, independent of `clervo.focused-index.v1`, its Meilisearch index, health, circuit, frontier, and failure domain. Identity substitution and silent route fallback fail closed.
- Connected deterministic query rewriting, parallel route execution, bounded deadlines/cancellation, URL normalization, exact/near duplicate suppression, freshness/authority/relevance/domain-diversity ranking, locale propagation, extraction provenance, evidence-offset citations, prompt-injection isolation, deterministic response/replay, and honest degraded behavior. Both routes failing is fail-closed.
- Added direct current-page retrieval through the existing Clervo safety boundary, metadata-only Common Crawl adapter, and provisional internal Crawl4AI `0.9.2`/Playwright `1.61.0` fallback gated by deterministic JavaScript-required evidence. No public raw browser API, arbitrary JavaScript, hooks, LLM integrations, downloads, stealth, proxy, or persistent state is exposed; N4.25 remains the isolation qualification ticket.
- Completed local `search.web`, `web.fetch`, and `web.extract`; `search.answer` remains preview-only and `research.report` unavailable. Added strict connected-response schema/fixtures and generated discovery artifacts.
- Validation: N4.24 focused tests 12/12; N4.23B regression 8/8; contracts 40 schemas/75 fixtures; discovery 40 schemas; build/typecheck passed. Canonical `npm test` did not run and remains reserved for N4.28.
- External hosts contacted only for official documentation: `foundation.wikimedia.org`, `www.mediawiki.org`, `www.crossref.org`, `commoncrawl.org`, and `index.commoncrawl.org`. No provider search/API or current publisher page was probed; no credentials, cloud/deployment/IAM/billing, wallet/facilitator, payment, or legacy-runtime action occurred. Provider API and local infrastructure cost were USD 0.000000; 0 USDC spent.
- Stage 4 remains blocked on exactly 21 source-bound checks before and after N4.24; no staging evidence or `stagingVerified` value changed, reference-pattern authorization remains false, and Stage 5 remains unauthorized. Exact next ticket: N4.25 only.

## 2026-07-31 — N4.25 browser retrieval, durable cache, and complete search security boundary

- Selected a two-plane internal browser design: the Crawl4AI/Chromium worker has no Service/ingress or direct Internet egress and can reach only a per-request retrieval-authorization gateway. Added exact runtime attestation, honest unavailable/degraded/ready health, one-page and hard resource/output limits, ephemeral state, deterministic termination/orphan cleanup, and a kill switch.
- Checked in a zero-replica, invalid-image, kill-switched isolation specification because Docker/Podman, Crawl4AI, Playwright, a pinned runtime image/gateway, and authenticated staging access are absent. No runtime/staging isolation claim was made.
- Hardened current-page retrieval with cancellation, gzip/deflate/Brotli compressed/decompressed ceilings, robots crawl-delay, shared per-domain concurrency/delay, and retained URL/DNS/socket/redirect/MIME/byte controls. Login, cookies, CAPTCHA solving, proxies, stealth, file URLs, and access-control bypass remain absent.
- Added environment-separated filesystem and PostgreSQL durable retrieval-cache boundaries. Deterministic keys bind normalized URL, exact route and policy; checksums reject poisoning; fetched/expiry/age/stale state is visible; forced refresh, eviction, URL removal and denylist invalidation work; stale is reusable only while explicitly degraded.
- Added an exact hash-bound untrusted-evidence object and pipeline check proving page text cannot change route, tools, payments, system policy, citations, or execution.
- Validation: N4.25 13/13, N4.23B 8/8, N4.24 12/12, contracts 43 schemas/81 fixtures, discovery 43 schemas, typecheck, lint over 228 source/contract files, full working-tree/history secret scan, clean-room boundary, and diff checks passed. The Stage 4 verifier ran exactly once and passed integrity with decision `blocked`, 21 blockers, reference-pattern authorization false, Stage 5 authorization false, 0 external calls, and 0 USDC. Canonical `npm test` did not run and remains reserved for N4.28.
- Network/cost: deterministic injected/loopback fixtures only, zero external calls, USD 0.000000 provider/infrastructure cost, no credentials/cloud/deployment/payment/wallet/legacy access, and 0 USDC.
- Stage 4 remains blocked on 21 checks before and after; no `stagingVerified` value changed, search is not the reference pattern, and Stage 5 remains unauthorized. Exact next ticket: N4.26 only; stop after the N4.25 commit.

## 2026-07-31 — NPLAN.2 Clervo Live Intelligence First Revenue Release authority

- Installed `docs/product/CLERVO-LIVE-INTELLIGENCE-LAUNCH-AUTHORITY.md` as the
  one canonical repository product/launch authority. Clervo remains outcome
  infrastructure for agents; Clervo Live Intelligence is the First Revenue
  Release; the permanent narrative is Find → Understand → Act.
- Preserved every completed Stage 0–4 ticket, commit, outcome, evidence, and
  append-only journal entry. Marked NPLAN.1 as an explicit historical decision
  without changing its recorded result; amended only future stages.
- Reordered the future program to Live Intelligence productization; access,
  onboarding, and distribution; production hardening/deployment; bounded real
  settlement; external paid demand/launch; AI; Secure Sandbox; combined
  workflows; RPC; Prediction; Crypto Intelligence; and Stage 16 compatibility.
- Added a versioned fail-closed First Revenue Release scope with 16 required
  proofs. Search remains `preview`, AI/Sandbox `unavailable`, later pillars
  `planned_post_launch`, every launch proof false, both release gates false,
  payment unimplemented, and deployment unverified.
- Synchronized generated discovery, README, builder, brand, marketing, website
  prototype, solution-pack framework, autonomy policy, ticket, evidence, and
  handoff. Defined seven connector access modes, the exact claims ladder, five
  solution packs, full onboarding/recovery journey, discovery/distribution
  system, legacy migration boundary, and candidate AI/media constraints.
- N4.26 now targets the actual Live Intelligence launch product across five
  task families and the required recall, precision, freshness, structured-field
  accuracy, citation, duplicate, diversity, change, latency, degradation, and
  bounded-cost metrics, with free/open and permitted paid comparison groups but
  no paid production dependency.
- Validation: NPLAN.2 6/6; NPLAN.1 history 2/2; discovery 6/6 and 43 schemas;
  contracts 43 schemas/81 fixtures; product-scope consistency, typecheck, lint
  across 229 files, full secret scan, clean-room boundary, contradiction audit,
  and diff checks passed. One initial discovery test caught a stale heading
  assertion; it was synchronized and passed on focused rerun. Canonical
  `npm test` and the Stage 4 verifier did not run.
- Network/cost/state: 0 external calls, USD 0.000000 provider/infrastructure
  cost, no credentials/secrets/cloud/IAM/deployment/provider/payment/wallet/
  legacy access or mutation, and 0 USDC. The same 21 Stage 4 blockers remain;
  reference-pattern and Stage 5 authorization remain false.
- NPLAN.2 is complete. Exact next ticket: N4.26 only. Stop here; do not begin
  N4.27, N4.28, Stage 5, AI, Sandbox, or any expansion stage.

## 2026-07-31 — N4.26 live staging quality, monitoring, costs, and traffic stops

- Created the empty preferred project `clervo-n426-staging-20260731`; billing
  linkage failed because the billing-account project quota was exhausted. Used
  only new `clervo-n426-*` resources in the authenticated fallback project and
  did not read, connect, stop, or mutate legacy/unrelated resources.
- Deployed digest-pinned Search, Meilisearch and retrieval-gateway workloads in
  a private Calico/default-deny GKE namespace with ClusterIP-only services,
  fixed quota, persistent 10 GB storage, mock-only payment, a USD 10 ticket
  budget and a USD 5/day ceiling. Both route identities executed independently.
- Built the versioned 50-task/five-family corpus and evaluator. The 182 raw
  records show focused recall/precision 0.8409/0.8295, live 0.1250/0.1364,
  simple 0.8750/0.8523 and combined 0.8333/0.8144 with 0.9091 citation validity
  and 1630.51 ms p95. SearXNG returned no relevant results after Wikimedia
  suspension; paid baselines lacked no-charge entitlement; Firecrawl remained
  unavailable. Classification: not yet commercially competitive.
- Browser attempt one was rejected by namespace CPU quota and attempt two
  expired while pulling the pinned image. No worker started and no runtime
  isolation, hostile live-page, teardown, orphan, or complete SSRF proof is
  claimed. Persistent-cache miss/fresh/disclosed-stale behavior passed, but
  connected read-through and staging removal/denylist invalidation remain open.
- Repaired the Cloud Logging metric source binding from
  `jsonPayload.severity` to envelope `severity=ERROR`, observed two nonzero
  DELTA points, bound the enabled policy to the owner-email channel, and
  received HTTP 200 from the verification-code delivery request. No qualified
  Telegram route existed; alert payloads excluded queries, URLs, customer
  payloads, secrets, wallets, and payment data.
- Passed focused/live/both-down, citation, cache, stale, kill-switch/restore,
  timeout/circuit, quota, and unsafe-cost-ceiling drills. The circuit opens but
  lacks half-open restoration; browser-minute and enforced route/domain
  concurrency proof remain absent. Payment stayed mock-only/non-payable,
  third-party general-Web production provider cost remained USD 0.000000, and
  0 USDC was spent.
- Estimated gross ticket infrastructure cost at USD 0.30 with credit allocation
  pending billing lag. Active runtime exposure was USD 4.05784/day. After
  evidence capture, deleted the exact N4.26 cluster and data disk and terminated
  the port-forward; active compute exposure is now USD 0/day, with retained
  artifact/logging storage bounded at an estimated USD 0.01/day upper bound.
- Hash-bound eleven blocker closures and ten remaining blocker reasons without
  changing the historical N4.22 snapshot. Search is not the reference pattern,
  “Advanced live intelligence for agents” remains unauthorized, and Stage 5
  remains unauthorized.
- Validation: N4.26 passed 8/8; N4.22 campaign regression passed 5/5;
  N4.23B/N4.24/N4.25 regressions passed 8/8, 12/12 and 13/13; typecheck,
  lint across 233 source/contract files, full working-tree/history secret scan,
  clean-room boundary, JSON/gzip integrity and diff checks passed. Read-only
  deployment cleanup and retained monitoring/budget queries passed. The Stage
  4 verifier ran exactly once after final binding and passed integrity with
  decision `blocked`, 10 current blockers, nine bound artifacts,
  reference-pattern authorization false, Stage 5 authorization false, zero
  external verifier calls and 0 USDC. Canonical `npm test` remains reserved for
  N4.28 and was not run.
- Exact next ticket: N4.27 only after separate payment authority. Stop after
  the N4.26 commit; do not begin N4.27, N4.28, Stage 5, AI, or Sandbox.

## 2026-07-31 — N4.27 blocked Search quality and browser qualification

- Continued the existing N4.27 worktree at
  `4712a7f2ff69eea03ecf584f9902a200cc8b24ff` without resetting, stashing,
  discarding or rerunning prior work. Inspected every modified/untracked file,
  all frozen benchmark inputs, three regression attempts, the 28-loss ledger,
  final holdout, browser/security/source/cache/locale/token/cost evidence and
  cleanup record.
- Preserved the frozen 50-task corpus, labels, evaluation rules, source
  observations and implementation freeze. The final holdout marker records one
  execution at `2026-07-31T19:34:33.784Z`, its scorecard hash matches, all 900
  compressed raw rows are intact, and the holdout was not rerun.
- Classified all 28 N4.26 simple-to-combined losses: 25 non-query-
  discriminating ranking/relevance losses and three live extraction failures,
  with zero unexplained or deduplication-attributed losses. The final regression
  improved combined recall/precision to 0.8864/0.8826, citation validity and
  extraction to 0.9545, and recorded p95 2404.62 ms; mandatory regression and
  family gates still did not all pass.
- Recorded the truthful frozen-holdout failure: repaired balanced recall and
  precision 0.04/0.04, citation validity 1.0, extraction 0.92, nDCG@10 and
  MRR@10 zero, success@3 zero, and p95 4688.24 ms. All five family floors
  failed and thorough mode did not improve recall.
- Browser qualification attempted exactly 20 consecutive runs, completed 18
  JavaScript markers and clean teardown receipts with zero surviving orphans,
  and failed runs 12 and 18 with `crawl4ai_render_failed`. All exercised
  loopback/private/link-local/metadata/resolved-private/redirect denials passed,
  but controlled DNS rebinding, complete robots, MIME/decompression and hostile-
  page staging tests remain absent. Browser reliability and the mandatory
  security suite therefore failed.
- Preserved the connected cache, locale and prompt-injection gaps; the numeric
  duplicate confusion matrix and relevant-evidence token-retention gate remain
  unproven. Live holdout recall/precision were 0.08/0.08 and source-
  concentration/precision gates failed. Direct Exa testing was unavailable;
  no parity, superiority, advanced-search or highest-performing claim is made.
- Because mandatory prerequisites failed, mock x402 correctly never started:
  no challenge, authorization, verification, mock settlement, receipt, replay,
  real payment or USDC action occurred. The route remains non-payable.
- Validated the cleanup record for the isolated VM/disk, NAT/router, firewall,
  subnet/network, service-account binding, fixture service, artifact images and
  ticket budget. No N4.27 resource is retained; active compute and idle exposure
  remain USD 0/day. Conservative gross ticket upper bound is USD 0.25; third-
  party general-Web production provider cost is USD 0.000000; 0 USDC was spent.
- Hash-bound 23 final N4.27 artifacts and preserved all ten inherited Stage 4
  blockers. Added the ticket/evidence report, updated the source-bound verifier,
  launch authority, README, external master plan and active handoff, and named
  N4.27R as the smallest exact repair ticket. N4.28 and Stage 5 remain
  unauthorized.
- Validation: N4.27 passed 10/10; N4.24/N4.25/N4.26 regressions passed 33/33;
  N4.22 historical/current campaign consistency passed 5/5; typecheck passed;
  lint passed across 236 files; working-tree/history secret
  scan, clean-room boundary, JSON/gzip/hash integrity and diff checks passed.
  The Stage 4 verifier ran exactly once after final evidence binding and passed
  integrity with decision `blocked`, 10 blockers, 23 N4.27 bound artifacts,
  reference-pattern authorization false, Stage 5 authorization false, zero
  external verifier calls and 0 USDC. Canonical `npm test` did not run.
- N4.27 is complete as blocked. Exact next ticket: N4.27R only under separate
  authority. Stop after this commit; do not begin N4.27R, N4.28, mock x402,
  Stage 5, AI, Sandbox, production release, real settlement or USDC spending.

## 2026-07-31 — N4.27R search generalization, live-route and browser repair

- Started from clean HEAD `4ee469c2041af455281c131c0a090bcf31f1095a` and
  preserved every N4.26/N4.27 artifact. The original N4.27 holdout marker still
  records one execution; no original query, label, result or hash changed and
  the holdout was not rerun.
- Produced a read-only 50-task root-cause ledger. Forty-eight balanced tasks
  failed: 30 target sources absent, 11 controlled fixtures disconnected, four
  answerable zero-candidate tasks and three false-positive no-result tasks.
  The two correct no-results caused the published 0.04; answerable recall and
  precision were both zero. Recorded 32 live-circuit-open attempts.
- Proved four evaluator defects independently: no-result recall/precision
  conflation, no-result rank penalty, baseline/citation quality conflation and
  undefined-locale auto-pass. URL-prefix matching and required-term strictness
  were rejected as collapse causes because no labelled URL reached them.
- Before implementation, created and hash-froze a separate 75-task N4.27R
  corpus: 50 development and 25 sealed-validation tasks, exactly 15 per family,
  with unseen entities/domains, multiple answers, no-result/locale/freshness,
  15 JavaScript, five hostile and five degraded-source cases. Original holdout
  URLs/entities/answers are forbidden.
- Repaired candidate retention and deterministic ranking: per-adapter source
  rank, intact hyphenated identifiers, a pre-rerank lexical floor, RRF `k=60`,
  additive score disclosure and complete candidate dispositions. Same-host
  dedup remains conservative and distinct seller/location/version evidence is
  retained. Valid empty results now remain ready instead of poisoning circuits.
- Repaired live federation with hard per-source deadlines, caller cancellation,
  source-specific health/circuit/suspension, quotas, round-robin merge and
  contribution accounting. The controlled six-class live route achieved
  0.4444 recall, 1.0000 precision, 4.109 ms p95, relevant contribution on 15/15
  focused misses and 0.20 largest-source share. Production deployment of those
  source classes remains unqualified; paid providers and public SearXNG remain
  absent.
- Replaced the flaky public browser fixture with controlled certificate-pinned
  HTTPS while retaining the N4.27 gateway/default-deny design. Real Chromium
  completed 20/20 startups and clean teardowns, zero orphans/retained state, 20
  JavaScript fixtures and 910.016 ms p95. Private/loopback/link-local/metadata,
  redirect, rebinding, robots, MIME, decompression and output denials passed.
  Eight hostile pages changed no routing, ranking, payment, tool, citation,
  secret or policy state. This is controlled local proof, not staging promotion.
- Development combined recall, precision, citation validity, nDCG@10, MRR@10
  and success@3 were all 1.0000 with 8.327 ms p95 and retrieval quality 1.0000
  versus simple 0.5966. Froze 17 implementation files at SHA-256
  `9c9ee511ef0f40586725a02e6ae64702a2a157984c0cdeb603e41ffbcf12185a`.
- Ran the sealed 25-task validation exactly once after freeze. Combined recall,
  precision, citation validity, nDCG@10, MRR@10 and success@3 were all 1.0000,
  p95 was 3.216 ms and retrieval quality 1.0000 versus simple 0.6936. Raw hash:
  `ad66d23f87da7a775f9a98fc8ec858162de4146d9367a92015bc8c2584efc56f`.
  No post-validation tuning occurred or is allowed.
- N4.27R created no cloud resource. Read-only cloud name filters returned no
  isolated N4.27 compute/network/artifact resource. Provider production cost,
  incremental cloud cost and active/idle daily exposure are USD 0.000000. Mock
  x402 and real payment did not run; 0 USDC was spent and reserved 0.03 USDC
  remains untouched.
- Focused N4.24/N4.27/N4.27R tests passed 30/30; build, typecheck and lint passed.
  Final integrity/secret/boundary checks are recorded in the closure evidence.
  Canonical `npm test` and the Stage 4 verifier did not run.
- N4.27R is complete at controlled repair-entry level. All ten source-bound
  Stage 4 blockers remain because staging, connected cache, upstream locale and
  payment evidence were not promoted. No commercial, Exa-parity, advanced,
  reference-pattern or Stage 5 claim is authorized. Proposed exact next ticket:
  N4.27S under separate authority; stop without beginning it, N4.28 or Stage 5.

## 2026-08-01 — N4.27S frozen-repair private-staging qualification

- Began from clean HEAD `e8272d002a6429067d7e8ee5dcad989a0f503af1`.
  Hash-verified the N4.27 and N4.27R sealed artifacts and all N4.27R freeze
  files before deployment; neither prior sealed set was rerun or modified.
- Created, labelled, deterministically validated and froze a separate 55-task
  corpus with 11 tasks in each of commerce, property, company, research and
  developer retrieval. It includes official sources, freshness, exact/semantic,
  multiple-source, no-result and multilingual/regional cases. Label validation
  passed 55/55.
- Deployed four digest-pinned components through an IAP-only private VM:
  frozen search `c39a3e…236d5`, gateway `909de1…17bf4`, browser
  `16e3b7…d4eb` and Meilisearch `ca79b2…ae794`. No public application ingress,
  legacy state, customer/wallet secret, paid provider or payable path existed.
- Qualified six official-interface, zero-provider-cost source classes with
  independent health/circuit/quota/concurrency identities. Aggregate live
  recall/precision/p95 were 0.8400/0.6623/2021.578 ms, with relevant evidence
  on 42/50 focused misses and 41.10% largest share. Developer registry produced
  zero relevant contributions, so complete every-source qualification failed.
- Stabilized deployment-only defects before final freeze and recorded every
  correction. Ranking weights, selected source classes, task-specific behavior
  and evaluator rules did not change. The first repeatable operations artifact
  failed due nested-disclosure assertion and exact-cache-URL mistakes and is
  preserved by hash; the corrected repeatable operations run passed every gate.
- Browser final qualification was preserved as a failure without retry or
  tuning: 4/20 startups, 20/20 clean teardown checks, 20% JavaScript success,
  2753.65 ms successful-run p95, zero final retained state/orphans, and 0/8
  hostile executions. Destination/redirect/address SSRF, DNS rebinding, robots,
  MIME, decompression, output, containment and stopped-runtime controls passed.
- Connected cache/freshness, locale honoring/unsupported disclosure, exact
  evidence/citations, route/source concurrency, quotas, circuit open/half-open,
  timeout storm, all-routes-down, global stop/restoration and unbounded-cost
  stop passed. No secret, wallet, query or customer payload was observed in the
  captured health, metrics or monitoring evidence.
- Froze 36 covered files, the evaluator, corpus and labels before the final
  qualification. The 55-task/four-route corpus executed exactly once and wrote
  220 raw rows. Combined recall/precision were 0.8000/0.6803, citation validity
  1.0000, nDCG@10 0.8048, MRR@10 0.8000, success@3 0.8182, extraction 0.8727,
  p50 1004.983 ms, p95 1465.432 ms and p99 2014.189 ms. Mandatory quality
  failed; developer family recall/precision were 0.10/0.10. Combined retrieval
  quality 0.8172 beat simple 0.5705 and focused 0.0455. No tuning or rerun
  followed.
- Estimated gross ticket and owner-cash upper bound are USD 0.35, below the USD
  12 limit. Provider production cost is USD 0.000000; mock/real x402 did not run;
  0 USDC was spent and reserved 0.03 USDC remains untouched. A rejected one-node
  GKE cluster overlapped the replacement VM for about 15 minutes and created an
  estimated USD 5.69248/day configured exposure above the USD 5 ceiling. This
  failure is explicit and keeps `cost_caps` open.
- Deleted the VM, boot/data disks, cluster, network, subnet, router/NAT,
  firewall, Artifact Registry repository/images, service account/IAM binding,
  budget and 17 exact Cloud Build source objects. Only provider-managed audit
  and operation history remains. Direct inventory reports no ticket resource;
  active incremental exposure is USD 0/day.
- Closed five Stage 4 blockers: retrieval safety, cache freshness, locale,
  SSRF/security and baseline improvement. Five remain: isolated JavaScript,
  prompt injection, separate raw/synthesis prices, deployed paid route and cost
  caps. Search is not commercially competitive, production-qualified, Exa-
  parity, best-Web-search or the reference pattern; N4.28 and Stage 5 remain
  unauthorized.
- Validation passed: N4.27S 13/13, N4.27R 8/8, 43 schemas/81 fixtures, 43-
  schema discovery, typecheck, lint across 250 files, secret scan, clean-room,
  environment/product scope, 36-file freeze, 12 bound artifacts, 220-row gzip,
  prior-sealed hashes and diff checks. Canonical `npm test` did not run. The
  Stage 4 exit verifier ran exactly once after final bindings and passed
  integrity with decision `blocked`, five blockers, reference-pattern false,
  Stage 5 false, zero external verifier calls and 0 USDC.
- Exact proposed next ticket: N4.27T under separate authority, using N4.27S
  final evidence read-only and a new pre-split corpus to remediate developer
  retrieval, browser/hostile reliability and cost-overlap enforcement. Stop
  without beginning N4.27T, N4.28, mock x402, payment or Stage 5.

## 2026-08-01 — Codex control-plane guardrails

- Performed owner-authorized cloud-devbox and Codex control-plane maintenance;
  this was not product implementation and did not authorize N4.27T, N4.28,
  mock x402, Stage 5, production release, AI, Sandbox, or any expansion stage.
- Restored the canonical external master-plan authority at
  `/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md` with verified SHA-256
  `b6964d617b8115fc37c27eaa9bed03626fb9abd4d0d6987095051d867cf889aa`.
- Strengthened root `AGENTS.md` with authority precedence, clean-room and secret
  boundaries, payment restrictions, frozen-evidence protection, truthful-claim
  rules, ticket verification requirements, explicit stopping behavior, and a
  narrow owner-authorized devbox/control-plane maintenance boundary.
- No product implementation, provider call, cloud-resource creation, deployment,
  wallet action, payment action, or USDC spending occurred.
- Validation: diff integrity, clean-room boundary verification, and repository
  secret scanning passed.
- Next maintenance task: commit these guardrails, restart Codex so it reloads
  them, then create the engineering profile and foundational Clervo skills.

## 2026-08-01 — Codex engineering profile and authority-preflight skill

- Classified this work as exact owner-authorized Codex control-plane
  maintenance. It did not authorize or begin proposed N4.27T, N4.28, mock
  x402, Stage 5, production, AI, Sandbox, or any later product ticket.
- Added the version-controlled engineering profile at
  `docs/operations/codex/profiles/engineering.config.toml` and installed an
  identical copy at `$CODEX_HOME/engineering.config.toml`. Both have SHA-256
  `cd7a402922d269dbaec4f7d350b8796701c9b8a6027754a714d5c2faaeb975b2`.
  The profile sets on-request approval, workspace-write sandboxing, cached Web
  search, high reasoning, `/workspace/clervo-next` as the only configured
  writable root, excluded temporary writable roots, and disabled sandboxed
  shell network access.
- Added `.agents/skills/clervo-engineering-stage/SKILL.md` with SHA-256
  `05455d1d026eac453c52c5cf3714ae96c68086962871b68fa5ebe4e5ffdcae61`
  plus generated UI metadata. The skill classifies authorized product work,
  authorized control-plane maintenance, read-only analysis, and blocked or
  ambiguous work; treats proposed tickets as unauthorized; preserves
  protected evidence; identifies cost/network/cloud/provider/payment/USDC and
  verification/commit/stop boundaries; never grants authority; and requires
  exact-scope execution, verification, journal evidence, commit, report, and
  stop.
- TOML parsing and exact-value assertions passed. The Codex 0.146.0 strict
  configuration parser loaded the profile successfully from an isolated local
  validation home; the installed named profile loaded successfully; and a
  local prompt-render check confirmed repository skill discovery. Repository
  and installed profile copies were byte-identical.
- The current `skill-creator` `quick_validate.py` passed. Focused YAML,
  front-matter-key, folder-name, UI-metadata, length, and required-boundary
  assertions passed. The generated UI metadata remained byte-identical to the
  reviewed scaffold output.
- Diff integrity passed. The clean-room verifier initially rejected a literal
  legacy path in the new skill; the rule was preserved with generic wording
  and the rerun passed with zero legacy dependencies, network calls, or USDC.
  The first secret-scan attempt was sandbox-blocked when its read-only Git
  subprocess received `EPERM`; the same repository scanner reran host-side and
  passed across the working tree and history with zero secret values printed,
  network calls, or USDC.
- A preliminary Codex Doctor configuration check attempted its built-in
  control-plane connectivity diagnostics and reported provider endpoints
  unreachable. It performed no model inference, Clervo product-provider API
  call, billable request, or successful provider request. No other external
  network check ran.
- No product behavior, lifecycle state, public claim, frozen/sealed/final/
  once-only evidence, provider integration, cloud resource, deployment, IAM,
  secret, wallet, payment, settlement, or USDC balance was changed. Material
  cost was USD 0.000000 and USDC spent was 0.
- Implementation commit:
  `fd5230ffe13fa04aa9d1e70c43f234b2547da8bf` (`chore(codex): add
  engineering profile and stage skill`).
- Exact remaining control-plane task: the owner may later relaunch Codex with
  `codex --profile engineering -C /workspace/clervo-next`; restart/relaunch was
  intentionally not performed here. Proposed N4.27T remains the smallest next
  product ticket but remains unauthorized. Commit this evidence, report, and
  stop.

## 2026-08-01 — Autonomous Codex engineering and creative studio

- Classified the work as exact owner-authorized repository-control-plane and
  cloud-devbox maintenance. It did not authorize or begin proposed N4.27T,
  N4.28, mock x402, Stage 5, AI, Sandbox, production, provider integration,
  deployment, IAM, billing, wallet, payment, or USDC work.
- Implemented five installed, version-controlled Codex profiles: repository-
  sandboxed `engineering` and `design`, guarded host-capable
  `studio-maintenance`, isolated loopback `browser-debug`, and deterministic
  containerized `visual-qa`. All use approval policy `never`; the everyday
  profile denies shell network and writes outside `/workspace/clervo-next`.
  Final prompt-render startups loaded the intended permissions in 958.628 to
  1736.062 ms. Every installed profile was byte-identical to its template.
- Added reviewed global forbidden-command rules and a PreToolUse guard for
  host-capable profiles. Final health proof passed safe-command allowance and
  denials for destructive Git, global Docker deletion, legacy access,
  environment enumeration, external browser navigation, Figma writes, cloud
  IAM, cluster/infrastructure mutation and wallet/payment actions. Common
  credential variables are filtered and no credential value was recorded.
- Retained OpenAI Developer Docs, remote Context7 and browser-debug-only Chrome
  DevTools MCP. Final discovery found 5, 2 and 29 tools in 638.435, 295.443 and
  353.536 ms respectively; complete schemas were retained. An intentionally
  absent MCP failed independently with `ENOENT`. Figma is prepared disabled
  pending owner OAuth/file authority. Playwright MCP and the defective local
  Context7 stdio server were removed/not retained.
- Added and validated the authority-specific `clervo-cloud-cleanup`,
  `clervo-benchmark-freeze`, `clervo-x402-proof`, `clervo-release-handoff` and
  compact `clervo-design-studio` skills alongside the existing
  `clervo-engineering-stage` skill. Codex prompt rendering discovered all six,
  including an explicit skill-routing probe.
- Installed pinned studio packages from a lockfile without lifecycle scripts:
  Playwright 1.62.1, axe Playwright 4.12.1, Lighthouse 13.4.1, Chrome DevTools
  MCP 1.6.0, MCP SDK 1.30.0 and SVGO 4.0.2. Both repository and studio npm
  audits reported zero vulnerabilities. Retained the official Playwright image
  at immutable digest `sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`.
- Proved browser separation with distinct disposable container IDs, loopback-
  only DevTools, visual-QA network mode `none`, no shared mounts and complete
  teardown. Chromium, Firefox and WebKit each passed desktop/mobile stable
  screenshots, axe, keyboard, layout-shift and reduced-motion checks. Forced
  colors, a 100 ms route delay and 4x CPU throttle passed. The repository-only
  fixture scored Lighthouse performance/accessibility 1.00/1.00, CLS 0 and
  LCP 750.802 ms; it is not deployed-product or customer evidence.
- Native `rg` located the four representative references in median 4.184 ms;
  TypeScript semantic lookup returned the same references in 64.422 ms, so
  Serena was rejected. Deterministic summaries reduced Codex feature output
  75.80% and repository inventory output 87.53% while retaining full raw logs;
  RTK and Caveman were rejected as automatic evidence filters.
- Added the studio ADR, cloud-devbox runbook, architecture/profile guide, MCP,
  skill, CLI, candidate, security, authentication, recovery, upgrade,
  rejected/deferred and machine-readable inventories, health/benchmark scripts,
  clean-VM restoration and snapshot-readiness evidence. No billable snapshot
  was created. Frontend/media frameworks remain deferred to exact future
  product tickets; no product dependency was added.
- Preserved every material failed/degraded attempt: Context7 stdio behavior,
  two visual-QA failures, health metadata and timing observations, navigation
  and compression fixture failures, the launcher strict-debug failure,
  ShellCheck and sandboxed audit failures, an incomplete startup benchmark,
  and the clean-room fixture failure. Repairs were rerun without modifying any
  sealed/frozen/final/once-only product corpus or verifier.
- Final verification passed: studio health; five TOML parses and installed-copy
  comparisons; six current skill validations; Node syntax; ShellCheck; JSON
  parsing; MCP discovery/failure isolation; browser isolation; cross-browser
  visual QA; dependency audits; typecheck; lint across 256 source/contract
  files; product-scope consistency; clean-room boundary with zero legacy
  dependencies/network calls/USDC; secret scan across worktree and history with
  zero values printed; and diff integrity. Canonical product tests and the Stage
  4 verifier did not run.
- External effects were limited to official documentation/source research,
  npm registry metadata/package download/audit, the official Microsoft browser
  image pull, and read-only OpenAI Developer Docs/Context7 discovery. There was
  no product-provider call, cloud resource, deployment, IAM/billing change,
  secret change, wallet/payment action, or production effect. Direct material
  cost was USD 0.000000 and USDC spent was 0. Task containers and temporary
  scaffolds were removed; the pinned browser image and installed profile/tool
  cache remain for recovery. Unrelated projects and the legacy environment were
  untouched.
- Implementation commit:
  `59e91567f58c665f695cb4522a14f73e9733ec0a` (`chore(codex): build
  autonomous studio`).
- Exact next action before returning to the roadmap: start the next authorized
  session with `bash scripts/codex-studio/launch.sh engineering`, re-read the
  current handoff, and obtain explicit owner authorization for N4.27T if that is
  still the desired next product ticket. N4.27T remains proposed and
  unauthorized; stop without beginning it, N4.28 or Stage 5.

## 2026-08-01 — Permanent Codex scrollback and tmux defaults

- Classified the work as exact owner-authorized repository-control-plane and
  devbox maintenance. Scope was limited to terminal/Codex/tmux configuration,
  installer/health regression coverage, operational documentation and evidence.
  No product ticket, product code, lifecycle state, stage gate, payment state or
  public product claim changed.
- Added `[tui]` defaults to all five repository profile templates and installed
  copies: `alternate_screen = "never"` and `raw_output_mode = true`. The
  installed `engineering`, `studio-maintenance`, `design`, `browser-debug` and
  `visual-qa` files under `/workspace/codex-home` are byte-identical to their
  repository templates.
- Added `docs/operations/codex/tmux.conf`, configured `mouse on` and
  `history-limit 200000`, taught the reproducible installer to place and compare
  the current devbox user's `.tmux.conf`, and reloaded the existing `clervo`
  tmux server. Live global options reported `mouse on` and
  `history-limit 200000`.
- Updated the studio health check to enforce the five TUI defaults, exact tmux
  installed-copy equality, isolated tmux runtime behavior and tmux tool
  availability. The first full run exposed only a stale permission-rendering
  assertion in `codex debug`; its failed report is preserved at
  `docs/evidence/codex-studio/raw/terminal-scrollback-health.json`. The repaired
  rerun passed and is preserved at
  `docs/evidence/codex-studio/raw/terminal-scrollback-health-final.json`.
- Validation passed: five TOML parses; five short-lived Codex 0.146.0
  `--strict-config` TUI startups; installer and source/installed comparisons;
  studio health; isolated and live tmux option checks; ShellCheck; Node syntax;
  JSON parsing; TypeScript typecheck; lint across 256 source/contract files;
  repository and installed-studio npm audits with zero vulnerabilities; secret
  scan across working tree/history with zero values printed; clean-room boundary
  with zero legacy dependencies, network calls or USDC; scope and diff-integrity
  checks. Canonical product tests and the protected Stage 4 verifier did not run.
- External activity was limited to fetching the current official Codex manual
  for the supported TUI key contract and routine npm install/audit metadata.
  There was no product-provider call, cloud resource, deployment, IAM/billing or
  secret change, production effect, wallet/payment action or USDC spend. Direct
  material cost was USD 0.000000 and USDC spent was 0.
- The isolated health-check tmux server and strict-startup TUI probes were
  terminated. No task container or residual billable resource remains. The
  existing `clervo` tmux session remains attached with the new options active;
  installed profile and tmux copies remain intentionally for future launches.
- Current lifecycle truth is unchanged: Search is not commercially competitive
  or the reference pattern, the First Revenue Release is not ready, and Stage 5
  remains unauthorized.
- Implementation commit:
  `70f10f80b50c137826cc27e33355f6f8ece0e170` (`chore(codex): preserve
  terminal scrollback`).
- Exact next proposed product task remains N4.27T under separate owner
  authority. N4.27T, N4.28, mock x402, Stage 5, AI, Sandbox, production release,
  real payment and all later stages remain unauthorized. Stop here.

## 2026-08-01 — Native terminal-selection fallback

- Classified the follow-up as exact owner-authorized Codex/tmux control-plane
  maintenance after Shift-drag failed in the attached browser terminal. No
  product code, behavior, lifecycle, stage, payment state or public claim was
  changed.
- Confirmed the live client was `xterm-256color` with clipboard capability,
  tmux mouse capture enabled, default drag-to-copy bindings and a 200,000-line
  history. The terminal did not provide the expected Shift mouse bypass.
- Added a persistent conflict-free `prefix+y` binding: Ctrl+B followed by `y`
  toggles tmux mouse capture off for native click-drag highlighting and back on
  for wheel scrolling. The repository template and installed `.tmux.conf` are
  byte-identical, and the existing `clervo` server loaded the binding with mouse
  still on by default.
- Health evidence at
  `docs/evidence/codex-studio/raw/terminal-native-copy-fallback-health.json`
  passed installed-copy, binding, isolated mouse-on → mouse-off → mouse-on,
  200,000-line history and all existing studio checks. Typecheck, lint across
  256 files, npm audits, Node/JSON parsing, secret scanning, clean-room boundary
  and diff integrity passed. Product tests and the protected Stage 4 verifier
  did not run.
- External effects were limited to routine cached/install and npm audit
  metadata. No provider, cloud, deployment, IAM/billing, secret, production,
  wallet, payment or USDC action occurred. Cost was USD 0.000000 and 0 USDC.
  The isolated preflight and health tmux servers were terminated; the live
  `clervo` session remains attached with no task container or billable residue.
- Implementation commit:
  `185d0ee` (`fix(tmux): add native selection fallback`).
- Product truth and authorization are unchanged. N4.27T remains the exact next
  proposed product ticket under separate authority; N4.27T, N4.28, mock x402,
  Stage 5 and later work remain unauthorized. Stop here.

## 2026-08-01 — Readable Codex transcript default

- Classified the work as exact owner-authorized Codex control-plane and devbox
  maintenance. Scope was limited to restoring readable chat formatting in the
  five Codex profiles, installing the corrected copies, updating health
  enforcement, inventory and operator documentation, and preserving evidence.
  No product ticket, product behavior, lifecycle state, stage gate, payment
  state or public claim changed.
- Diagnosed the white, weakly differentiated transcript as
  `raw_output_mode = true`, introduced by the earlier scrollback maintenance.
  The live browser terminal, tmux and Codex process retained 256-color support,
  emitted ANSI color and did not inherit `NO_COLOR`; the terminal color path
  was not the failure. Official Codex documentation also confirmed that
  `tui.theme` affects fenced code and diffs rather than general chat prose.
- Changed all five version-controlled and installed profiles to explicit
  `raw_output_mode = false` while retaining `alternate_screen = "never"`.
  This restores rich transcript formatting without removing the existing tmux
  mouse behavior, native-selection fallback or 200,000-line history. The
  installer restored byte-identical profile copies under
  `/workspace/codex-home`; the effective global model remained
  `gpt-5.6-sol`.
- Updated `scripts/codex-studio/health-check.mjs`, the machine-readable studio
  inventory, the Codex operations guide and cloud-devbox runbook. Final raw
  proof at
  `docs/evidence/codex-studio/raw/terminal-readability-health.json` passed all
  five source/installed profile comparisons, formatted-mode assertions and
  profile-start probes, plus the existing tmux copy/runtime, package, guard,
  rule, browser-image and tool checks.
- Exact validation passed: `bash scripts/codex-studio/install.sh` with 235
  pinned studio packages installed and zero reported vulnerabilities;
  `node scripts/codex-studio/health-check.mjs`; Node syntax; JSON parsing;
  `npm run lint` across 256 source/contract files; `npm run typecheck`;
  `npm run verify:boundary` with zero legacy dependencies, network calls or
  USDC; `npm run scan:secrets` across the worktree and history with zero secret
  values printed; and Git diff integrity. Canonical product tests and the
  protected Stage 4 verifier did not run.
- External effects were limited to read-only current Codex documentation
  inspection and routine npm install/audit metadata or cache access. There was
  no product-provider or model inference call for verification, cloud resource,
  deployment, IAM/billing or secret change, production effect, wallet/payment
  action or USDC spend. Direct material cost was USD 0.000000 and USDC spent
  was 0.
- The health check terminated its isolated tmux server; no task container or
  residual billable resource remains. The intended installed profile/package
  cache and the existing attached `clervo` session remain. Because that session
  loaded the old value at startup, it needs one explicit `/raw off` command or
  Alt+R press by the owner; no keys were injected into the active composer.
  All future profile launches start formatted automatically.
- Current lifecycle truth is unchanged: Search is not commercially competitive
  or the reference pattern, the First Revenue Release is not ready, and Stage 5
  remains unauthorized.
- Implementation commit:
  `d912849fc5fce6a3f5d0adc014c6254033e6816c` (`fix(codex): restore
  readable transcript formatting`).
- Exact next proposed product task remains N4.27T under separate owner
  authority. N4.27T, N4.28, mock x402, Stage 5, AI, Sandbox, production release,
  real payment and all later stages remain unauthorized. Commit this evidence,
  report and stop.

## 2026-08-01 — NPLAN.3 six-product core-first platform roadmap

- The owner explicitly redirected the session from authorized N4.27T product
  work to a full plan audit and forward roadmap amendment. N4.27T was paused
  before implementation or cloud mutation. NPLAN.3 was classified as an exact
  owner-authorized product/roadmap authority ticket; it did not execute or
  broaden N4.27T.
- Audited the controlling master plan, canonical launch authority, active
  scope/discovery/copy sources, repository shape, generated preview, and path-
  limited Git history. Only Search has an implementation foundation. AI,
  Sandbox, RPC, Prediction, and Crypto service directories are empty; intended
  shared catalog, commerce, routing, observability, worker, MCP and SDK
  packages are empty; the site has prototype Markdown/JSON only; JSON-LD,
  sitemap, robots/canonical and task-page SEO systems do not exist.
- Recorded the primary rework risks: 43 separately maintained wire schemas;
  TypeScript/schema/runtime-assertion drift; a Search-hardcoded discovery
  generator; a generated catalog whose product records do not conform to
  `CatalogEntry`; all schemas copied into public OpenAPI without visibility
  classification; manually repeated lifecycle/site/prose facts; and repeated
  ticket-specific deployment definitions. `generated/public` appeared in 22
  prior commits, mostly as deterministic mechanical projection churn, while
  the real site/design/SEO implementation has not begun.
- Adopted **Clervo Platform** (`clervo.platform`) as the all-six First Revenue
  Release. The stable pillars remain Search/Live Intelligence, AI, Secure
  Sandbox, RPC, Prediction and Crypto Intelligence. Search remains `preview`;
  the five unimplemented pillars remain `unavailable`; every
  `coreQualified` flag and both readiness gates remain false.
- Replaced the old forward `fullPlatformExpansion` scope with the versioned
  private `productCore` gate. Stages 5–10 build the six cores; Stage 11 proves
  combined/private stability; Stage 12 freezes the cross-pillar contracts,
  registry, prices and lifecycle; Stage 13 builds one shared API/MCP/SDK/
  onboarding/design/docs/discovery/JSON-LD/sitemap/SEO/distribution system;
  Stages 14–16 harden/deploy, prove one separately authorized bounded
  settlement and require one external useful paid result.
- Preserved the required product discipline inside each core stage: versioned
  contracts, catalog candidates, lawful supply, security, quality, latency,
  degradation, infrastructure/provider cost, hard ceilings, mock commerce,
  replay/receipts, operations, evidence and cleanup. Only public projections
  wait for the Stage 12 freeze.
- Synchronized active authority, policy, README/builder/prototype/brand/
  marketing/use-case sources, product-scope schema/source/fixtures, truthful
  discovery copy, generated artifacts, focused checks, active state, external
  master plan and NPLAN.3 decision/ticket/evidence. NPLAN.1/NPLAN.2 and every
  completed Stage 0–4 ticket/evidence/frozen artifact remain historical and
  unchanged.
- Scope/discovery version `2026-08-01.3` passed 43-schema/81-fixture validation.
  Focused discovery passed 6/6; NPLAN.1 history passed 2/2 after repairing one
  stale current-authority assertion; NPLAN.2 history passed 2/2; NPLAN.3 passed
  5/5; product-scope consistency, TypeScript typecheck, lint across 257 files,
  JSON parsing, secret scan, clean-room boundary, exact 12-stage master/repo
  comparison, active contradiction scan, deterministic generation, and final
  diff integrity passed.
- Preserved a validation-process failure: an audit helper used Markdown
  backticks in a double-quoted shell text check and unintentionally invoked
  canonical `npm test`. It stopped at typecheck with
  `acceptance: FAIL at typecheck (exit 1)` while concurrent NPLAN.3 edits were
  incomplete. No later build, discovery, Stage 4 verifier, or contract-test
  acceptance gate ran. The canonical suite was not rerun.
- Official OpenAPI, JSON Schema, MCP, Google structured-data and sitemap
  guidance was read for the planning preflight. No billable product-provider,
  cloud, IAM, deployment, secret, payment, wallet, production, domain, listing
  or legacy action occurred. Provider/infrastructure cost was USD 0.000000,
  USDC spend was 0, the 0.03 USDC reserve remains untouched, and active
  incremental exposure remains USD 0/day.
- Stage 4 remains blocked on isolated JavaScript retrieval, prompt-injection
  boundaries, separate raw/synthesis prices, deployed paid route and cost caps.
  Search is not commercially competitive, production-qualified or the
  reference pattern; Stage 5 remains unauthorized.
- Starting commit:
  `5a34e4de12aff85c9d25f49abe19084e92e82572`. Final implementation commit is
  the commit containing this append-only entry and NPLAN.3 closeout evidence.
- Exact next product ticket is N4.27T under the owner's already recorded
  authorization and existing scope/stop conditions. Stop after the NPLAN.3
  commit; do not begin N4.27T implementation, N4.28, mock x402, Stage 5, any
  later pillar, cloud/deployment, payment, production or legacy work here.

## 2026-08-01 — NPLAN.3R acceptance-handoff repair

- An independent read-only closeout review found one control-plane
  contradiction after NPLAN.3 commit
  `3760493d9c2f55e92472e14b38629c47d6db13be`: the repository evidence
  preserved an accidental canonical acceptance invocation that failed at
  typecheck, while the external master-plan handoff said canonical acceptance
  did not run.
- Corrected only the external handoff. It now states that the run occurred once
  during incomplete concurrent edits, failed at typecheck with exit 1, and was
  not rerun; the Stage 4 verifier did not run.
- Historical NPLAN.3 evidence and its original external-master hash remain
  unchanged. No product, runtime, lifecycle, stage, benchmark result, provider,
  cloud, payment, production or legacy state changed. Cost was USD 0.000000 and
  USDC spend was 0.
- Final repair validation and the new external-master hash are recorded in
  `docs/evidence/NPLAN.3R-acceptance-handoff-repair.md`.
- Commit this bounded repair and stop before NPLAN.4 or product work.

## 2026-08-01 — NPLAN.4 standing autonomous completion and owner-input package

- The owner explicitly authorized continuous progress toward the truthful
  all-six roadmap without repeated per-ticket approval, bounded repair tickets
  for terminal failures, an exhaustive owner-only prerequisite list, safe x402
  preparation, and USD 0 mandatory paid API dependency. NPLAN.4 translated
  that mandate into fail-closed standing program authority; it did not grant
  unlimited cloud, production, payment, lifecycle, cost, or secret authority.
- Installed a private repository control plane with one exact ticket lease, one
  worker cycle per ticket, clean predecessor and stage admission, fresh-cycle
  dispatch, and explicit truth, evidence, cost, owner-input, cleanup, terms, and
  unknown-outcome checks. Expected red/green defects stay inside the active
  ticket; terminal closeout failures, post-commit regressions, and failed
  qualifications create exact repair tickets. Two consecutive same-cause
  repairs require an architecture decision.
- Audited 29 genuinely human responsibilities and deduplicated them into 25
  machine intake groups. Added a human guide, ignored input templates, and
  operational validators for filled owner and prepared non-authoritative
  external/x402 packages. Missing owner input blocks only the affected action
  and cannot be invented, inferred, or used to skip a gate.
- Fixed mandatory paid, eventually paid, trial-to-bill, and automatic-overage
  third-party API cash spend at USD 0. Infrastructure spend remains separately
  explicit, owner-input-bound, and explicitly authorized. No paid provider,
  model inference, cloud, deployment, IAM/billing, production, domain, registry, customer, wallet,
  payment, USDC, or legacy action occurred. Direct material cost was USD
  0.000000, USDC spent was 0, the 0.03 USDC reserve remains untouched, and
  active incremental exposure remains USD 0/day.
- Prepared a dormant Stage 15 x402 input path that uses a public receiver
  `payTo` address and separate payer address with a restricted wallet/KMS/HSM/
  hardware/unix signer service reference. Raw keys, seeds, raw signer files,
  signatures, and payment headers are forbidden from chat, Git, environment
  dumps, arguments, logs, and evidence. The prepared input pins x402 v2, CAIP-2
  network, exact six-decimal USDC asset, atomic amount, fees, facilitator,
  expiry, request identity, one execution, evidence, alerts, kill switch, and
  reconciliation. It caps proof spend at 0.01 USDC, preserves at least 0.02
  USDC, and quarantines unknown settlement without a new authorization.
- An independent read-only audit identified five pre-commit defects: a
  bootstrap-state-specific validator, incomplete authorized-state validation,
  a raw-file-capable payer signer reference, incomplete secondary alert
  coordinates, and unfinished closeout evidence. All five were repaired before
  commit. Future dispatch states now validate generically and prepared input
  packages are covered by adversarial focused tests.
- A second independent security audit then proved that self-declared workspace
  hashes and approval references were forgeable and that lifecycle/stage
  booleans could falsely declare completion. NPLAN.4 now rejects `authorized`
  external/x402 workspace files, requires separate explicit owner authority for
  external effects until a signed owner-controlled supervisor exists, adds that
  trust root to the owner-only package, and derives completion from eight
  ordered canonical evidence files with actual byte hashes, verifier/gate
  metadata, and ancestor subject commits. It also repaired
  future-dated envelopes, cleanup/runtime/credential validation, exact-resource
  wildcards, all required x402 evidence flags, and a final bypass that could
  label cloud/payment admission ready while trusted enforcement was unavailable.
- Focused validation passed: autonomous-completion verifier; NPLAN.4 contract
  tests 5/5; NPLAN.1, NPLAN.2, and NPLAN.3 regressions 2/2, 2/2, and 5/5;
  TypeScript typecheck; lint across 259 source/contract files; product-scope
  consistency; secret scan; clean-room boundary; JSON and Node syntax; active
  transition/contradiction scan; and Git diff integrity. Canonical `npm test`
  and the protected Stage 4 verifier did not run.
- Product truth is unchanged. Search remains `preview`; the other five pillars
  remain `unavailable`; Stage 4 retains five blockers; Search is not the
  reference pattern; Stage 5 and the First Revenue Release remain false. No
  sealed or once-only evidence was inspected, changed, executed, or authorized
  for rerun.
- Starting commit:
  `bc92aa2a3309815d3008220fe2a284cf22111dc6`. Final implementation commit is
  the commit containing this append-only entry and NPLAN.4 closeout evidence.
- After atomic commit and a clean post-commit check, stop this worker. A fresh
  cycle may admit N4.27T repository-local work under its recorded scope. Keep
  N4.27S final evidence read-only and use a new independent pre-split
  procedure. The N4.27T cloud phase remains owner-blocked on exact finite cloud
  inputs and separate explicit authority; unattended admission also needs the
  signed trust boundary. N4.28, mock x402, Stage 5, production, real payment,
  later pillars, and legacy mutation remain outside this ticket.

## 2026-08-01 — N4.27T repository-local frozen-result repair

- The owner explicitly authorized N4.27T under its recorded scope and stop
  conditions, and NPLAN.4 admitted one repository-local worker cycle. Starting
  commit was `5b22c81df0ec7df09a04fa6e96a0118db9841666`.
- Preserved every N4.27S final and earlier sealed artifact. Before repair
  implementation, created disjoint development and validation material and a
  hash-bound split freeze. The validation corpus and labels remain
  `frozen_not_executed` with a one-run ceiling; implementation parsed only the
  development split.
- Implemented conservative exact npm package and GitHub repository metadata
  lookup with bounded normalized fallback, attribution, quota, concurrency and
  circuit controls. Generated a separate N4.27T staging entry that replaces
  only the developer adapter while leaving the five other source adapters and
  protected N4.27S shell unchanged.
- Implemented a nonroot disposable Chromium worker with explicit preflight,
  render, cleanup and supervisor budgets; process-group termination; `tini`
  reaping; memory-backed shared memory; read-only root; gateway-only egress;
  seccomp and hostile-output isolation. A local image built as
  `sha256:3093f73db06255063ac633bce4226956925f03554b64fceacf9078ede176b73a`,
  reported Node 24.18.1 and Chromium 151.0.7922.71, failed closed under the
  default kill switch, and was deleted.
- Implemented a fail-closed resource-exclusivity gate requiring a fresh
  complete inventory, zero ticket resources, terminal deletion operations,
  no unknowns, exact labels/names and combined projected exposure at or below
  USD 5/day. Its receipt cannot authorize an external action.
- Preserved three ordinary repair-process failures. The first staging generator
  run created no output because a dotted schema identity was not transformed;
  after repair it passed without changing the protected source hashes. The
  first NPLAN.4 transition contract run passed 3/5 because snapshot assertions
  still named NPLAN.4 as active; after a generic closeout-assertion repair it
  passed 5/5. The first focused closeout run passed 7/8 because its final
  assertion still expected N4.27T `active`; after synchronization to
  `blocked_owner` it passed 8/8.
- Final local validation passed: N4.27T 8/8; NPLAN.4 dispatcher 5/5; TypeScript
  typecheck; lint across 262 source/contract files; autonomous-completion
  verifier; product-scope consistency; secret scan; clean-room boundary; Node
  syntax; JSON parse; frozen/protected artifact hashes; and Git diff integrity.
  Canonical `npm test`, Stage 4 exit verification, N4.27S qualification and the
  new validation split did not run.
- Official npm Registry API, Playwright container, GitHub rate-limit and Google
  Cloud deletion guidance informed the local design. The local Docker build
  made ordinary registry and Debian package-download requests. No credentialed
  provider, cloud, IAM, billing, secret, deployment, production, customer,
  wallet, payment, USDC or legacy action occurred. Provider/infrastructure cost
  was USD 0.000000, active incremental exposure is USD 0/day, USDC spent was 0,
  and the reserved 0.03 USDC remains untouched.
- Search remains `preview`; all five Stage 4 blockers remain source-bound.
  Search is not commercially competitive, production-qualified or the
  reference pattern. N4.28, mock x402, Stage 5, production, real payment and
  later pillars remain unauthorized.
- Final implementation commit is the commit containing this append-only entry.
  After commit and post-commit checks, stop. N4.27T isolated cloud qualification
  is `blocked_owner` until the exact finite cloud identity/resource/cost/
  no-IAM-billing/cleanup package and a separate explicit owner action exist.

## 2026-08-01 — N4.27T once-only isolated cloud qualification and cleanup

- The owner separately authorized the exact N4.27T cloud execution plan after
  granting the configured deployer access. The plan was limited to project
  `bloxsniper-prod`, zone `us-central1-a`, exact `clervo-n427t-*` resources,
  one validation execution, USD 5 gross and daily ceilings, synchronous
  cleanup and zero residual exposure. The owner reported USD 1,700 in startup
  credits; the runtime blocked billing inspection, so credit balance/expiry and
  actual billed cost remain unverified and the attached-billing USD 5 ceiling
  controlled. No IAM or billing mutation ran.
- Preflight exact-prefix inventory found zero ticket instance, disk, address,
  firewall, cluster, repository, alert or pending operation. The fail-closed
  resource gate admitted USD 4.05784/day candidate exposure. Frozen
  implementation commit was
  `c54db9e7923e26ad414cec5a061d139a2d51ab78`; the armed execution-manifest
  commit was `e0387d173afd6bbbb10c67ade3f8649fcf7e79a8`.
- Preserved ordinary setup failures without concealing them. The first Artifact
  Registry create command used unsupported `--async=false` and created no
  resource; the corrected synchronous command created the exact repository.
  `gcloud components install` was rejected by the snap-managed installation;
  the official `gke-gcloud-auth-plugin` 577.0.0 Debian package was downloaded,
  checked against published SHA-256
  `77b1c1fa16bfaf3339366ac8b5427106e5812c9c6db91da127d3e9dc9f46982d`,
  and installed on the devbox. A final read-only Artifact Registry operations
  list command was unsupported; repository deletion had already completed and
  fresh negative inventory independently proved absence.
- Built and pushed the frozen qualification image at
  `sha256:554a865f572123704d352135cd6de1c422d5b2db70e43dd2a724ae0ef123c12e`
  with Node 24.18.1 and Chromium 151.0.7922.71. Created one zonal GKE cluster
  using the original create operation only; no create retry or fallback ran.
  The frozen Job was applied once at 2026-08-01T20:27:32Z with
  `backoffLimit: 0`. Its only pod ran as UID 65534 with read-only root,
  `RuntimeDefault`, no service-account token, zero restarts, exact image digest
  and exit code 0. The infrastructure success preserves the evaluator result;
  it is not a product-gate pass.
- The final qualification failed. All ten live public developer metadata tasks
  passed: developer retrieval 10/10 at USD 0 provider API cash cost. Browser
  execution passed 0/20: all 12 JavaScript and eight hostile fixtures returned
  `browser_process_failed:` without diagnostic detail. Mandatory browser,
  JavaScript and hostile gates failed and `finalGatePass` is false. Execution
  count is one; no rerun, relabelling, tuning or reuse is authorized. The raw
  result hash is
  `eb5e5b8b4f8ac622b4b7e4790479480c57008b9781255727a7703e93e2502425`.
- Cleanup was synchronous. Deleted the namespace, then the cluster under the
  original delete operation, then the Artifact Registry repository/image and
  local image. Fresh inventory found zero exact-prefix instances, disks,
  addresses, firewalls, clusters, repositories, alerts, unknown resources or
  pending container/compute operations. The cluster lifetime from create-start
  to delete-complete was 1,033.357 seconds; estimated gross cost is USD
  0.0485324, reported conservatively as USD 0.05, against the USD 5 ceiling.
  Actual provider billing is unknown, provider API cash cost is USD 0, residual
  exposure is USD 0/day, USDC spent is 0 and the 0.03 USDC reserve is untouched.
- No public ingress, monitoring policy, payment, mock x402, wallet, IAM,
  billing, secret, production, customer, legacy or unrelated-resource mutation
  ran. N4.27S and every earlier sealed/final artifact remained unchanged.
- Closeout evidence hash is
  `c15693caca4dfefc8a192abdaeeb5ea056e4dadbdbef8596a30def4ea1a4e14d`.
  The pre-run freeze and armed execution manifest remain byte-immutable; the
  separate closeout binds them to the raw result, Kubernetes evidence and
  cleanup evidence. The synchronized external master-plan hash is
  `1fc5e6afdb8e519631ffbf13f551c89379c264b6aca963edc1d22c0316fa86b8`.
- Closeout validation passed N4.27T cloud 4/4, NPLAN.4 5/5, TypeScript
  typecheck, lint across 263 source/contract files, autonomous completion,
  product scope, secret scan and clean-room boundary. The first N4.27T closeout
  run passed 7/8 because one historical assertion still expected active cloud
  authority; it was synchronized to require completed/consumed authority and
  the N4.27U local handoff, then passed 8/8. Canonical `npm test`, the protected
  Stage 4 exit verifier and every frozen qualification did not run.
- Product truth did not advance. Search remains `preview`; the other five cores
  remain `unavailable`; all five Stage 4 blockers remain; Search is not the
  reference pattern; N4.28, Stage 5, production and payment remain
  unauthorized.
- N4.27U is the exact bounded repair for a fresh local dispatcher cycle. It may
  use synthetic development-only fixtures to diagnose the nonroot Chromium
  process-launch/diagnostic boundary, repair the smallest proven cause and
  freeze a new independent pre-split requalification procedure. It has no
  cloud authority and may not open, reuse, rerun or tune against N4.27T final
  evidence. Final closeout commit is the commit containing this entry; after
  post-commit verification, stop this worker before N4.27U implementation.
