# Active ticket state

**Ticket:** N4.27R — Search generalization, live-route and browser reliability repair
**Stage:** 4 — Search vertical slice
**Ticket result:** completed at controlled repair-entry level
**Stage result:** blocked with ten truthful Stage 4 blockers remaining

## Decision

- The original frozen N4.27 holdout still has run count one. It was not rerun,
  changed, relabelled or used as a tuning target.
- A separate 75-task N4.27R corpus was split and hashed before implementation:
  50 development tasks and 25 once-only sealed-validation tasks, 15 per family.
- The implementation was frozen across 17 files. The sealed validation executed
  exactly once and passed the N4.27R repair-entry quality gates.
- Controlled local browser/security qualification passed 20/20 real Chromium
  startups and clean teardowns, zero orphans/retained state, 20 JavaScript
  fixtures, 910.016 ms p95, all required denial classes and eight hostile pages.
- This does not qualify production staging, commercial competitiveness, Exa
  parity, advanced live intelligence, the reference pattern, N4.28 or Stage 5.

## Scores and implementation

- Development combined: recall 1.0000, precision 1.0000, citation validity
  1.0000, nDCG@10 1.0000, MRR@10 1.0000, success@3 1.0000, p95 8.327 ms.
- Sealed combined: recall 1.0000, precision 1.0000, citation validity 1.0000,
  nDCG@10 1.0000, MRR@10 1.0000, success@3 1.0000, p95 3.216 ms.
- Sealed combined retrieval quality was 1.0000 versus simple combination
  0.6936. This is controlled repair evidence, not a market comparison.
- Candidate flow now exposes lexical, RRF (`k=60`), authority, freshness,
  diversity and final disposition. Hyphenated identifiers stay intact, weak
  matches are filtered before reranking, and empty valid searches no longer
  poison source or aggregate circuits.
- Controlled live recall/precision were 0.4444/1.0000; live contributed on
  15/15 development focused misses and the largest source share was 0.20.

## Root causes preserved

- Forty-eight original balanced tasks failed: 30 missing target sources, 11
  disconnected fixtures, four answerable zero-candidate tasks and three
  false-positive no-result tasks. Two correct no-result tasks produced the old
  reported 0.04; answerable recall and precision were actually both zero.
- Proven evaluator defects: no-result metric conflation, no-result rank penalty,
  baseline/citation quality conflation and undefined-locale auto-pass.
- URL-prefix and required-term predicates were rejected as collapse causes
  because no labelled URL reached either predicate.
- Empty discovery incorrectly opened the live circuit, creating 32 circuit-open
  attempts; abandoned deadline work contributed to later latency inflation.

## Cost, commerce and cleanup

- N4.27R created no cloud resource. Read-only name-filter revalidation found no
  isolated N4.27 compute, disk, network, router, firewall, Cloud Run or artifact
  resource. Active incremental compute and retained idle exposure remain USD
  0/day.
- Third-party general-Web production provider cost is USD `0.000000`.
- Mock x402 and real payment did not run. No USDC was spent; reserved 0.03 USDC
  remains untouched.

## Current Stage 4 blockers

The authoritative count is unchanged because N4.27R was controlled local repair
proof and the Stage 4 verifier was not run:

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

## Exact next action

Proposed ticket N4.27S only, under separate authority: deploy the exact frozen
N4.27R repair to isolated staging without rerunning either sealed set, then
prove production-eligible source connections, connected cache, upstream locale,
browser/security containment and cost meters. Keep mock x402, real payment,
N4.28 and Stage 5 out of scope.

## Stop condition

Commit N4.27R atomically and stop. Do not begin N4.27S, N4.28, mock x402,
Stage 5, website/DNS work, production release, real settlement, AI, Sandbox,
legacy mutation or any expansion stage. Canonical `npm test` and the Stage 4
verifier did not run.
