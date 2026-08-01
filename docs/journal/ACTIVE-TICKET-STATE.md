# Active ticket state

**Ticket:** N4.27S — Frozen-repair staging qualification and remaining
non-payment Stage 4 proof
**Stage:** 4 — Search vertical slice
**Ticket result:** completed with failed final staging qualification
**Stage result:** blocked with five truthful Stage 4 blockers remaining

## Decision

- N4.27 and N4.27R sealed artifacts were hash-verified and never rerun or
  modified.
- A separate 55-task N4.27S corpus was labelled and validated before final
  qualification, with 11 tasks in each family and exactly one final run.
- Implementation and evaluator were frozen before the final run. No post-run
  tuning occurred.
- Combined staging quality failed mandatory gates: recall 0.8000, precision
  0.6803, citation validity 1.0000, nDCG@10 0.8048, MRR@10 0.8000,
  success@3 0.8182, extraction 0.8727 and p95 1465.432 ms.
- Browser qualification failed at 4/20 startups and 0/8 hostile runs. All 20
  teardowns were clean; final retained-state and orphan counts were zero.

## Sources, cache and operations

- Aggregate live federation passed its gates at 0.8400 recall, 0.6623
  precision and 2021.578 ms p95, with relevant evidence on 84% of focused
  misses and 41.10% largest-source share.
- Five source classes contributed relevant evidence. Developer registry
  contributed zero, so the every-source qualification failed.
- Connected cache miss/fresh/stale/revalidation, route isolation, integrity,
  eviction/removal/denylist, freshness fields and honest failure passed.
- Locale propagation, Wikimedia language honoring and explicit unsupported
  disclosures passed.
- Route/source concurrency, quotas, circuit open/half-open restoration,
  timeout storm, all-routes-down, traffic stop/restoration and unbounded-cost
  stop passed.
- Direct/redirect/address SSRF, DNS rebinding, robots, MIME, decompression,
  output and gateway containment passed. Live prompt-injection proof did not.

## Cost and cleanup

- Estimated gross ticket and owner cash upper bound: USD 0.35, below USD 12.
- Third-party general-Web provider cost: USD 0.000000.
- Mock/real x402 did not run; USDC spend was zero and reserved 0.03 USDC was
  untouched.
- A rejected one-node GKE cluster overlapped its replacement VM for about 15
  minutes, producing estimated configured exposure USD 5.69248/day over the
  USD 5 ceiling. This is recorded as a control failure.
- VM, disks, cluster, network, subnet, router/NAT, firewall, service account,
  IAM binding, Artifact Registry images/repository, budget and exact Cloud
  Build source objects were deleted. Active incremental exposure is USD 0/day.

## Current Stage 4 blockers

Five N4.27S-proven checks closed: `retrieval_safety_controls`,
`disclosed_cache_freshness`, `language_and_region_options`,
`ssrf_and_security_suite`, and `blockrun_compatible_baseline_improvement`.

The exact remaining blockers are:

1. `isolated_javascript_retrieval`
2. `prompt_injection_boundaries`
3. `separate_raw_and_synthesis_prices`
4. `deployed_paid_route`
5. `cost_caps`

Stage 4 remains blocked. Search is not commercially competitive, production-
qualified, Exa-parity, best-Web-search or the reference pattern. N4.28 and
Stage 5 remain unauthorized.

## Exact next action

Proposed ticket **N4.27T — Frozen-result failure remediation for developer
retrieval, browser/hostile reliability and cost-ceiling compliance**, under
separate authority only. Treat the N4.27S final corpus as read-only and use a
new pre-split corpus and new isolated deployment. Keep mock x402, real payment,
N4.28 and Stage 5 out of scope.

## Stop condition

Commit N4.27S atomically and stop. Do not begin N4.27T, N4.28, mock x402,
payment, Stage 5, website/DNS work, production release, AI, Sandbox, legacy
mutation or any expansion stage.
