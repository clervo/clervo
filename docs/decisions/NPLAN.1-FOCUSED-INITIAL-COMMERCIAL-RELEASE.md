# NPLAN.1 focused Initial Commercial Release

**Status:** owner-authorized product and roadmap decision
**Date:** 2026-07-31

## Decision

Clervo's Initial Commercial Release consists of exactly three product pillars:

1. Search — find current, cited evidence.
2. AI — reason across broad, qualified inference supply.
3. Sandbox — execute bounded code in a secure isolated environment.

Together they form `Find → Reason → Execute`. The shared release system remains mandatory: one wallet, one machine-discoverable API, one bounded x402 flow, qualification and degradation, SDK/MCP/OpenAPI/agent discovery, executable onboarding, production operations, one bounded settlement proof, and one external payer receiving a useful result.

Universal Multi-chain RPC, Prediction-market Intelligence, and Crypto Intelligence move to Full Platform Expansion after launch. They are planned additive capabilities, not deleted or abandoned promises. Their directories, architectural boundaries, contracts, names, research, and extension points remain. They cannot be marked available until their own gates pass, and their addition cannot change existing Search, AI, or Sandbox identifiers, versioned contracts, endpoints, discovery semantics, receipts, SDKs, MCP tools, or routes.

## Lifecycle authority

Every product-scope claim uses one of:

- `available` — qualified and release-authorized;
- `degraded` — qualified but operating under a disclosed limitation;
- `preview` — implemented evidence exists, but release qualification is incomplete;
- `planned_post_launch` — preserved future expansion, not callable supply;
- `unavailable` — in initial scope but not implemented or qualified.

Current truth is Search `preview`; AI and Sandbox `unavailable`; RPC, Prediction, and Crypto Intelligence `planned_post_launch`. Neither the Initial Commercial Release nor Full Platform Expansion gate currently passes.

## Stage amendment

Completed Stages 0–4 retain their history. After Stage 4 the order is:

1. Stage 5 — AI supply plane.
2. Stage 6 — Secure sandbox.
3. Stage 7 — Search + AI + Sandbox outcome workflows.
4. Stage 8 — SDKs, MCP, onboarding, docs, site, and distribution.
5. Stage 9 — Production hardening.
6. Stage 10 — Bounded real x402 settlement proof.
7. Stage 11 — External-user proof and focused Initial Commercial Release.
8. Stages 12–14 — RPC, Prediction, then Crypto Intelligence expansion.
9. Stage 15 — Full Platform Expansion verification.

Stage 4 remains blocked on 21 checks. N4.23 remains valid and paused. This decision authorizes no provider contact, credential use, cloud mutation, payment, deployment, AI/sandbox implementation, or later-stage implementation.

## Compatibility rule

The stable capability identifiers are source-controlled in `packages/contracts/src/product-scope.ts`. Expansion is additive. Compatibility tests freeze the initial pillar identifiers while independently changing future-pillar lifecycle state. Existing Stage 4 verifier evidence and decision logic are unchanged.

## Rejected alternatives

- Requiring all six pillars before first launch: superseded by the owner decision because it delays useful commercial proof behind independent expansion work.
- Removing future pillars: rejected because the platform remains intentionally expandable.
- Relabeling planned directories as previews or live products: rejected because architecture is not availability evidence.
