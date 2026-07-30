# ADR-0008: Deterministic mock commerce ledger and fail-closed reconciliation

- **Status:** accepted
- **Date:** 2026-07-30
- **Ticket:** N2.2

## Context

Stage 2 requires proof that a quote-bound mock payment can authorize exactly one execution and exactly one balanced charge, while retries replay stored evidence and unknown settlement outcomes quarantine rather than guess. Real wallets, signatures, facilitators, providers, databases, and HTTP product handlers remain unauthorized.

## Decision

1. Implement a repository-local, dependency-injected mock commerce kernel. It accepts only `mock:*` payment identifiers and assets and verifies exact request, quote, hash, expiry, and maximum-charge equality before execution.
2. Seal mock authorization and settlement evidence with canonical SHA-256 hashes. A settled outcome requires a hashed reference; an unknown outcome must not claim one.
3. Execute the injected mock capability once, then settle once. A definitive settlement creates one two-posting ledger transaction: customer funds debit and merchant receivable credit for the same asset, atomic amount, and decimals.
4. Bind the resulting immutable paid receipt to the request, quote, settlement reference, result hash, supplier cost, and provenance.
5. Use the existing idempotency decision contract. The same key and request replays stored completion or quarantine evidence; a different request conflicts; neither path executes or posts again.
6. Quarantine unknown settlement with no ledger posting or receipt. Only hash-valid, authorization-bound, definitive evidence for the same settlement ID may reconcile it. Reconciliation uses the stored execution evidence and never executes again.
7. Keep the implementation in memory and contract-focused. PostgreSQL migrations, transactional locking, pg-boss workers, HTTP handlers, real x402 payload verification, real settlement, and alert delivery remain later work.

## Consequences

- Stage 2 invariants are executable locally without money or external network access.
- Hashes and immutable object shapes provide tamper evidence but not durable persistence, signatures, trusted timestamps, or crash atomicity.
- The mock kernel is not payment-ready and must not be exposed as a live paid product.
- N3.1 can attach redacted observability and alert contracts to quarantine and reconciliation outcomes before any real commerce integration.