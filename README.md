# Clervo Next

Clean-room repository for the Clervo BlockRun-10x mission.

## Current state

Tickets **N0.1** through **N4.8** are complete: the independent foundation and staging boundary are established; product contracts define versioned operation envelopes, fail-closed lifecycle/idempotency, catalog activation, removable provider adapters, qualification evidence, immutable receipts, and allowlisted audit events; deterministic OpenAPI 3.1.1 and discovery previews are generated without claiming live products; hash-bound maximum-charge quotes can produce explicitly non-payable mock x402 v2 challenges; a deterministic mock commerce kernel proves one execution, one balanced charge, replay, quarantine, and evidence-bound reconciliation; vendor-neutral observability contracts provide redacted logs/spans, bounded-cardinality metrics, and deterministic delivery-neutral alerts; deterministic health-aware routing enforces qualification, dependency, deadline, circuit, cost, and request-budget gates before selecting a provider; deterministic search-result integrity canonicalizes and deduplicates URLs, exposes score components, and binds citations to retained evidence; retrieval qualification separates provider selection from live eligibility and requires two independently operated evidence-dated paths; the bounded fetch adapter enforces per-hop URL/DNS/socket/redirect/robots/deadline/MIME/byte/content-use policy with immutable hash-bound receipts; hash-bound text/HTML bytes can be normalized in a bounded non-executing worker with exact offsets, untrusted-instruction labels, and deterministic exact/near-content deduplication; one qualification-bound identity query can execute against exactly two independent adapter paths in parallel with immutable raw-response provenance, one absolute deadline, linked cancellation, safe failure codes, and explicit complete/partial/failed accounting; and federation observations can now be assembled through bounded fetch, real worker extraction, content deduplication, deterministic ranking, exact citation verification, and immutable result-to-path/body/extraction provenance; ranked evidence can cross a fixed no-tools/no-actions synthesis boundary only as untrusted data with mandatory existing citation IDs and atomic output rejection; and recorded observations can be independently scored across six required quality/resilience categories against a named baseline without claiming live quality.

The selected foundation is TypeScript on Node.js 24 LTS, PostgreSQL 18, and pg-boss 12 backed by the same PostgreSQL cluster. npm manages the JavaScript workspace. `packages/contracts` publishes the repository-local source of truth for operation, catalog, adapter, qualification, receipt, audit, discovery, quote, mock challenge, ledger, replay, reconciliation, observability, alerts, routing, budgets, circuits, deterministic search-result integrity, retrieval qualification, retrieval-target safety, bounded retrieval fetches, deterministic text/HTML extraction, content-level deduplication, deterministic two-path retrieval federation, bounded retrieval evidence assembly, citation-preserving retrieval synthesis, and recorded search benchmarking. `generated/public` contains reviewable OpenAPI, discovery, `llms.txt`, and schema artifacts marked `contract_preview`. Brave Search API and Common Crawl are provisionally selected as independent primary/fallback retrieval paths, but neither is live-qualified: a bounded Common Crawl collection-metadata request proved only public endpoint reachability, while credentialed Brave, URL-index, and archive range-read probes remain outstanding. Provider-specific search adapters, live provider-to-fetch execution, PDF/JSON/OCR extraction, browser/JavaScript rendering, calibrated extraction/deduplication/ranking quality, query expansion, live-model qualification and complete prompt-injection/semantic-entailment proof, calibrated or live benchmarks, free/paid HTTP paths, database persistence, durable robots/budget/circuit/federation state, live health probes, real payment verification/authorization/settlement, telemetry export, alert delivery, and live deployment remain intentionally unimplemented.

## Authority

The controlling plan is:

`/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md`

## Runtime setup

Repository execution is pinned exactly to Node.js `24.18.1` and npm `10.9.8`. Select the committed version before installing or running commands: `nvm install && nvm use`, `asdf install`, or `mise install`. The same pin is recorded in `.nvmrc`, `.node-version`, `.tool-versions`, `package.json`, `package-lock.json`, and `infra/stack-versions.env`; `npm install` and every npm script fail immediately if the active Node.js process differs. Run `npm run verify:runtime` to diagnose the active process and `npm test` for canonical acceptance.

The absolute path above is documentation for operators, not a runtime dependency. Product code must not import, mount, execute, or otherwise depend on the legacy `/workspace/x402-platform` repository or its state.

## Repository boundary

- This directory is its own Git repository.
- Legacy code, databases, queues, catalogs, ledgers, generated artifacts, and deployment state are evidence only.
- No symlink, submodule, gitlink, local package dependency, or runtime path may escape this repository.
- Small concepts may be reimplemented later only when an authorized ticket explicitly permits it.

## Validation

Run:

```sh
npm run verify:runtime
npm test
npm run staging:smoke
```

The repository requires exactly Node.js 24.18.1. `.nvmrc`, `.node-version`, and `.tool-versions` select that runtime in common version managers; npm uses strict engine enforcement; install and acceptance fail closed if the executing Node.js version differs. The commands use local POSIX tools, Git, and Node.js. Acceptance performs no external network access, provider calls, cloud changes, or payments; staging smoke uses loopback HTTP only. The checks do not connect to PostgreSQL, start pg-boss, or prove remote GitHub Actions/environment protection or live hosting.
