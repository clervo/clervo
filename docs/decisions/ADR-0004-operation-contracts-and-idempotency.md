# ADR-0004: Operation envelopes, errors, states, and idempotency

- **Status:** accepted
- **Date:** 2026-07-29
- **Ticket:** N1.1

## Context

Every paid Clervo operation needs one versioned external shape and one durable lifecycle before catalog, adapters, quotes, x402, or ledgers are implemented. Retries must never silently create a second execution or charge, and an ambiguous provider or settlement outcome must fail closed.

## Decision

1. **Wire schemas:** publish JSON Schema Draft 2020-12 schemas. Top-level envelopes reject undeclared properties. Contract version `2026-07-29.1` is explicit in requests, results, and durable snapshots.
2. **Success envelope:** successful synchronous delivery returns a `RECEIPTED` operation result with stable operation ID, operation name, replay marker, and typed JSON output. Intermediate lifecycle is represented by the durable operation snapshot rather than by pretending work is complete.
3. **Errors:** return `application/problem+json` in the RFC 9457 shape with stable Clervo problem type URIs and machine code. Details must be safe for callers; provider payloads, credentials, payment proofs, and stack traces are not contract fields.
4. **Lifecycle:** use explicit validation, quote/payment, reservation, execution, verification, settlement, receipt, reconciliation, failure, and unknown-outcome states. `EXECUTION_UNKNOWN` and `SETTLEMENT_UNKNOWN` can transition only to `RECONCILING`. Terminal states have no outgoing transitions.
5. **Idempotency:** all operation-creating requests require a caller-supplied `Idempotency-Key` of 8–128 restricted ASCII token characters. The durable uniqueness boundary is tenant + operation + key. The key is bound to a canonical request hash and retained at least 24 hours; product-specific windows may be longer.
6. **Fingerprint:** hash the RFC 8785/JCS canonical JSON representation of contract version, operation, normalized method, exact request target, normalized content type, and JSON body with SHA-256. Object member order is insignificant; arrays, values, operation, target, and version remain significant.
7. **Replay behavior:** absent key record creates one operation; matching hash returns the existing operation or stored terminal response; mismatching hash returns an idempotency conflict; in-progress work is resumed/observed, never duplicated. Unknown outcomes reconcile before any new execution or authorization.

## Evidence reviewed

Freshness date: 2026-07-29.

- JSON Schema Draft 2020-12 is the current published 2020-12 dialect and Ajv 8 provides a distinct 2020-12 validator class; earlier drafts must not be mixed in that instance.
- RFC 9457 defines Problem Details for HTTP APIs and obsoletes RFC 7807.
- RFC 8785 defines deterministic JSON canonicalization using ECMAScript serialization, recursive object member sorting, and strict Unicode/number constraints.
- The IETF HTTPAPI idempotency-key draft expired on 2026-04-18 and is not an RFC. Its header/key/fingerprint/replay concepts are useful evidence, but Clervo owns and versions this policy rather than claiming standards status.
- Ajv 8.20.0 and ajv-formats 3.0.1 are MIT-licensed development-only validators. Runtime contract logic has no new third-party dependency.

## Consequences

- N1.2 and later APIs inherit stable envelopes and lifecycle vocabulary.
- A database schema and concurrency-safe insert/update transaction are still required before idempotency is operational.
- Canonicalization supports JSON request bodies only in this ticket. Streaming/binary operation fingerprints need a later media-specific rule.
- A `RECEIPTED` response proves lifecycle completion under later commerce contracts; N1.1 performs no provider execution or payment.