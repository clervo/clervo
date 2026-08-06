# Clervo skill

Clervo sells bounded outcomes over HTTP: one request in, one verified result
and one receipt out. Payment, when required, uses x402 or MPP over USDC on
Base and is always quoted before execution.

Generated from `packages/catalog/live-registry.json`, probed at 2026-08-06T14:42:37.447Z. Every row below is observed from the deployed system, never asserted.

## When to use this skill

- You need current cited web evidence for a question and want the sources with the answer.
- You want to pay per request instead of holding an account or an API key.
- You need the same request to be safely retryable without being charged twice.

## Observed capability

| Product | ID | Lifecycle state | Proof level |
|---|---|---|---|
| AI | `ai` | live | quote_observed_unpaid |
| Crypto Intelligence | `crypto_intelligence` | unavailable (commercial_rights_blocked) | none |
| Prediction Intelligence | `prediction` | unavailable (commercial_rights_blocked) | none |
| Multi-chain RPC | `rpc` | unavailable (commercial_rights_blocked) | none |
| Secure Sandbox | `sandbox` | live | quote_observed_unpaid |
| Research | `search` | live | quote_observed_unpaid |

Lifecycle state is what the runtime serves right now. Proof level is what has
actually been demonstrated: `quote_observed_unpaid` means a price and a valid
payment challenge were returned and nothing more. Do not treat a priced route
as a proven paid outcome.

## First call

No key, no account, no wallet:

```bash
curl -sS https://api.clervo.dev/v1/search/free \
  -H 'content-type: application/json' \
  -d '{"query":"what is the x402 payment protocol","maxResults":3,"synthesize":false}'
```

The free sample accepts a request with no `idempotency-key`. The server mints one and returns it in the `idempotency-key` response header; send that value back to replay the same operation without re-executing it.

## Paid call

1. `POST https://api.clervo.dev/v1/search/paid` with the same body and your own `idempotency-key`.
2. Read the 402 response: `accepts[0]` carries the exact maximum charge, asset, network, and expiry.
3. Approve deliberately, then resend with `PAYMENT-SIGNATURE` (x402) or `Authorization: Payment` (MPP).
4. Reuse the same key to replay the completed result. A replay never charges again.

## Failure behaviour

- `400` the request was rejected before execution; fix it and resend.
- `402` payment is required; the body carries the exact quote.
- `409` the key is bound to a different request body; use a new key.
- `429` the free quota is exhausted; wait for the window in `ratelimit-reset`.
- `5xx` the operation failed closed. Retry the same key. Never retry a payment of unknown settlement state with a new key.

## Machine-readable contracts

- `/.well-known/clervo.json` — discovery, products, and observed truth.
- `/openapi.json` — request and response contracts.
- `/status.json` — current lifecycle state, proof level, and open conformance defects.
- `/pricing.json` — the public offer boundary.
- `/llms.txt` — this service as a documentation map.
