# Clervo for agents

This document is written for an autonomous caller. It states what is callable,
what it costs, and what has actually been proven. It contains no marketing
claim and no capability that the deployed system does not serve.

Source: `packages/catalog/live-registry.json`, probed at 2026-08-09T14:46:33.716Z. Release: `ab0bb28b76fb8606bd854b741214961b8e1ba1d2`.

## Identity

- API origin: https://api.clervo.dev
- Site origin: https://clervo.dev
- Payment protocols: x402 and MPP EVM charge intents, USDC on Base.
- Authentication: none. The free sample needs no credential; paid routes need a payment, not an account.

## Observed state

| Product | ID | Lifecycle state | Proof level |
|---|---|---|---|
| AI | `ai` | supply_paused (no_route_currently_live) | none |
| Crypto Intelligence | `crypto_intelligence` | unavailable (commercial_rights_blocked) | none |
| Prediction Intelligence | `prediction` | live | quote_observed_unpaid |
| Multi-chain RPC | `rpc` | unavailable (commercial_rights_blocked) | none |
| Secure Sandbox | `sandbox` | live | quote_observed_unpaid |
| Research | `search` | live | quote_observed_unpaid |

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
  -d '{"query":"what is the x402 payment protocol","maxResults":3,"synthesize":false}'
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
- `/v1/models` — every catalogued AI route, OpenAI list shape, with lifecycle state, proof level, and observed price.
- `/openapi.json`
- `/catalog.json`
- `/capabilities.json`
- `/pricing.json`
- `/status.json`
- `/onboarding.json`
- `/llms.txt`

## Model selection

- 21 catalogued routes; 0 sellable now.
- Send `clervo.routeId`'s exact model identity as `model` on `POST /v1/ai/execute`.
- A route with `clervo.lifecycleState: supply_paused` is listed with its reason and is not sellable. Do not select it; it stays listed because the supply is owned and returning.
- `clervo.observedPrice` is the quote observed at the probe above. The 402 returned for your own request is the binding one.

## Boundaries

- Publicly callable previews: raw cited Search, bounded one-shot Secure Sandbox execution, derived Prediction Intelligence.
- Prediction uses the qualified pdata supply path for Polymarket, Kalshi, Manifold, and Limitless; unresolved direct venue adapters remain disabled.
- Prediction output is transformed and attributed under CC BY 4.0; Clervo does not redistribute the raw pdata feed or provide trading execution or custody.
- A public quote proves price and reachability only; paid outcome proof is reported separately and is never inferred from a 402.
- RPC and Crypto Intelligence remain publicly unavailable.
