# Clervo for agents

This document is written for an autonomous caller. It states what is callable,
what it costs, and what has actually been proven. It contains no marketing
claim and no capability that the deployed system does not serve.

Source: `packages/catalog/live-registry.json`, probed at 2026-08-06T11:40:50.003Z. Release: `e23264a52c0c2a0254d19ff8062437b05ce1bad8`.

## Identity

- API origin: https://api.clervo.dev
- Site origin: https://clervo.dev
- Payment protocols: x402 and MPP EVM charge intents, USDC on Base.
- Authentication: none. The free sample needs no credential; paid routes need a payment, not an account.

## Observed state

| Product | ID | Lifecycle state | Proof level |
|---|---|---|---|
| AI | `ai` | live | quote_observed_unpaid |
| Crypto Intelligence | `crypto_intelligence` | unavailable (commercial_rights_blocked) | none |
| Prediction Intelligence | `prediction` | unavailable (commercial_rights_blocked) | none |
| Multi-chain RPC | `rpc` | unavailable (commercial_rights_blocked) | none |
| Secure Sandbox | `sandbox` | live | quote_observed_unpaid |
| Research | `search` | live | quote_observed_unpaid |

These are two independent facts. A `live` product with proof level
`quote_observed_unpaid` is offered and priced; it is not a demonstrated paid
outcome. Report it that way if you cite it.

## Free entry point

- `POST https://api.clervo.dev/v1/search/free`
- Accepts a request with no idempotency key: no
- Quota headers: `ratelimit-limit`, `ratelimit-remaining`, `ratelimit-reset`.
- Over the cap the route answers `429 free_quota_exceeded` rather than executing. Do not treat 429 as a transport error.

## Minimum viable request

```bash
curl -sS https://api.clervo.dev/v1/search/free \
  -H 'content-type: application/json' \
  -d '{"query":"what is the x402 payment protocol","maxResults":3,"synthesize":false}' \
  -H 'idempotency-key: clervo-first-call-0001'
```

## Idempotency contract

- A key is 8 to 128 visible ASCII token characters.
- The same key with the same body replays the stored result and sets `idempotency-replayed: true`. No second execution, no second charge.
- The same key with a different body returns `409 idempotency_conflict`.
- If the free sample generates a key for you, it is returned in the `idempotency-key` response header. Keep it if you may need to replay.
- On an unknown settlement state, retry with the same key only. A new key authorizes a new charge.

## Discovery paths

- `/.well-known/clervo.json`
- `/openapi.json`
- `/catalog.json`
- `/capabilities.json`
- `/pricing.json`
- `/status.json`
- `/onboarding.json`
- `/llms.txt`

## Boundaries

- Raw cited Search, bounded paid AI chat, and bounded paid one-shot Secure Sandbox execution are publicly callable previews.
- The Sandbox has one qualified execution node; high availability, sessions, arbitrary images, network access, and public artifact retrieval are not claimed.
- Search synthesis, AI media, RPC, Prediction, and Crypto Intelligence remain unavailable.
- The Sandbox production origin, useful gVisor output, replay, and cleanup are verified; an owner-signed public paid Sandbox result remains pending.
- No external customer payment, revenue, or demand is claimed.
