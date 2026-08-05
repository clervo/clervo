# NPLAN.4 — Standing autonomous exact-ticket completion authority

- **Status:** accepted
- **Date:** 2026-08-01
- **Starting commit:** `bc92aa2a3309815d3008220fe2a284cf22111dc6`

## Context

The owner wants Clervo to reach the truthful all-six product completion gates
without repeatedly managing or approving ordinary tickets. The owner also
requires a one-time list of inputs that only the owner can supply, a safe x402
receiver/payer setup, automatic repair tickets, no paid API dependency, and no
invented readiness, users, payments, or revenue.

The previous authority required a new owner approval after every ticket. That
preserved safety but created avoidable idle time and repeated coordination. A
blanket permission to mutate cloud, wallets, production, or external accounts
would be unsafe and would not give an agent the missing identities, limits,
terms, or secrets.

## Decision

Install one standing completion program with a fresh-cycle exact-ticket
dispatcher:

1. Each worker executes one exact ticket, validates, records evidence, commits,
   verifies the commit, and stops.
2. A fresh dispatch cycle may select and admit the smallest next local ticket
   without another owner approval when the prior closeout and ordered gates pass.
3. A concrete repairable failure creates a bounded exact repair ticket. Failed
   sealed or once-only qualification is preserved and any later attempt uses a
   new independent pre-split procedure.
4. Missing owner-only input blocks only the affected external action; safe
   independent work continues without skipping a gate.
5. External mutations require finite owner-prepared inputs naming identities,
   resources, operations, costs, cleanup, evidence, expiry, and stop conditions,
   plus separate explicit owner authority until trusted signed-manifest
   verification and mediated enforcement are implemented. Workspace JSON alone
   never authorizes an effect.
6. Mandatory paid, eventually-paid, and trial-to-bill third-party API cash spend
   is USD 0 for required product and release paths. Infrastructure remains a
   separately measured and authorized real cost.
7. Real payment remains dormant until Stage 15, its exact x402 ticket and input,
   and separate explicit owner authority unless the trusted supervisor exists.
   Clervo needs only the receiver public `payTo` address, never its private key;
   the payer is a different wallet with an opaque restricted signer reference.
8. Product completion may be reported only after every recorded gate passes.
   Revenue, demand, wealth, and investment return are never guaranteed.

## Consequences

- The owner does not approve every ordinary repository ticket.
- The master plan, `AGENTS.md`, autonomy policy, canonical product authority,
  dispatcher state, and evidence now share one transition model.
- Design, JSON, SDK, documentation, discovery, and SEO remain one Stage 13
  projection from the Stage 12 freeze; NPLAN.4 does not start that work early.
- A one-time owner intake, non-authoritative external-action input, dormant Stage
  15 x402 input, and owner trust-root class replace repeated ad hoc credential/
  wallet questions without letting the workspace grant itself authority.
- N4.27T local work becomes the next admitted product cycle after NPLAN.4 closes.
  Its cloud phase still waits for the exact owner cloud envelope.

## Rejected alternatives

- **Blanket unlimited autonomy:** cannot bound money, credentials, production,
  customer, legacy, or unknown external effects.
- **Keep per-ticket owner approval:** conflicts with the requested unattended
  completion workflow and adds no safety to ordinary bounded local work.
- **Give Clervo the receiver private key:** unnecessary for receiving x402
  payments and expands wallet risk.
- **Treat every failure as permission to rerun:** violates sealed and once-only
  evidence integrity.
- **Use paid APIs to move faster:** violates the owner’s zero-paid-API boundary
  and creates an unproven post-credit business dependency.
