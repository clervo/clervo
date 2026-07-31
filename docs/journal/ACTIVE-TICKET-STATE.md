# Active ticket state

**Ticket:** N4.25 — Browser retrieval, durable cache, and complete search security boundary
**Stage:** 4 — Search vertical slice remediation
**One question:** Can Clervo production-harden the internal JavaScript fallback, retrieval/cache behavior, and prompt-injection boundary without exposing a browser surface or claiming isolation that this container cannot prove?
**Result:** complete; repository-verified with browser/runtime and staging proof honestly unavailable

## Decision and implementation

- Added gateway-only, no-ingress Crawl4AI isolation with exact runtime attestation, one-page/process/output/resource ceilings, ephemeral state, deterministic teardown, orphan reaping, and kill switch. Missing proof is `unavailable`.
- Hardened fetch with cancellation, compressed/decompressed limits, robots crawl-delay, shared per-domain concurrency, and retained per-hop DNS/socket/redirect/MIME/byte enforcement.
- Added environment-separated durable filesystem/PostgreSQL cache adapters with URL/route/policy keys, integrity checks, visible freshness, disclosed stale-while-degraded, forced refresh/eviction/removal/denylist invalidation, and no customer/secret/wallet/browser-state fields.
- Bound exact retrieved content/provenance as untrusted evidence with no authority over routes, tools, payments, system policy, citations, or execution.

## Evidence and validation

- Focused N4.25: 13/13 passed; N4.23B regression: 8/8; N4.24 regression: 12/12.
- Contracts: 43 schemas / 81 fixtures; discovery: 43 schemas.
- Typecheck and lint passed (228 source/contract files); full working-tree/history secret scan, clean-room boundary, and diff checks passed.
- Stage 4 verifier ran exactly once: integrity passed, decision `blocked`, 21 blockers, reference pattern false, Stage 5 false, 0 external calls, 0 USDC.
- Canonical `npm test` remains reserved for N4.28 and did not run.
- Docker/Podman, Crawl4AI, Playwright, digest-pinned image/gateway, and staging identity are absent. Worker stays zero-replica/kill-switched and unavailable. No staging evidence was promoted.

## Cost, network, and credentials

- Deterministic injected/loopback fixtures only; 0 external calls; USD 0.000000 third-party search-provider and infrastructure cost; 0 USDC.
- No secret, provider account, cloud/IAM/deployment, wallet/facilitator, payment, legacy runtime, or `/run/secrets/clervo-legacy.env` access.

## Exact next action

- N4.26 only after this commit and explicit continuation: calibrated live staging benchmarks plus monitoring delivery, infrastructure/provider budgets, cost caps, circuits, and traffic-stop drills. Do not begin N4.27, N4.28, Stage 5, or any expansion stage in this run.

## Stage and stop condition

- Stage 4 remains blocked on exactly 21 source-bound checks; reference-pattern and Stage 5 authorization remain false. Commit N4.25 atomically and stop.
