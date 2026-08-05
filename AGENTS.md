# Clervo engineering rules

## Objective

Open the strongest Clervo shop the existing technology can support and use it to
collect money.

No work is authorized unless it improves the product, offer, price-to-value,
payment, visibility, distribution, reliability, capacity, revenue, or
protection against material loss.

## Authority

1. Security and protection of funds
2. Current approved ADRs
3. `docs/PRODUCT.md`
4. `packages/catalog/launch-state.v1.json`
5. Active Shop-Open issue
6. `docs/CURRENT-STATE.yaml`
7. Current code, generated artifacts, and deployment evidence
8. This file
9. Archived history

Report unresolved conflicts. Never follow an old gate or handoff as current
authority.

## Context

Read only this file, current state, the active issue, relevant nested
instructions, and directly relevant source, schemas, focused tests, and
deployment files.

Do not automatically read archived roadmaps, completed gates, old handoffs,
journals, broad research, or unrelated product families.

## Reuse first

- Preserve working code.
- Trace the current path before editing.
- Prefer Keep, Connect, or Fix over Replace.
- A rewrite requires a demonstrated buyer or revenue advantage.
- Do not clean unrelated legacy code.
- Do not create architecture buyers cannot feel.
- Do not expand another family unless the active issue requires it.

## Work unit

Use one issue, one branch, and one PR for the connected work required to open
one product. Do not split one buying journey into artificial micro-tickets.

## Verification

Use focused checks while assembling the product.

The Shop-Open test runs after provider, result, price, payment, receipt, replay,
visibility, and onboarding are connected. It uses the owner-approved production
wallet and the exact approved spending cap.

Required opening behavior:

- a fresh useful production result;
- one approved-wallet payment;
- a valid result and receipt;
- no second charge or execution on replay;
- another new purchase works;
- all public visibility surfaces agree.

Tests and documentation are tools for opening the shop, not finish lines.

## Public truth

Public surfaces derive from generated artifacts backed by
`packages/catalog/launch-state.v1.json` and the existing platform registry.

Do not manually maintain conflicting prices, routes, lifecycle labels, or
descriptions. Public language must be accurate, confident, outcome-focused, and
free of internal gate terminology.

## Safety

Never expose secrets, wallet material, customer payloads, or credentials.
Never spend or sign beyond explicit owner approval. Unknown settlement fails
closed. Preserve payment idempotency, replay safety, hard cost ceilings,
sandbox isolation, SSRF protection, and the protected `ai.clervo.dev` runtime.

Stop only when customer funds or credentials are at risk, payment can
double-charge, spending is uncontrolled, the intended paid use is explicitly
prohibited, or a real unresolved product decision blocks opening.
