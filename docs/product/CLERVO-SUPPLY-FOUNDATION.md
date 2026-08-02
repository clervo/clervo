# Clervo supply foundation — active project

## Status and priority

This is Clervo's active engineering priority. The product roadmap is paused
until this one-time supply foundation is complete. Continue automatically
through this project; its rows and phases are a checklist, not authorization or
stop boundaries.

The master plan remains product-scope authority. Its asset-inventory workflow
requires a redacted row for every credential, account, token, provider, and
credit. No secret values may enter this document, source, logs, or reports.

## Objective

Inventory, qualify, benchmark, price, and select every usable Clervo supply
asset across AI, search, RPC, blockchain data, storage, identity, notifications,
CDP/x402, and other required infrastructure. Then research additional
zero-owner-cash sources, fill material coverage or resilience gaps, implement
provider-neutral primary/fallback routing, and only then resume the roadmap.

Customer service is paid. Existing balances, credits, and recurring free
allocations may back early volume, but are not passed through free to customers.
Positive margin is not required at launch, and unknown supplier debit does not
block customer pricing. Real owner-cash spend or automatic paid overage remains
disabled without explicit owner approval.

## Non-negotiable product rules

- Publish model/service identities, never upstream provider or credential names.
- Assign a competitive customer price to every owned asset, including assets
  with unknown supplier cost; track supplier cost separately as shadow risk.
- Never label an untested, failed, preview, unavailable, or terms-blocked asset
  production-ready. Pricing and qualification are independent states.
- Rank tested assets `best`, `good`, `poor`, or `rejected`; retain a working
  lower-quality asset only for an appropriate disclosed use case.
- Bind every capability to a primary route, terms-compatible fallback routes,
  rate limits, allowance/runway, health checks, circuits, backpressure, and hard
  cost stops. Never silently downgrade an exact-model request.
- Multiple accounts may improve resilience only when provider terms allow the
  account structure; never pool accounts to evade a limit.
- Prefer the best current technical route. Replace promotional/free suppliers
  with official paid providers when revenue makes that sustainable.

## Preserved completed work

- Redacted legacy manifest: 463 lines and 217 unique assignments. The prior
  inventory's `470`/`167` counts were stale and were repaired by the environment
  reconciliation without reading or recording secret values.
- The current Clervo environment contributes two additional unique names for
  the `ai.clervo.dev` gateway, bringing the reconciled total to 219 with zero
  unmapped names.
- `ai.clervo.dev/v1`: working; `gpt-5.6-luna`, `gpt-5.6-terra`, and
  `gpt-5.6-sol` are priced, benchmarked, qualified, and cataloged.
- Google Vertex: reported USD 1,700 credit; qualified chat, embedding, image,
  and video routes; speech and exact credit expiry/guard remain incomplete.
- Deepgram: reported USD 200 balance; qualified two TTS routes and Nova-3 STT,
  with its preserved jargon limitation.
- Groq: 15 authenticated assets priced; GPT-OSS 20B, GPT-OSS 120B, and Qwen
  3.6 27B qualified; remaining modalities/assets still need qualification.
- Owned-source discovery: one credential per service exposed 633 listings and
  615 unique exact IDs across the Chinese gateway, Cerebras, Cohere, Mistral,
  NVIDIA, OpenRouter, SambaNova, SiliconFlow, and Z.AI. Google direct returned
  HTTP 400 and GitHub Models HTTP 410; both failures remain explicit.
- Chinese gateway: all 21 discovered assets are customer-priced, but the five
  representative chat routes failed exact-identity checks despite HTTP 200.
  Only account 1 was used; the other nineteen remain untouched pending terms.
- Every one of the 612 other newly discovered owned-source listings has an
  introductory customer price. Cerebras discovery works, but all three models
  returned HTTP 402 and remain unavailable without a usable balance.
- NVIDIA's 102 hosted listings remain priced and four exact identities were
  benchmarked, but the API Catalog trial is non-production under its current
  terms. It is benchmark-only, not sale supply; self-hosted weights are separate.
- SambaNova's six assets are priced against published supplier rates. Five
  passed exact-identity checks; Gemma 4 31B and GPT-OSS 120B scored 9/10. The
  sixth returned HTTP 402. Current cloud terms prohibit resale/service-bureau
  use without written consent, so all remain internal evidence, not sale supply.
- Z.AI's eight discovered GLM chat assets are priced from current official API
  rates and its developer terms permit downstream end-user integration. The
  account currently returns business error 1113 for every inference request,
  meaning no usable balance/resource package; routes remain unavailable.
- SiliconFlow's 73 discovered multimodal assets remain customer-priced, but its
  current terms prohibit commercial use, third-party benefit, resale/service
  bureau use, competitive products, and benchmarking. No inference balance was
  spent; every route is excluded from customer supply.
- Cohere's 31 chat, vision, embedding, reranking, and transcription assets are
  priced. Eight chat preflights all hit the exhausted monthly trial limit before
  inference. Trial use is evaluation-only; a production key is suitable for a
  public application but needs later billing approval and qualification.
- Mistral's 52 assets are priced and its Free-mode evaluation path is healthy:
  seven exact chat identities, Medium 2604 at 8/10, valid text/code embeddings,
  working OCR, and a TTS-to-STT loop recovering 9/9 words. Commercial Customer
  Offerings are permitted, but production needs owner-approved Scale billing.
- OpenRouter's 337 listings, including 14 free variants, remain priced for
  comparison. The key is free-tier with zero credits. Current terms prohibit
  reselling model API access or a competing service, so no inference was run and
  every listing is excluded from Clervo customer routing.
- GitHub Models was globally retired on 2026-07-30 and is now archived supply;
  its HTTP 410 is definitive, not a token defect. The direct Gemini credential
  returns API_KEY_INVALID, while qualified Vertex preserves Google coverage.
- Serper search is healthy under the owned key: five fixed-corpus calls all
  returned ten results with the expected official host ranked first and 765 ms
  p95 latency. Its single-account B2B terms allow a value-added product, the
  route is customer-priced at USD 0.001/request, and its current remaining
  starter balance is unknown because the API exposes no allowance header.
- Helius Solana RPC is technically healthy across bounded health, version,
  finalized-slot, and safe-failure checks, with no transaction activity. Its
  one-million-credit Free allocation is useful only for internal evaluation:
  current terms prohibit resale and third-party benefit, so the competitively
  priced route remains terms-blocked pending permission or replacement supply.
- The public RPC mesh contains 32 configured routes across 14 chains. Strict
  HTTPS, DNS, redirect, and host checks followed by read-only identity/height
  probes found 20 healthy routes covering 13 chains and seven chains with at
  least two working reads. Fantom has no survivor. All routes are priced while
  per-provider terms and production reliability remain under review.
- Cloudflare: 61 authenticated non-experimental assets priced; two GPT-OSS
  routes are fully qualified, and five embedding/image/speech assets passed
  bounded execution with their remaining integration gaps recorded. Three
  paid-plan assets remain unavailable under the zero-cash guard.
- QuickAI and TongKhokr are retired and must not return to active supply.
- Current qualified internal catalog: 17 exact routes across Clervo gateway,
  Google Vertex, Deepgram, Groq, and Cloudflare.

Canonical machine-readable state lives in:

- `packages/catalog/external-supply-inventory.v1.json`
- `packages/catalog/ai-model-catalog.v1.json`
- `packages/catalog/ai-*-pricing.v1.json`
- `docs/evidence/stage6/`

## Remaining execution order

1. Reconcile every redacted environment name to a service/account/credit or an
   explicit non-supply configuration category. Record gaps; forget nothing.
2. Finish owned AI sources: Cloudflare, the 20-account Chinese gateway,
   Cerebras, Cohere, Gemini direct, GitHub Models, Mistral, NVIDIA, OpenRouter,
   SambaNova, SiliconFlow, ZAI, and every additional credential discovered.
3. Benchmark by capability: general chat, reasoning, code, tools/JSON, vision,
   OCR, embeddings, reranking, image, video, STT, TTS, latency, stability, and
   safe failure. Compare all routes against the Clervo GPT baseline.
4. Qualify non-AI supply: owned Search plus Serper, Helius and every RPC chain,
   Zerion, R2/storage, identity, notifications, CDP/x402/facilitator, and every
   remaining product dependency. Never perform a real settlement in this work.
5. Produce the final provider-neutral supply matrix: exact public asset,
   lifecycle, customer price, shadow cost, quota/runway, quality rank, primary,
   fallbacks, health method, terms, secret location, and replacement plan.
6. Perform a final market gap evaluation before resuming the roadmap. Research
   BlockRun's current coverage and additional easy-setup, generous-credit or
   recurring-free APIs—including the owner-mentioned Omni/2B source. Source
   more only when it closes a material capability, quality, regional,
   availability, rate-limit, or runway gap. Record why each source is added or
   rejected.
7. Run one consolidated supply-foundation test, resolve meaningful failures,
   commit the final matrix/routing state, and resume the master roadmap.

## Completion criteria

This project is complete only when every environment asset is accounted for,
every usable asset is priced, important routes have honest benchmark and terms
states, all required product capabilities have resilient bounded supply, and
the final sourcing-gap evaluation concludes either that coverage is sufficient
or that every material missing source has been added or explicitly owner-blocked.
