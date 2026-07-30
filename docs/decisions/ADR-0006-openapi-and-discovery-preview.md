# ADR-0006: Generated OpenAPI and truthful discovery preview

- **Status:** accepted
- **Date:** 2026-07-30
- **Ticket:** N1.3

## Context

Clervo needs machine-readable contracts before HTTP, commerce, provider, or deployment implementation begins. Publishing invented endpoints, products, servers, x402 requirements, or availability would turn design intent into a false production claim. The existing nine Draft 2020-12 JSON Schemas are the only verified public contract material.

## Decision

1. Generate OpenAPI **3.1.1** from the repository schemas and declare the Draft 2020-12 JSON Schema dialect.
2. Publish an empty `paths` object and omit `servers`, security schemes, and x402 response claims until their implementation tickets pass. The OpenAPI document is a contract preview, not an API availability claim.
3. Generate a Clervo-owned `/.well-known/clervo.json` discovery document with explicit `contract_preview`, `callable: false`, empty products, unimplemented payment, unverified settlement, and unverified deployment states.
4. Generate `/llms.txt` using the current informal proposal structure: one H1, a blockquote summary, concise status, required links, and an optional future-material section. It must call itself a preview and must not claim a live service.
5. Copy all source schemas into the generated public tree and embed the same parsed schemas in OpenAPI. Generation is deterministic and fails closed if preview artifacts claim callable products, payment readiness, settlement proof, deployment proof, or non-empty paths/products.
6. Commit generated artifacts as reviewable release inputs. A later runtime ticket may serve them, but this ticket does not create an HTTP handler or deploy them.

## Evidence reviewed

Freshness date: 2026-07-30.

- OpenAPI Specification 3.1.1 is the current stable 3.1 document reviewed for root fields, paths, components, references, and JSON Schema dialect behavior.
- OpenAPI 3.1 supports JSON Schema Draft 2020-12 vocabulary; embedding the existing schemas avoids a second hand-maintained contract source.
- `llms.txt` is an informal proposal, not an IETF or OpenAPI standard. Its proposed Markdown structure is used only as a readable discovery index.
- No official x402 discovery surface is published because N2.1/N2.2 have not implemented a payment challenge, verification, settlement, or receipts over HTTP.
- No new third-party dependency was required.

## Consequences

- Agents and reviewers can inspect exact contracts without being told that unavailable products are callable.
- OpenAPI client generation is intentionally not useful yet because there are no truthful HTTP operations. Paths will be added alongside implemented handlers.
- The public origin in artifact links is an intended canonical location, not proof that the files are deployed there.
- Catalog products, per-product schemas, x402 discovery, examples, security declarations, SDK generation, and runtime serving remain later ticket work.