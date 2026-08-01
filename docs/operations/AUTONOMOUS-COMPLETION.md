# Autonomous completion dispatcher

## Outcome

NPLAN.4 turns the owner's completion mandate into standing authority for a
fail-closed sequence of **exact** tickets. The owner does not have to approve
each ordinary repository ticket. The dispatcher still must write and admit one
bounded ticket before implementation, preserve stage order, verify it, record
evidence, commit it, and end that worker cycle.

The dispatcher is a repository control-plane contract, not a product feature,
background payment bot, cloud administrator, or claim that the platform is
finished. Its machine source is
`infra/control-plane/autonomous-completion-policy.v1.json`; live progress is
recorded once in `infra/control-plane/autonomous-dispatch-state.json` instead of
being independently restated across product, design, JSON, and SEO files.

## Authority hierarchy

In descending order:

1. proven contracts, tests, deployed behavior, prices, receipts, costs, and
   immutable evidence;
2. the clean-room master plan and canonical product authority;
3. the NPLAN.4 standing program and separately explicit owner authority for
   external effects;
4. the active exact ticket and dispatch state; and
5. implementation notes, copy, assumptions, and memory.

NPLAN.4 authorizes the supervisor to select and admit the next exact local
ticket after the prior ticket closes. It does not make a roadmap heading, vague
idea, owner wish, or proposed ticket executable by itself. A prepared workspace
manifest is input, never authority. External effects require a separately
explicit owner action until trusted signed-manifest enforcement exists.

## One-ticket state machine

```text
candidate
  → ready
  → active
  → verifying
  → completed
  → atomic commit
  → post-commit verification
  → worker stop
  → fresh dispatch cycle
```

Terminal branches are:

- `repair_required` for a concrete, bounded, repairable defect;
- `blocked_gate` when a qualification or preceding stage did not pass;
- `blocked_owner` when a genuinely owner-only input or external authority is
  absent; and
- fail-closed quarantine when an external effect has an unknown outcome.

There is one active ticket lease. A fresh cycle must reload the authority,
current handoff, Git state, relevant evidence, and dispatch state. This keeps
the exact ticket stop boundary while removing repetitive owner approvals.

## Admission gate

Before changing product code, the dispatcher must prove all of the following:

1. the preceding ticket is committed and the worktree has no unexplained
   changes;
2. the candidate is the smallest unresolved prerequisite in the current stage;
3. an exact ticket states its question, inputs, allowed paths, outputs,
   validation, external effects, cost limits, evidence, cleanup, and stop;
4. dependencies and every preceding stage gate are satisfied;
5. lifecycle and public claims remain unchanged unless proven evidence supports
   a synchronized transition;
6. final, frozen, sealed, and once-only artifacts are named and protected;
7. provider terms, data rights, privacy, and allowed use are known;
8. mandatory third-party API cash cost is exactly USD 0;
9. billable infrastructure, credentials, production, domain, registry,
   customer, legacy, or payment effects have exact owner-prepared inputs and a
   separate explicit owner action while trusted manifest enforcement is absent;
   and
10. cleanup, rollback, cost stop, and unknown-outcome procedures are executable.

Missing or contradictory facts are not guessed. The candidate becomes
`blocked_owner` or `blocked_gate`, and independent earlier-stage local work may
continue only when it does not skip the blocked gate.

## Automatic repair policy

Expected red/green development and ordinary in-scope fixes remain inside the
active ticket before closeout. A terminal closeout failure, post-commit
regression, or failed qualification opens a new exact repair ticket after the
failure is preserved. A repair may change only the smallest proven cause and
rerun the checks that are safe to rerun.

A failed once-only qualification is different: the ticket closes truthfully as
blocked. The final corpus, evaluator, and result stay immutable. A later repair
uses a new independently pre-split corpus and procedure. It never tunes against
the failed holdout or relabels the result.

The same root cause gets at most two consecutive bounded repairs. A third
recurrence opens an architecture-decision ticket to reassess the free supply,
design, or assumption. Providers, acceptance gates, prices, lifecycle, and
external effects never change silently.

## Cost and free-supply rule

Every required product and release path has a hard default of USD 0 mandatory
third-party API cash spend. Paid, eventually-paid, and trial-to-bill APIs are
not required dependencies. Hidden model-token charges and automatic overages
are also prohibited.

Allowed candidates are open-source/self-hosted components, permitted public
data, qualified free official endpoints with billing hard-disabled, explicit
existing credits with a zero-cash ceiling, and optional customer BYOC adapters
that are not core dependencies. Free never means unbounded: terms, quotas,
health, privacy, fallback, and cost must still pass.

Compute, storage, databases, browsers, bandwidth, domains, and monitoring are
real costs. The unmanifested external-spend ceiling is USD 0. Any billable
infrastructure action needs an exact resource allowlist, gross/daily/monthly
ceiling, alert, stop-before-ceiling rule, cleanup deadline, and zero-resource
verification.

## External-effect boundary

Standing authority covers repository edits, tests, builds, local ephemeral
services with cleanup, and bounded read-only official research at zero cash
cost. The exact active ticket remains mandatory.

`CLERVO-EXTERNAL-ACTION-AUTHORITY` prepares the public identifiers,
permissions, limits, secret references, evidence, cleanup, expiry, and stop
conditions for an environment or stage—never secret values. It is deliberately
non-authoritative while it lives in an agent-writable workspace. The current
validator rejects `authorizationStatus: "authorized"`.

Unattended external admission requires a later exact security ticket to verify
detached Ed25519 signatures against an owner-controlled read-only trust root,
independently signed monotonic revocations, actual repository/ticket/authority
bindings, and mediated resource, command, budget, cleanup, and unknown-outcome
enforcement. Until that exists, the prepared package plus a separate explicit
owner action is mandatory.

The following remain fail-closed without those inputs and authority: credentials, cloud
mutation, IAM/billing/secrets, production, DNS/domain/email/registry changes,
external messages or customers, legacy migration/sunset, and any real wallet
or USDC action. Unrelated or broad destructive host actions stay forbidden.

## Payment boundary

Payment is dormant until Stage 15. Repository mock commerce and testnet work do
not authorize a real settlement. The Stage 15 ticket and prepared
`CLERVO-X402-PROOF-AUTHORITY` input must name the environment, release,
product, operation, payer and receiver roles, network, asset, facilitator,
exact amount, expiry, reserve, one-execution ceiling, evidence, reconciliation,
kill switch, and stop. That file cannot authorize payment; separate explicit
owner authority remains mandatory until the trusted signed supervisor exists.

The receiver contributes only a public `payTo` address and ownership
attestation. Its private key is neither required nor accepted. A different
payer supplies a public address and an opaque one-shot signer reference outside
Git and chat. The 402 is obtained and compared with the approved envelope before
signing. Unknown settlement quarantines the flow; only reconciliation of the
same identity is allowed, never a new authorization.

## Completion truth

The dispatcher stops permanently only when all eight ordered completion gates
carry passing evidence references, SHA-256 bindings, and verification times:
Stage 4 reference pattern, six qualified cores, combined private stability,
cross-pillar freeze, shared release system, production, bounded real
settlement, and one genuine external useful paid result. Lifecycle and stage
must agree with those bindings. It may then report that the recorded product
completion gates passed. It cannot promise revenue, wealth, market demand, or
investment return.

## Current dispatch

NPLAN.4 is complete at its governance boundary. N4.27T repository-local repair
preparation is complete and its new validation split remains unexecuted.
N4.27T isolated cloud qualification is `blocked_owner` until the exact cloud
identity/resource/cost/cleanup input package and separate explicit authority
exist. Unattended external admission also needs the owner trust root. Payment,
N4.28 and Stage 5 remain outside N4.27T.
