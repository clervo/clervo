# Active ticket state

**Ticket:** N4.23A — Zero-provider-cost supply amendment and bounded tool benchmark
**Stage:** 4 — Search vertical slice remediation
**One question:** Which smallest Clervo-controlled crawler, JavaScript fallback, and open-core index configuration can replace every required paid general-Web search API dependency without weakening Stage 4?
**Result:** complete; atomic commit pending

## Authoritative inputs

- `/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md`
- `AGENTS.md`, `.codex-autonomy-policy.md`, and the owner-authorized zero-provider-cost campaign
- N4.22 blocker matrix, N4.23 owner-action package, and completed N4.19–N4.21 evidence
- Clean starting commit `9c792ec`; preserved untracked N4.23A benchmark work after container recreation

## Decision

- Provider API cost for both required search paths is exactly zero; paid/eventually-paid hosted search APIs are prohibited core dependencies.
- Select Scrapling `0.4.12` as the default non-stealth HTTP/frontier worker.
- Select Crawl4AI `0.9.2` with Playwright `1.61.0` only as an internal JavaScript fallback, provisional until N4.25 isolation.
- Select Meilisearch `1.51.0` community features as the first persisted index; Clervo owns ranking.
- Preserve exact future route identities `clervo.focused-index.v1` and `clervo.live-federation.v1` with independent discovery, index, health, and failure-domain state.
- Public Nominatim is excluded; Common Crawl metadata is discovery-only and archived bodies stay development-only/out of paid results.

## Evidence and validation

- Bounded benchmark passed over static/JS commerce, real estate, docs, news, sitemap, RSS, redirect, robots denial, oversize, unsupported MIME, and private/metadata targets.
- Loopback-only benchmark: six Scrapling markers, one Crawl4AI rendered marker with destroyed state, four Meilisearch documents with the required top hit, and strict Clervo boundary failures.
- Focused N4.23A tests: 7/7 passed.
- Contract validation: 38 schemas / 71 fixtures passed.
- External benchmark calls: 0; credentials/secrets: none; cloud/deployment/payment mutation: none; USDC: 0.
- Stage 4 remains blocked on 21 source-bound checks; no `stagingVerified` field changed.

## Files changed

- N4.23A contract, schema, fixtures, focused tests, package/acceptance wiring, bounded benchmark harness/corpus, and machine-readable evidence.
- N4.23A ticket/evidence, historical N4.23 owner-package amendment, README, active state, append-only journal, generated discovery, and writable external master-plan handoff.

## Exact next action

- N4.23B only: implement the bounded focused owned-index route using the selected pins and safety boundary, then commit and stop. Do not begin N4.24 or a later stage.

## Out of scope / parking lot

- Live federation/product pipeline (N4.24), production browser/cache/security (N4.25), live quality/monitoring/cost caps (N4.26), staging commerce (N4.27), final exit (N4.28), AI/Sandbox/expansion implementation, real USDC, production deployment, IAM/billing change, and any secret/legacy dependency.

## Stop condition

- Commit N4.23A as one atomic ticket and stop per `AGENTS.md`. N4.23B is not started in this ticket.
