---
name: clervo-x402-proof
description: Fail-closed preflight and execution workflow for a separately authorized bounded Clervo x402 settlement proof. Use for quote, 402 challenge, authorization, verification, settlement, receipt, replay, reconciliation, wallet, payment, or USDC proof requests; it must block when exact ticket, amount, environment, recipient, and evidence authority are absent.
---

# Clervo x402 Proof

## Require exact payment authority

1. Invoke `$clervo-engineering-stage` and read the current handoff.
2. Stop unless an exact active ticket authorizes real payment, names the environment, payer and receiver roles, network, asset, recipient, facilitator, product, maximum amount, balance cap, cost ceiling, execution count, reconciliation method, evidence outputs, and stop condition.
3. A wallet, balance, credential, completed mock flow, returned 402, roadmap position, or proposed ticket is never authorization.
4. Never expose private keys, seed phrases, signatures, bearer values, wallet material, or secret values.

## Prove one bounded flow

1. Verify separate payer and receiver, deployment identity, recipient, network, asset, facilitator, quote expiry, nonce, request hash, operation ID, idempotency key, exact or maximum charge, available budget, alerts, ledger, receipt, explorer, kill switch, and reconciliation readiness.
2. Obtain the 402 without authorizing payment. Compare every field to the approved values and fail closed on mismatch.
3. Authorize once, retry only with the same safe identity, verify useful result, settlement, balanced ledger, receipt, and chain evidence, then replay the same idempotency key and prove no second execution or charge.
4. If verification or settlement is unknown, quarantine and reconcile. Never create a new authorization automatically.

Record exact spend, owner funding, provider cost, transaction evidence by safe identifier only, replay outcome, reconciliation, and remaining balance. Owner-funded proof is plumbing evidence, never revenue or demand. Commit evidence and stop; do not begin customer acquisition or another payment.
