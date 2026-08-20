# ADR-0005: Catalog, adapters, receipts, and audit

- Status: accepted

The catalog defines stable public product and operation identity independently
from provider routing. Active entries require qualified supply, valid permission
state, explicit bounds, and a charge ceiling. Exact model IDs never silently
substitute another model.

Adapters are isolated behind normalized contracts and return bounded provenance
and safe failures without exposing credentials or supplier internals. Receipts
bind the request, operation, quote, settlement, result, cost, and provenance.
Audit events use allowlisted fields, stable correlation identifiers, redaction,
and hash chaining; arbitrary facts and secret-bearing fields are rejected.
