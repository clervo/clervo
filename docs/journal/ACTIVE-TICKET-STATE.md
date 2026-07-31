# Active ticket state

**Ticket:** NPLAN.1 — Focused Initial Commercial Release Amendment
**Stage:** planning authority amendment; Stage 4 remains active
**One question:** How does all source-controlled authority adopt Search + AI + Sandbox for the initial release while preserving RPC + Prediction + Crypto Intelligence as truthful additive expansion?
**Result:** complete; atomic commit pending

## Authoritative inputs

- `/workspace/docs/CLERVO-BLOCKRUN-10X-MASTER-PLAN.md`
- `AGENTS.md`, `.codex-autonomy-policy.md`, and `.cline/rules/*`
- Owner-authorized NPLAN.1 decision dated 2026-07-31
- N4.22 Stage 4 campaign evidence and N4.23 owner-action package
- Clean `main` starting at `cf3fa44`

## Exact acceptance criteria

- Initial Commercial Release requires exactly Search, AI, and Sandbox plus every shared launch/commerce/operations gate.
- Full Platform Expansion adds RPC, Prediction, and Crypto Intelligence after launch without breaking existing identifiers or versioned behavior.
- Lifecycle states distinguish available, degraded, preview, planned/post-launch, and unavailable.
- Planned expansion pillars cannot be published as live.
- Roadmap, repository authority, discovery/catalog, prototype copy, builder, brand/marketing, and agent framework agree.
- Stage 4 remains blocked on 21 checks; N4.23 remains valid and paused; no implementation stage starts.

## Decisions made

- Preserve completed Stages 0–4. Renumber only the future program: Stage 5 AI; 6 Sandbox; 7 outcomes; 8 distribution; 9 hardening; 10 settlement proof; 11 focused launch; 12 RPC; 13 Prediction; 14 Crypto Intelligence; 15 all-six expansion verification.
- Current product-scope truth: Search `preview`; AI/Sandbox `unavailable`; RPC/Prediction/Crypto Intelligence `planned_post_launch`.
- Initial and full-platform gates are separate source functions. Both currently return false.
- Generated discovery remains search-only, `implemented_unverified`, non-payable, and deployment-unverified; release scope is additive metadata.
- No binary brand/motion source or prior `AI_BUILDER.md`/site implementation existed. Added Markdown authority and prototype-only site fixtures; no production site was built.

## Files changed

- External master plan.
- Product-scope contract, schema, fixtures, exports, discovery/catalog/llms generation, focused tests, scripts, and package wiring.
- README, autonomy/Cline authority, NPLAN decision/ticket, active state, and append-only journal.
- `AI_BUILDER.md`, brand and marketing addenda, prototype site copy/metadata, and ten-agent use-case framework.
- Generated discovery artifacts after validation.

## Tests run

- Focused `npm run test:nplan.1`: passed 4/4.
- `npm run contracts`: passed 37 schemas/69 fixtures.
- `npm run test:n1.3`: passed 6/6; discovery generated 37 schemas.
- `npm run verify:product-scope`, `npm run typecheck`, clean-room boundary, secret scan, and `git diff --check`: passed.
- Canonical `npm test`: ran exactly once and passed 209/209; zero external network calls and 0 USDC.
- Canonical Stage 4 verifier: decision `blocked`; 21 checks; reference pattern false; Stage 5 authorization false.

## Current blocker

- NPLAN.1 has no internal blocker. Stage 4 still has the unchanged external N4.23 prerequisites recorded in `docs/evidence/N4.23-owner-action-package.md`.

## Exact next action

- Finalize the writable master-plan handoff, append journal evidence, run final non-canonical diff/secret checks, commit once, and stop.

## Out of scope / parking lot

- N4.23 implementation; provider contact/purchase; credentials; cloud/IAM/deployment; payment; AI/Sandbox/RPC/Prediction/Crypto implementation; production site; agent implementation; Stage 5 or later work.

## Stop condition

- Commit NPLAN.1 as one atomic amendment, report, and stop. Do not begin N4.23 or any later implementation stage.
