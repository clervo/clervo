# Production incident response

The API exports bounded snapshots once per minute. Delivery uses HTTPS, denies
redirects, caps payloads at 256 KiB, times out after five seconds, and binds
retries to a deterministic `Idempotency-Key`. Snapshots contain fixed product
and outcome dimensions; they exclude queries, request bodies, request hashes,
wallets, credentials, and customer identifiers.

Production startup fails if no monitoring endpoint is configured. Authorization
is supplied only through the runtime secret environment and is never logged or
stored in evidence.

## Response actions

- `search.execution_failure`: stop affected search traffic if failures repeat,
  preserve the operation ID only in restricted operational state, inspect the
  provider/circuit state, and restore with one bounded probe.
- readiness unavailable: keep the revision out of traffic, verify PostgreSQL
  reachability and migrations, and do not fall back to memory state.
- overload: preserve the execution ceiling, verify quota and database latency,
  and scale only within the approved cost ceiling.
- unknown settlement: keep the idempotency key quarantined and reconcile before
  any retry or new authorization.
- alert delivery failure: customer behavior remains isolated, but the release
  is not operationally ready until a receiver acknowledges a fresh synthetic
  alert.

Traffic restoration requires a healthy readiness probe and one useful,
non-payable smoke request. Rollback uses the preceding verified immutable image;
the kill switch must remain available independently of provider health.
