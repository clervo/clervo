# Clervo for agents

This document is written for an autonomous caller. It states what is callable,
what it costs, and what has actually been proven. It contains no marketing
claim and no capability that the deployed system does not serve.

Source: `Clervo production probe`, probed at 2026-08-14T12:17:15.502Z. Release: `6024e67a816e69fef7f73fae2cc867951c3dfd00`.

## Identity

- API origin: https://api.clervo.dev
- Site origin: https://clervo.dev
- Payment protocols: x402 and MPP EVM charge intents, USDC on Base.
- Authentication: none. The free sample needs no credential; paid routes need a payment, not an account.

## Observed state

| Product | ID | Lifecycle state | Proof level |
|---|---|---|---|
| AI | `ai` | live | paid_outcome_verified |
| Crypto Intelligence | `crypto_intelligence` | live | paid_outcome_verified |
| Prediction Intelligence | `prediction` | live | paid_outcome_verified |
| Multi-chain RPC | `rpc` | unavailable (temporarily_unavailable) | none |
| Secure Sandbox | `sandbox` | live | paid_outcome_verified |
| Research | `search` | live | paid_outcome_verified |

These are two independent facts. A `live` product with proof level
`quote_observed_unpaid` is offered and priced; it is not a demonstrated paid
outcome. Report it that way if you cite it.

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

- Publicly callable previews: raw cited Search, bounded paid AI, bounded one-shot Secure Sandbox execution, derived Prediction Intelligence, bounded provider-neutral Crypto Intelligence.
- Crypto amounts stay exact in asset-native atomic units; USD valuation and cross-asset concentration remain unavailable without commercially qualified price supply.
- Reports expose observed facts, deterministic signals, coverage, missing sources, freshness, evidence, and provenance; they do not infer wallet identity, risk, advice, custody, signing, or trading.
- A public quote proves price and reachability only; paid outcome proof is reported separately and is never inferred from a 402.
- Solana and unsupported EVM chains fail closed.
