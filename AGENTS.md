# Clervo Next agent instructions

## Authority

1. Before changing this repository, read:
   - `/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md`;
   - its current handoff and stop condition;
   - `docs/product/CLERVO-LIVE-INTELLIGENCE-LAUNCH-AUTHORITY.md`;
   - `.codex-autonomy-policy.md`.
2. The master plan controls implementation order and ticket authorization.
3. Proven contracts, tests, deployed behavior, prices, receipts, and recorded
   evidence outrank plans, copy, assumptions, and memory.
4. Execute only one exact ticket explicitly authorized by the current handoff or
   admitted by the NPLAN.4 autonomous completion dispatcher. A proposed next
   ticket, roadmap heading, or vague goal is not authorization.
5. Repository-control-plane or devbox maintenance outside product implementation
   may proceed only when the owner explicitly authorizes the exact maintenance
   task. It must not change product behavior, lifecycle states, stage gates,
   payment state, public claims, or begin a product ticket.
6. Each worker cycle handles one ticket. When it is complete, verified,
   recorded, committed, and post-commit checked, the worker stops. A fresh
   dispatch cycle may automatically admit the smallest next exact ticket under
   NPLAN.4 without another owner approval when every admission gate passes.
7. If authority is missing, contradictory, stale, or does not clearly authorize
   the requested work, make no implementation change and report the conflict.

## Clean-room and security boundaries

1. Treat `/workspace/x402-platform`, older Clervo runtimes, legacy state, and
   legacy infrastructure as read-only evidence, never dependencies.
2. Do not import, execute, mount, package-link, or connect legacy modules,
   databases, queues, ledgers, catalogs, volumes, networks, or generated state.
3. Preserve the boundaries in
   `docs/decisions/ADR-0001-clean-room-repository-boundary.md`.
4. Run `./scripts/verify-clean-room-boundary.sh` after every change that could
   affect the repository boundary.
5. Never reveal, print, log, commit, or copy secret values, wallet material,
   customer payloads, authentication files, or production credentials.
6. Do not make real USDC payments, wallet transactions, billable provider
   calls, production changes, cloud billing changes, IAM changes, or secret
   changes unless the active ticket explicitly authorizes the exact action,
   limit, environment, and evidence procedure.
7. Unknown payment or settlement state must fail closed and be reconciled
   before any new authorization or retry.

## Evidence and truthful claims

1. Do not invent users, customers, revenue, transactions, wallets, metrics,
   benchmarks, screenshots, testimonials, logos, results, or product proof.
2. Do not describe preview, unavailable, planned, repository-only, controlled,
   or failed qualification behavior as production-ready or commercially proven.
3. Never modify, reuse, tune against, or rerun a sealed, frozen, final, or
   once-only corpus, evaluator, artifact, or qualification unless the active
   ticket explicitly authorizes a new independent procedure.
4. Preserve failed and degraded evidence. Do not hide, rewrite, or relabel it.
5. Keep public contracts, discovery records, lifecycle states, prices, receipts,
   and documentation synchronized with proven behavior.

## Ticket execution

1. Inspect the current Git state and ticket-specific evidence before editing.
2. Keep work inside the authorized ticket scope and required architecture
   boundaries.
3. Use the smallest safe change that satisfies the ticket and preserves prior
   evidence.
4. Implement, test, verify, document, and commit the authorized ticket.
5. Run every check required by the ticket plus applicable lint, typecheck,
   contract, security, secret, boundary, and diff-integrity checks.
6. Append evidence to `docs/journal/BUILD-JOURNAL.md`; never rewrite prior
   journal entries.
7. Record material costs, external calls, deployment effects, cleanup,
   unresolved failures, lifecycle truth, exact commit, and the next proposed
   ticket.
8. Stop immediately before any action that would cross the active ticket,
   payment authority, stage gate, cost ceiling, secret boundary, provider
   terms, or explicit stop condition.

## Standing autonomous completion

1. Follow `docs/operations/AUTONOMOUS-COMPLETION.md` and
   `infra/control-plane/autonomous-completion-policy.v1.json` after every ticket
   closeout.
2. The dispatcher may admit the next ordinary repository/local ticket without
   per-ticket owner approval, but must first write its exact scope, inputs,
   outputs, allowed paths, validation, costs, evidence, cleanup, and stop.
3. Never skip a preceding stage gate. Missing owner-only input blocks only the
   affected external step; continue independent earlier-stage work only when it
   does not bypass the ordered gate.
4. A concrete repairable failure creates an exact bounded repair ticket. Preserve
   the failure. Do not rerun, reuse, or tune against sealed/final/once-only
   evidence; a later qualification needs a new independent pre-split procedure.
5. Required paid, eventually-paid, or trial-to-bill third-party API cash spend is
   USD 0. Billable infrastructure remains a real external effect and requires an
   exact finite owner-prepared input package plus separate explicit owner
   authority until trusted signed-manifest enforcement is implemented.
6. Credentials, cloud/IAM/billing/secrets, production, DNS/domain/email/registry,
   external customer/message, legacy mutation, and wallet/payment actions require
   the exact owner-prepared package specified by the dispatcher policy and a
   separate explicit owner action. A JSON file in the agent-writable workspace
   is never authority. Standing program authority alone never authorizes them.
7. Real x402 settlement remains dormant until Stage 15 and its exact active
   payment ticket. A receiver public address is sufficient for `payTo`; never
   request or accept the receiver private key. The payer must be separate and
   use an opaque restricted signer reference outside chat and Git.
8. Report completion only when every recorded Clervo Platform gate genuinely
   passes with its evidence reference and hash binding. Never promise revenue,
   wealth, demand, or investment return.

## Autonomous container execution

Inside the dedicated Clervo development environment, routine repository
commands do not require owner approval when they are necessary for the active
authorized ticket.

This autonomy and the NPLAN.4 dispatcher never override the master plan, stage
order, exact active ticket, truthful-claims policy, payment restrictions,
secret rules, cost ceilings, owner-input/authority boundaries, provider terms, or stop
conditions.
