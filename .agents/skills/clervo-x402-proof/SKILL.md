---
name: clervo-x402-proof
description: Fail-closed preflight and execution workflow for an explicitly owner-approved bounded Clervo x402 settlement. Use for quote, 402 challenge, authorization, verification, settlement, receipt, replay, reconciliation, wallet, payment, or USDC proof requests.
---

# Clervo x402 Proof

## Require explicit payment approval

1. Stop unless the owner explicitly approves the real payment and names the environment, payer and receiver roles, network, asset, recipient, facilitator, product, maximum amount, balance cap, cost ceiling, execution count, and reconciliation method.
2. A wallet, balance, credential, completed mock flow, returned 402, or roadmap position is never payment approval.
4. Never expose private keys, seed phrases, signatures, bearer values, wallet material, or secret values.

## Prove one bounded flow

1. Verify separate payer and receiver, deployment identity, recipient, network, asset, facilitator, quote expiry, nonce, request hash, operation ID, idempotency key, exact or maximum charge, available budget, alerts, ledger, receipt, explorer, kill switch, and reconciliation readiness.
2. Obtain the 402 without authorizing payment. Compare every field to the approved values and fail closed on mismatch.
3. Authorize once, retry only with the same safe identity, verify useful result, settlement, balanced ledger, receipt, and chain evidence, then replay the same idempotency key and prove no second execution or charge.
4. If verification or settlement is unknown, quarantine and reconcile. Never create a new authorization automatically.

Record exact spend, owner funding, provider cost, transaction evidence by safe identifier only, replay outcome, reconciliation, and remaining balance. Owner-funded proof is plumbing evidence, never revenue or demand. Never begin another payment without fresh explicit approval.
