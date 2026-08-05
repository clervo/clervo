# Gate 4.5 six-family authority correction

**Version:** v1
**Date:** 2026-08-05
**Status:** APPROVED
**Effective:** This corrective follow-up commit
**Corrects:** `0cdcbba6b64b547178dfce9d7005b49dd62e4739`

## Decision

Clervo is one unified platform with six permanent product families:

1. Search
2. AI
3. Secure Sandbox
4. Multi-chain RPC
5. Prediction
6. Crypto Intelligence

Products may be recovered and released sequentially.

Search is first only in the recovery work order. It is not the company identity,
whole catalog, whole launch, or recovery finish line.

> Revenue-first changes how the six-family platform is recovered. It does not
> reduce the six-family platform.

## Approved operating rules

- Work must lead toward sellable products and revenue.
- Reuse existing engineering.
- Avoid token-heavy documentation and repeated broad audits.
- Tests are support tools, not achievements.
- The owner-approved wallet may validate controlled payment plumbing under an
  exact explicit cap.
- Payment must remain receipt-bearing, idempotent, and replay-safe.
- Unknown settlement fails closed.
- Provider terms must not explicitly prohibit the intended paid use.
- Public truth must derive from one canonical lifecycle registry.
- Website, catalog, pricing, status, OpenAPI, MCP, SDKs, onboarding, discovery,
  and `llms.txt` must eventually agree.
- No direct commits to `main`.
- `/opt/clervo-ai` and `ai.clervo.dev` remain protected and separate.

## Recovery sequence

1. Gate 5 — Reconcile Clervo Against Market Reality
2. Gate 6 — Clean GitHub and Public Exposure
3. Gate 7 — Collapse Active Authority
4. Gate 8 — Rewrite Commercial Launch Roadmap
5. Gate 9 — Recover Products One Vertical at a Time
6. Gate 10 — Integrate the Replacement Website

Gate 5 family order:

1. Search
2. AI
3. Secure Sandbox
4. Multi-chain RPC
5. Crypto Intelligence
6. Prediction

## Gate 4.5 boundaries

This correction changes authority, documentation, and control verification only.

It does not authorize or perform:

- product runtime edits;
- public visibility edits;
- deployment;
- provider switching;
- wallet payment;
- production mutation;
- replacement website implementation;
- broad refactoring;
- deletion of historical evidence.

## GitHub coordination

Issue `#10`, “Gate 4.5: Open the search.web shop,” is superseded and must not
control work.

The replacement coordination issue must represent one six-family recovery
program with Search as the first workstream.

## 35-change repair treatment

The logical changes introduced by `0cdcbba` are treated as follows.

### Rewrite

- `AGENTS.md`
- `AI_BUILDER.md`
- `README.md`
- `START-HERE.md`
- `docs/CURRENT-STATE.yaml`
- `docs/PRODUCT.md`
- `docs/archive/gate4-5-control-reset-20260805/README.md`
- `docs/authority/AUTHORITY-MAP.md`
- `docs/brand/FOCUSED-LAUNCH-SCOPE-v1.md`
- `docs/marketing/INITIAL-COMMERCIAL-RELEASE.md`
- `docs/product/CURRENT-ENGINEERING-STATE.md`
- `docs/product/FULL-PLATFORM-REVENUE-FINISH-LINE.md`
- `scripts/verify-product-scope.mjs`
- `tests/contract/full-platform-readiness.test.mjs`

### Restore to original active paths

- `docs/decisions/NPLAN.3-SIX-PRODUCT-CORE-FIRST-PLATFORM.md`
- `docs/evidence/NPLAN.3-six-product-core-first-roadmap-audit.md`
- `docs/tickets/NPLAN.3.md`
- `docs/evidence/NPLAN.3R-acceptance-handoff-repair.md`
- `docs/tickets/NPLAN.3R.md`
- `docs/decisions/NPLAN.4-STANDING-AUTONOMOUS-COMPLETION.md`
- `docs/evidence/NPLAN.4-autonomous-completion-and-owner-package.md`
- `docs/tickets/NPLAN.4.md`

Restoration preserves history. It does not reactivate older instructions above
this decision.

### Keep as historical evidence or compatible cleanup

- pre-reset archive copies of brand, marketing, root authority, engineering,
  finish-line, verifier, and test files;
- removal of the obsolete active `test:stage5` package command;
- retirement of `scripts/verify-stage5-exit.mjs`.

### Archive

- the fixed-percentage full-platform readiness snapshot;
- the historical Stage 5 exit verifier;
- the Search-only `SHOP-OPEN-EXECUTION.md` program.

## Supersession

This decision supersedes the Search-only authority introduced by `0cdcbba`.
The commit itself remains preserved as historical evidence.

The locked Clervo product and website decisions, recovery roadmap, current
source-bound evidence, and this correction control future work.
