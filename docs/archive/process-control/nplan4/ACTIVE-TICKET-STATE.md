# Active ticket state

**Completed ticket:** N5.2 — Live Intelligence evidence comparison and change detection

**Ticket result:** verified repository-local; Stage 5 remains in progress

## Proven result

Versioned Search snapshots with identical query, language, and region now compare
deterministically by canonical URL. The report distinguishes added, removed,
modified, and unchanged evidence; names exact material fields; binds snapshot,
query, event, and report identities with JCS/SHA-256; and rejects invalid
chronology, canonicalization, duplicates, citations, or tampering.

The internal registry now contains `search.compare`. Its input and output
schemas are internal control contracts and do not change the 14-schema public
preview projection. Search remains `preview`; the other five pillars remain
`unavailable`; the registry remains unfrozen.

## Cost, external effects and secrets

- Repository-local implementation and validation only.
- Provider API cash USD 0, infrastructure USD 0, USDC 0, residual exposure USD 0/day.
- No credential, cloud, production, benchmark, payment, wallet, customer,
  monitoring delivery, public-site, SDK, MCP, final-discovery, or legacy action ran.

## Exact next dispatch

N5.3 — Live Intelligence monitor definitions, schedule/state invariants, and
durable snapshot lineage — is ready for a fresh repository-local dispatch cycle
under NPLAN.4 and Stage Campaign Mode. It may compose the N5.2 comparator with
the proven Search contracts, but may not execute providers, external schedules,
notifications, alerts, cloud, production, payments, benchmarks, shared public
site, SDK, MCP, or final discovery.
