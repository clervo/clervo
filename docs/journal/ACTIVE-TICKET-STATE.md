# Active ticket state

**Ticket:** N4.26 — live staging quality, monitoring, budgets, and traffic stops
**Stage:** 4 — Search vertical slice
**Result:** complete with ten truthful Stage 4 blockers remaining

## Decision

- The two real route identities operated in isolated private staging.
- The 50-task/five-family benchmark produced 182 raw executions.
- Clervo is `not_yet_commercially_competitive`; “Advanced live intelligence
  for agents” is not authorized. “Clervo-owned live Web retrieval” remains the
  maximum truthful positioning.
- Eleven of the 21 starting blockers closed on hash-bound staging evidence;
  ten remain. Search is not the reference pattern and Stage 5 is unauthorized.
- Payment remained mock-only and non-payable. Third-party general-Web
  production provider cost is USD `0.000000`; 0 USDC was spent.

## Live proof and cleanup

- Deployed digest-pinned Search, Meilisearch and retrieval-gateway workloads in
  the private `clervo-n426` GKE namespace with default-deny policies, fixed
  quota, persistent storage, USD 10 budget and USD 5/day ceiling.
- Delivered the primary `mo@clervo.dev` verification route, observed nonzero
  critical-event metric points, and bound the enabled alert policy. No
  qualified Telegram route existed.
- Browser attempt one was quota-denied and attempt two expired during image
  pull; no worker/runtime attestation is claimed.
- Deleted the exact N4.26 cluster and data disk after capture. Active compute
  exposure is USD 0/day; retained artifact/logging storage upper bound is USD
  0.01/day.

## Current Stage 4 blockers

1. `isolated_javascript_retrieval`
2. `retrieval_safety_controls`
3. `prompt_injection_boundaries`
4. `disclosed_cache_freshness`
5. `language_and_region_options`
6. `separate_raw_and_synthesis_prices`
7. `ssrf_and_security_suite`
8. `blockrun_compatible_baseline_improvement`
9. `deployed_paid_route`
10. `cost_caps`

Exact reasons and bound artifact hashes are in
`docs/evidence/n4.26/stage4-binding.v1.json` and the N4.26 evidence report.

## Exact next action

N4.27 only, after separate payment authority defines the allowed mock/testnet
facilitator, payee/payer, settlement, receipt and replay scope. Preserve all ten
remaining blockers unless new evidence closes them. Do not spend USDC or make
any route payable without explicit authority.

## Stop condition

Commit N4.26 atomically and stop. Do not begin N4.27, N4.28, Stage 5, AI,
Sandbox, production release, real settlement, USDC spending, or legacy
migration in this run. Canonical `npm test` remains reserved for N4.28.
