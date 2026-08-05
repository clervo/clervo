# Clervo engineering instructions

## Current program

Clervo is one permanent six-family platform:

1. Search
2. AI
3. Secure Sandbox
4. Multi-chain RPC
5. Prediction
6. Crypto Intelligence

Recovery is sequential, not Search-only. The active recovery gate is Gate 5:
Reconcile Clervo Against Market Reality.

Gate 5 work order:

1. Search
2. AI
3. Secure Sandbox
4. Multi-chain RPC
5. Crypto Intelligence
6. Prediction

Search being first does not redefine the company, catalog, launch architecture,
website, or recovery finish line.

## Authority order

Use this order when instructions conflict:

1. security, protection of funds, and explicit owner authorization;
2. approved versioned decisions;
3. locked Clervo product and website authority;
4. the recovery control roadmap;
5. `docs/PRODUCT.md`;
6. `docs/CURRENT-STATE.yaml`;
7. `docs/authority/AUTHORITY-MAP.md`;
8. current canonical registry, runtime evidence, and source contracts;
9. current code and focused tests;
10. historical and archived material.

GitHub issues coordinate work. They do not override approved decisions.

## Operating rules

- Inspect Git state before editing.
- Work on a branch; never commit directly to `main`.
- Preserve existing engineering and trace the current path before replacing it.
- Prefer Keep, Connect, or Fix over Replace.
- Revenue-first changes execution priority, not permanent platform scope.
- Use one connected workstream for one buyer outcome; avoid artificial
  micro-tickets and repeated documentation.
- Tests support delivery and safety. Passing a test is not itself a product
  milestone.
- Do not claim lifecycle, availability, price, provider, deployment, payment,
  revenue, or demand without source-bound evidence.
- Public truth must eventually derive from one canonical lifecycle registry.
- Keep unavailable operations visible as platform scope but never advertise
  them as purchasable.
- Website Steps 1-7G and the locked v4 visual authority remain preserved.
  Replacement website implementation belongs to recovery Gate 10.

## Owner-only blockers

Stop only when progress requires the owner to:

- provide credentials, account access, login, CAPTCHA, MFA, or approval;
- approve spending or sign a wallet action;
- select between materially different paid or legal options without a clear
  evidence-backed winner;
- authorize an irreversible production, customer-data, billing, IAM, domain,
  registry, or unrelated infrastructure action.

Continue independent local work around isolated blockers.

## Permanent safety boundaries

- Never expose secrets, wallet material, credentials, or customer payloads.
- Never spend or sign without exact owner authorization and a hard cap.
- Unknown payment or settlement state fails closed and must be reconciled before
  another authorization or retry.
- Preserve payment idempotency, receipts, no-charge replay, hard cost ceilings,
  sandbox isolation, SSRF and redirect protection, and resource cleanup.
- Never weaken contracts or fabricate proof.
- `/opt/clervo-ai` and `ai.clervo.dev` are protected, separate infrastructure.
  Do not stop, replace, reconfigure, expose, or include them in cleanup without
  explicit authorization.
- Preserve the clean-room repository boundary and unrelated infrastructure.
