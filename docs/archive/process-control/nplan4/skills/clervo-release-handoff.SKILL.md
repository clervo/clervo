---
name: clervo-release-handoff
description: Verify and record a truthful Clervo ticket, maintenance phase, release-candidate, deployment, or blocked handoff. Use when finishing work, preparing a commit, updating the build journal or active state, reporting lifecycle truth, proposing the next ticket, or enforcing the stop boundary.
---

# Clervo Release Handoff

## Reconcile completion

1. Invoke `$clervo-engineering-stage` and restate the exact authorized scope and stop condition.
2. Compare the diff, tests, deployed behavior, prices, receipts, costs, raw evidence, and cleanup state with the ticket acceptance contract.
3. Preserve failures and degraded evidence. Never promote repository-only, preview, controlled, failed, or unavailable behavior to a stronger lifecycle state.

## Validate and record

Run every authorized focused, failure, lint, typecheck, contract, security, secret, boundary, diff-integrity, deployment, cost, and cleanup check. Do not rerun protected evidence. Append one journal entry containing:

- classification and scope;
- files changed;
- exact commands and results;
- deployment and external effects;
- costs, provider calls, payments, and USDC spend;
- cleanup and residual exposure;
- claims still unknown or false;
- commit identity;
- exact next proposed task and its authorization state.

Commit only the authorized work. Confirm the committed tree is clean and evidence matches the commit. Report the result and stop. A proposed next ticket is not authority; never begin it automatically.
