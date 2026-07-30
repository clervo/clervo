# ADR-0007: Hash-bound quotes and non-payable mock x402 challenges

- **Status:** accepted
- **Date:** 2026-07-30
- **Ticket:** N2.1

## Context

Commerce needs a visible, versioned maximum charge and an expiring authorization boundary before any payment, execution, ledger, or settlement implementation. A mock 402 response is useful for contract testing, but must not be mistaken for a payable address, accepted signature, verified authorization, facilitator integration, or settlement capability.

## Decision

1. Define a strict quote containing the operation/product/request binding, price version, maximum charge, issue/expiry timestamps, and a deterministic SHA-256 canonical JSON hash.
2. A quote is invalid when its hash changes or expiry is not after issuance. Challenge creation rejects expired quotes and a timeout extending beyond quote expiry.
3. Model the initial challenge with x402 protocol version 2 and the HTTP transport's canonical `402 Payment Required` plus base64 `PAYMENT-REQUIRED` header.
4. Use the x402 `exact` requirement for the already fixed maximum charge. A Clervo extension binds the quote ID/hash, request hash, price version, and expiry.
5. The only accepted N2.1 network/payee values are explicit `mock:*` identifiers. The challenge declares `mock: true`, `payable: false`, and false flags for payment-signature acceptance, verification, facilitator configuration, authorization, settlement, and execution.
6. N2.1 constructs contracts only. It provides no HTTP listener, payment payload parser, wallet, facilitator client, ledger, provider execution, or settlement path.

## Evidence reviewed

Freshness date: 2026-07-30.

- The official repository has moved to `x402-foundation/x402`; the former Coinbase repository is a development fork.
- x402 protocol v2 separates core types from transports and schemes. Its HTTP v2 transport uses status 402 and a base64-encoded `PaymentRequired` object in `PAYMENT-REQUIRED`.
- `PAYMENT-SIGNATURE` submission, verification, work execution, and `PAYMENT-RESPONSE` settlement reporting are later distinct steps and are not implemented here.
- No x402 SDK or other dependency is required to construct and test the wire contract.

## Consequences

- N2.2 can persist the immutable quote/hash and add mock ledger, settlement, replay, and reconciliation behavior without changing the maximum-charge boundary.
- This contract is deliberately incompatible with real payment because its payee is `mock:*` and its capability flags fail closed.
- Product-specific pricing calculation, conventional billing, real networks/assets/payees, signature validation, facilitator selection, and live HTTP behavior remain unverified.