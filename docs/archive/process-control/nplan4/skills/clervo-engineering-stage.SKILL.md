---
name: clervo-engineering-stage
description: Classify Clervo authority and enforce exact-ticket or exact-maintenance execution before repository work. Use for Clervo product engineering, control-plane maintenance, implementation requests, reviews, diagnoses, stage transitions, ticket continuation, verification, evidence recording, commits, or any request whose authority or stop boundary must be established.
---

# Clervo Engineering Stage

## Run the authority preflight

Perform this preflight before product engineering or any repository mutation:

1. Read `/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md` completely, including its current handoff, exact next task, authorization state, and stop condition.
2. Read the applicable repository `AGENTS.md`, `/workspace/clervo-next/.codex-autonomy-policy.md`, and `/workspace/clervo-next/docs/product/CLERVO-LIVE-INTELLIGENCE-LAUNCH-AUTHORITY.md`.
3. Inspect Git status and the evidence relevant to the requested task. Preserve unexplained work.
4. Treat proven contracts, tests, deployed behavior, prices, receipts, and recorded evidence as stronger than plans, copy, assumptions, or memory.
5. Compare the owner's current request with the handoff and all active boundaries. Never infer authority from a proposed next ticket, roadmap position, named stage, available credential, existing infrastructure, or this skill.

Never grant, expand, or manufacture authorization. Only classify authority supplied by the owner and controlling documents.

## Classify the request

Choose exactly one classification before acting:

- **Authorized product work:** Require an exact ticket explicitly authorized for execution, consistent scope and stop conditions, and clear permission for every material external effect. Execute only that ticket.
- **Authorized control-plane maintenance:** Require the owner to authorize the exact repository-control-plane or devbox maintenance task. Keep product behavior, lifecycle states, stage gates, payment state, public claims, and unauthorized tickets unchanged.
- **Read-only analysis:** Inspect, diagnose, explain, or review without repository edits, external mutations, billable calls, or authorization claims. A read-only request does not authorize a fix.
- **Blocked or ambiguous:** Use when authority is missing, contradictory, stale, only proposed, broader than the handoff, or insufficient for a required action. Stop without editing or causing external effects and report the precise conflict.

Treat every proposed ticket as unauthorized until the owner explicitly authorizes that exact ticket. Do not interpret “next,” “continue,” a queue position, or a completed predecessor as authorization.

## Preserve evidence and boundaries

- Never modify, reuse for tuning, or rerun a frozen, sealed, final, once-only, or otherwise protected corpus, evaluator, artifact, or qualification unless exact authority establishes a new independent procedure.
- Preserve failed and degraded evidence. Never hide, rewrite, relabel, or promote it.
- Keep every legacy Clervo repository, runtime, state store, and infrastructure asset read-only and outside the clean-room dependency boundary.
- Never reveal, print, log, copy, or commit secrets, wallet material, customer payloads, authentication files, or production credentials.
- Identify before action every cost ceiling, external network effect, cloud resource or IAM change, provider call, production effect, payment or settlement transition, wallet action, and USDC limit. If exact authority, environment, limit, and evidence procedure are absent, do not perform the action.
- Fail closed on unknown payment or settlement state and reconcile it before any new authorization or retry.
- Identify all required focused tests, failure tests, lint, typecheck, contract, security, secret, clean-room, diff-integrity, deployment, cost, and acceptance checks. Do not rerun a protected once-only verifier without exact authority.
- Identify the required journal evidence, commit boundary, final report, proposed next task, and stop condition before editing.

## Execute the exact scope

For authorized product work:

1. Restate the exact ticket, allowed files and effects, prohibited work, verification plan, evidence outputs, cost/network/payment limits, and stop condition.
2. Make the smallest safe change that completes only the authorized ticket.
3. Run every ticket-required and applicable repository check without crossing a frozen-evidence, provider, cost, network, cloud, payment, USDC, or stage boundary.
4. Append accurate evidence to `docs/journal/BUILD-JOURNAL.md`; never rewrite history.
5. Record files changed, exact results and failures, external calls, material costs, deployment and cleanup effects, lifecycle truth, commit, and the next proposed ticket.
6. Commit the verified ticket, report the result, and stop. Never begin the next ticket or later stage automatically.

For authorized control-plane maintenance, follow the same inspect, minimal-change, verification, journal, commit, report, and stop sequence, but do not change product behavior or claim product authority.

For read-only analysis, report findings and the controlling evidence without editing. For blocked or ambiguous work, name the missing or conflicting authority and stop without editing.

Stop immediately before any action that would cross the exact task, stage gate, frozen-evidence rule, cost ceiling, external-network permission, provider terms, cloud boundary, secret boundary, payment authority, USDC limit, verification constraint, commit boundary, or explicit stop condition.
