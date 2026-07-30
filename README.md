# Clervo Next

Clean-room repository for the Clervo BlockRun-10x mission.

## Current state

Tickets **N0.1** through **N4.1** are complete: the independent foundation and staging boundary are established; product contracts define versioned operation envelopes, fail-closed lifecycle/idempotency, catalog activation, removable provider adapters, qualification evidence, immutable receipts, and allowlisted audit events; deterministic OpenAPI 3.1.1 and discovery previews are generated without claiming live products; hash-bound maximum-charge quotes can produce explicitly non-payable mock x402 v2 challenges; a deterministic mock commerce kernel proves one execution, one balanced charge, replay, quarantine, and evidence-bound reconciliation; vendor-neutral observability contracts provide redacted logs/spans, bounded-cardinality metrics, and deterministic delivery-neutral alerts; deterministic health-aware routing enforces qualification, dependency, deadline, circuit, cost, and request-budget gates before selecting a provider; and the first advanced-search contract slice canonicalizes HTTP(S) URLs, removes exact canonical-URL duplicates, exposes deterministic freshness/authority/relevance/diversity score components, and accepts citations only when their URL and exact text offsets match retained evidence.

The selected foundation is TypeScript on Node.js 24 LTS, PostgreSQL 18, and pg-boss 12 backed by the same PostgreSQL cluster. npm manages the JavaScript workspace. `packages/contracts` publishes the repository-local source of truth for operation, catalog, adapter, qualification, receipt, audit, discovery, quote, mock challenge, ledger, replay, reconciliation, observability, alerts, routing, budgets, circuits, and deterministic search-result integrity. `generated/public` contains reviewable OpenAPI, discovery, `llms.txt`, and schema artifacts marked `contract_preview`. Search retrieval/extraction adapters, near-duplicate content detection, synthesis, SSRF/browser isolation, benchmarks, free/paid HTTP paths, database persistence, durable budget/circuit state, live health probes, real payment verification/authorization/settlement, telemetry export, alert delivery, and live deployment remain intentionally unimplemented.

## Authority

The controlling plan is:

`/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md`

The absolute path above is documentation for operators, not a runtime dependency. Product code must not import, mount, execute, or otherwise depend on the legacy `/workspace/x402-platform` repository or its state.

## Repository boundary

- This directory is its own Git repository.
- Legacy code, databases, queues, catalogs, ledgers, generated artifacts, and deployment state are evidence only.
- No symlink, submodule, gitlink, local package dependency, or runtime path may escape this repository.
- Small concepts may be reimplemented later only when an authorized ticket explicitly permits it.

## Validation

Run:

```sh
npm test
npm run staging:smoke
```

The commands use local POSIX tools, Git, and Node.js. Acceptance performs no external network access, provider calls, cloud changes, or payments; staging smoke uses loopback HTTP only. The checks do not connect to PostgreSQL, start pg-boss, or prove remote GitHub Actions/environment protection or live hosting.
