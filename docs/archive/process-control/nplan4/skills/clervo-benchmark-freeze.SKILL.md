---
name: clervo-benchmark-freeze
description: Create, hash, split, freeze, execute, and preserve independent Clervo benchmark and qualification evidence without leakage or post-result tuning. Use for an explicitly authorized corpus, evaluator, holdout, sealed run, once-only qualification, benchmark repair, or evidence-integrity review.
---

# Clervo Benchmark Freeze

## Preflight the evidence boundary

1. Invoke `$clervo-engineering-stage` and identify the exact benchmark authority.
2. Classify every existing corpus, label set, evaluator, implementation manifest, run, score, and artifact as mutable development evidence or protected frozen evidence.
3. Never modify, rerun, tune against, relabel, or reuse sealed, frozen, final, or once-only material without explicit authority for a new independent procedure.

## Freeze before observation

1. Define the question, population, sampling method, task families, metrics, gates, environment, cost ceiling, failure handling, and maximum executions before implementation sees final labels.
2. Split development and independent validation material before repair. Prevent path, domain, query, label, and fixture leakage.
3. Canonicalize and hash corpora, labels, evaluator code, configuration, implementation inputs, and environment identity.
4. Validate schema, counts, uniqueness, coverage, leakage checks, and hashes before declaring the freeze.

## Execute and preserve truth

Run the final procedure exactly as authorized. Preserve raw output, stderr, exit status, timing, environment identity, network/provider effects, costs, and every degraded or failed result. Compute scores from immutable raw evidence. Do not tune or rerun after observing final results.

Append hashes, commands, results, failures, claims still false, and the exact next proposed ticket to the build journal. Commit evidence and stop at the authorized run boundary.
