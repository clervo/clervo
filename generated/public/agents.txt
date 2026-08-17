# Clervo for agents

Clervo lets software use AI models and agent tools with pay-per-use x402 payments, without managing separate provider accounts or API keys.

This document lists the callable routes, current prices, setup paths, and safe
payment behavior an autonomous caller needs.

Current availability was generated at 2026-08-15T14:28:34.287Z.

## Identity

- API origin: https://api.clervo.dev
- Site origin: https://clervo.dev
- Payment protocols: x402 and MPP EVM charge intents, USDC on Base.
- Authentication: none. The free sample needs no credential; paid routes need a payment, not an account.

## Current availability

| Product | ID | Availability | Price |
|---|---|---|---|
| AI | `ai` | live | 0.001000 USDC observed maximum |
| Crypto Intelligence | `crypto_intelligence` | live | 0.004000 USDC observed maximum |
| Prediction Intelligence | `prediction` | live | 0.002000 USDC observed maximum |
| Multi-chain RPC | `rpc` | live | 0.001000 USDC observed maximum |
| Secure Sandbox | `sandbox` | live | 0.060000 USDC observed maximum |
| Research | `search` | live | 0.006000 USDC observed maximum |

A `live` product accepts requests. Paid resources return their binding quote
in the 402 response; unavailable resources have no public execution route.

## Free entry point

- `POST https://api.clervo.dev/v1/search/free`
- Accepts a request with no idempotency key: yes
- Quota headers: `ratelimit-limit`, `ratelimit-remaining`, `ratelimit-reset`.
- Over the cap the route answers `429 free_quota_exceeded` rather than executing. Do not treat 429 as a transport error.

## Minimum viable request

```bash
curl -sS https://api.clervo.dev/v1/search/free \
  -H 'content-type: application/json' \
  -d '{"query":"World Wide Web","maxResults":3,"synthesize":false}'
```

## Idempotency contract

- A key is 8 to 128 visible ASCII token characters.
- The same key with the same body replays the stored result and sets `idempotency-replayed: true`. No second execution, no second charge.
- The same key with a different body returns `409 idempotency_conflict`.
- If the free sample generates a key for you, it is returned in the `idempotency-key` response header. Keep it if you may need to replay.
- On an unknown settlement state, retry with the same key only. A new key authorizes a new charge.

## Discovery paths

- `/.well-known/clervo.json`
- `/.well-known/x402` — x402 v2 payment manifest; each item carries the exact quote its resource returns.
- `/v1/models` — authoritative AI catalog, OpenAI list shape, including stable canonical IDs and aliases plus capability, price, availability, health, and commerce metadata.
- `/openapi.json`
- `/catalog.json`
- `/capabilities.json`
- `/pricing.json`
- `/status.json`
- `/onboarding.json`
- `/llms.txt`

## Model selection

- 89 callable IDs: 85 canonical and 4 stable aliases; 88 sellable now.
- Send a canonical `id`, or an alias whose `clervo.aliasFor` contract you accept, as `model` on `POST /v1/ai/execute`.
- Use `clervo.availability`, `clervo.health`, and `clervo.publicSellable` before selection. Canonical IDs never substitute another model.
- Use `clervo.customerPricing` and `clervo.billingMode` for discovery. A paid request's 402 is the binding maximum charge.

## Boundaries

- Publicly callable operations: raw cited Search, bounded paid AI, bounded one-shot Secure Sandbox execution, bounded read-only Multi-chain RPC, derived Prediction Intelligence, bounded provider-neutral Crypto Intelligence.
- Crypto amounts stay exact in asset-native atomic units; USD valuation and cross-asset concentration remain unavailable.
- A 402 response is a quote, not payment authorization or settlement.
- Solana and unsupported EVM chains fail closed.
