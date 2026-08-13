# Clervo skill

Clervo sells bounded outcomes over HTTP: one request in, one verified result
and one receipt out. Payment, when required, uses x402 or MPP over USDC on
Base and is always quoted before execution.

Generated from `Clervo production probe`, probed at 2026-08-13T20:13:01.876Z. Every row below is observed from the deployed system, never asserted.

## When to use this skill

- You need a paid AI model call (89 models: Claude, GPT, Gemini, Qwen, DeepSeek, Llama, Kimi, Mistral and more) — use `POST /v1/ai/execute`.
- You need cited web evidence for a question — use `POST /v1/search/free` or `POST /v1/search/paid`.
- You need to run sandboxed Node.js code safely with a receipt — use `POST /v1/sandbox/execute`.
- You need real-time prediction market data (Polymarket, Kalshi, Manifold, Limitless) — use `POST /v1/prediction/execute`.
- You need EVM wallet intelligence for Ethereum or Base — use `POST /v1/crypto/execute`.
- You want per-request payment with no account, no API key, and safe retry on failure.
- You need the same request to be safely retryable without being charged twice.

## Observed capability

| Product | ID | Lifecycle state | Proof level |
|---|---|---|---|
| AI | `ai` | live | paid_outcome_verified |
| Crypto Intelligence | `crypto_intelligence` | live | paid_outcome_verified |
| Prediction Intelligence | `prediction` | live | paid_outcome_verified |
| Multi-chain RPC | `rpc` | unavailable (temporarily_unavailable) | none |
| Secure Sandbox | `sandbox` | live | paid_outcome_verified |
| Research | `search` | live | paid_outcome_verified |

Lifecycle state is what the runtime serves right now. Proof level is what has
actually been demonstrated: `quote_observed_unpaid` means a price and a valid
payment challenge were returned and nothing more. Do not treat a priced route
as a proven paid outcome.

## First call

No key, no account, no wallet:

```bash
curl -sS https://api.clervo.dev/v1/search/free \
  -H 'content-type: application/json' \
  -d '{"query":"World Wide Web","maxResults":3,"synthesize":false}'
```

The free sample accepts a request with no `idempotency-key`. The server mints one and returns it in the `idempotency-key` response header; send that value back to replay the same operation without re-executing it.

## Paid call

1. `POST https://api.clervo.dev/v1/search/paid` with the same body and your own `idempotency-key`.
2. Read the 402 response: `accepts[0]` carries the exact maximum charge, asset, network, and expiry.
3. Approve deliberately, then resend with `PAYMENT-SIGNATURE` (x402) or `Authorization: Payment` (MPP).
4. Reuse the same key to replay the completed result. A replay never charges again.

### Paid AI example

```bash
curl -i -X POST https://api.clervo.dev/v1/ai/execute
  -H 'content-type: application/json'
  -H 'Idempotency-Key: my-unique-key-550e8400'
  -d '{"model":"clervo/allam-2-7b","input":{"kind":"chat","messages":[{"role":"user","content":"Reply with ready."}],"responseFormat":"text","stream":false},"maximumOutputTokens":16}'
```

The paid AI route returns a 402 with the exact request-derived quote before execution. Approve only that quote, then resend with x402 or MPP payment headers.

## Failure behaviour

- `400` the request was rejected before execution; fix it and resend.
- `402` payment is required; the body carries the exact quote.
- `409` the key is bound to a different request body; use a new key.
- `429` the free quota is exhausted; wait for the window in `ratelimit-reset`.
- `5xx` the operation failed closed. Retry the same key. Never retry a payment of unknown settlement state with a new key.

## Machine-readable contracts

- `/.well-known/clervo.json` — discovery, products, and observed truth.
- `/.well-known/x402` — x402 v2 payment manifest with the exact quote each paid resource returns.
- `/v1/models` — authoritative AI catalog with stable IDs, aliases, capabilities, price, free/paid state, availability, health, and commerce contract.
- `/openapi.json` — request and response contracts.
- `/status.json` — current lifecycle state, proof level, and open conformance defects.
- `/pricing.json` — the public offer boundary.
- `/llms.txt` — this service as a documentation map.
