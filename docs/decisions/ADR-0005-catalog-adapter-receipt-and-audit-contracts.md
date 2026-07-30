# ADR-0005: Catalog, adapter, qualification, receipt, and audit contracts

- **Status:** accepted
- **Date:** 2026-07-29
- **Ticket:** N1.2

## Context

Discovery, routing, provider integrations, settlement, and production evidence need one provider-neutral vocabulary before any supplier SDK or commerce implementation is introduced. Catalog activation must fail closed on unqualified or terms-blocked supply; named identities must never be silently substituted; receipts must preserve customer charge, supplier cost, and provenance without retaining payloads or raw payment/provider references; audit events must be useful without becoming a secret or content log.

## Decision

1. **Catalog:** publish strict versioned entries covering product identity, exact-versus-alias substitution policy, capabilities, sync/async delivery, schema links, pricing model, maximum-charge requirement, qualified adapters, terms review, and bounded payload-retention policy. `active` and `degraded` entries require at least one qualified adapter and approved/restricted terms. Non-free products require a maximum charge. Exact identities permit no substitution.
2. **Adapter boundary:** define the stable provider-neutral methods required by the controlling architecture: `capabilities`, `qualify`, `health`, `estimateCost`, `execute`, `normalize`, and `classifyError`. Credentials remain injected implementation details; manifests contain secret variable names only. Supplier execution can report `unknown`, and retry classification must distinguish never-safe, safe-before-consumption, and reconcile-only outcomes.
3. **Qualification:** make provider/product qualification a dated, expiring artifact with terms status, named checks, optional hashed evidence, observed identity/latency/cost, and passed/failed/blocked status. Activation code must not infer qualification merely from adapter availability.
4. **Receipt:** seal a canonical SHA-256 hash over immutable operation, request, quote, funding, customer charge, supplier cost, settlement-reference hash, result hash, adapter qualification, provider-reference hash, completion time, and optional previous receipt hash. Raw payloads, prompts, credentials, authorization proofs, transaction material, and provider responses are excluded.
5. **Audit:** allow only typed scalar facts from a small allowlist, plus operation state and optional W3C-compatible trace/span identifiers. Events are append-orderable and hash-bound to optional predecessor hashes. Arbitrary maps and secret/content field names are rejected rather than recursively copied and redacted after the fact.
6. **Commerce boundary:** N1.2 defines opaque quote and settlement evidence references but no x402 challenge, verifier, facilitator, ledger, signer, wallet, settlement engine, or charge behavior. Those remain N2.1/N2.2.

## Evidence reviewed

Freshness date: 2026-07-29.

- JSON Schema Draft 2020-12 remains the repository wire-schema dialect; Ajv strict mode validates nested conditionals and rejects undeclared fields.
- RFC 3339 timestamps are represented through JSON Schema `date-time`; runtime ordering/expiry comparisons remain implementation work.
- W3C Trace Context defines 16-byte trace IDs and 8-byte parent/span IDs encoded as non-zero lowercase hexadecimal identifiers; trace linkage is optional in audit contracts.
- SPDX license identifiers describe software/content licensing but cannot represent provider resale authorization, usage restrictions, or a dated commercial terms review. Catalog terms therefore use a review status and evidence reference instead of treating SPDX as a resale verdict.
- No new third-party runtime or development dependency was required.

## Consequences

- N1.3 can generate discovery/OpenAPI from explicit catalog and schema artifacts instead of provider SDKs.
- Provider implementations can be removable and tested against one stable interface, but no real adapter exists yet.
- Hashes provide tamper evidence, not signatures, external anchoring, database immutability, or trusted timestamps. Persistence, key management, signature policy, and retention enforcement remain future work.
- Qualification expiry, catalog publication approval, trace propagation, audit sequencing, and receipt storage are contracts only until implemented transactionally.