# Full-platform revenue finish line

Updated 2026-08-04. This is the active implementation order for completing the
master roadmap. It does not reduce product scope, replace the master plan, or
create authorization gates. Work continues automatically around isolated owner
blockers.

The machine-readable readiness source is
`packages/catalog/full-platform-readiness.v1.json`.

## The two finish lines

### Revenue wedge

Raw `search.web` is publicly callable, returns useful cited output through the
production path, exposes an exact 0.006 USDC Base x402 offer, and one external
customer pays once. This begins truthful revenue but does not complete or launch
the six-product Clervo Platform.

### Full Platform First Revenue Release

All six pillars are customer-functional and all fifteen master-plan section 3.1
gates pass, including one external customer receiving and paying for a useful
result. This is the only finish line that permits the complete platform launch
claim.

## Customer-functional definition

A private core, schema, adapter, package, 402 response, or owner-funded proof is
not a customer-functional product. Every released pillar needs all eight:

1. Complete customer input, output, error, limit, and provenance contracts.
2. Qualified, commercially permitted, cost-bounded production supply.
3. A useful production runtime with safe degradation and exact identity.
4. Protected public access with private-path and unsupported-route denial.
5. Price, quote, x402 and MPP verification/settlement, and no-charge replay.
6. Durable operations, receipts, accounting, reconciliation, and artifacts.
7. Monitoring, quotas, cost stops, abuse controls, recovery, rollback, and
   supportable capacity.
8. External acceptance through the exact public path.

## Honest readiness snapshot

The customer-functional score is 58.33%, calculated from the eight gates above:
complete is 1, partial is 0.5, and missing or blocked is 0. It measures release
readiness, not code volume or effort remaining.

| Pillar | Readiness | Current reality |
| --- | ---: | --- |
| Search | 87.50% | The required-secret public edge, supply, x402, durability, operations, and external public smoke are proven; the first external paid customer remains. |
| AI | 75.00% | Chat, embedding, image, speech, durable private artifacts, public x402/MPP challenges, and current production supply pass; the product-specific paid result/replay and external acceptance remain. |
| Secure Sandbox | 75.00% | Private gVisor execution, durable replay, public x402/MPP challenges, cleanup, and bounded production capacity pass; the product-specific paid result/replay and external acceptance remain. |
| RPC | 37.50% | Private gateway behavior is complete; commercial supply rights and every public-release layer remain. |
| Prediction | 37.50% | Private normalized intelligence works; commercial reuse/history rights and every public-release layer remain. |
| Crypto Intelligence | 37.50% | Private read-only intelligence works; commercial data rights and every public-release layer remain. |

Shared engineering is further advanced than 47.92%, but shared infrastructure
cannot make an unavailable product customer-functional.

## Documentation gaps this plan closes

1. The master plan's header still contains an obsolete Stage 5 snapshot and
   ticket-era authorization language. Its scope and finish gates remain
   authoritative; `CURRENT-ENGINEERING-STATE.md` controls current status.
2. Private six-product core completion was not clearly separated from public,
   payable customer functionality.
3. The production release exposes Search, four AI product kinds, and Sandbox;
   RPC, Prediction, Crypto, and their remaining operations stay internal.
4. Published TypeScript, MCP, and Python clients expose only Search and do not
   implement bounded signing or automatic payment retry.
5. The deployed API serves Search, AI, and Sandbox through the shared commerce
   gateway; RPC, Prediction, and Crypto are not yet public.
6. RPC, Prediction, and Crypto lack product-specific public x402, receipts,
   production operations, and external acceptance. AI and Sandbox still lack
   their final real paid-result acceptance.
7. RPC, Prediction, and Crypto have explicit supplier-rights blockers; hiding
   those blockers behind private-core completion created a false sense of
   readiness.
8. There was no single ordered path that allowed Search revenue first while
   continuing toward the non-negotiable six-product finish line.

## Continuous execution order

### 1. Put raw Search into revenue service

The public runtime portion completed on 2026-08-04. Only the external paid
customer result remains for the revenue wedge.

- Preserve the verified required-secret Cloudflare edge, public lifecycle,
  discovery, exact 0.006 USDC offer, direct-origin denial, and rollback target.
- Continue bounded monitoring, cost-ceiling, and failure checks while public.
- Accept one external 0.006 USDC payment, reconcile it, and prove no-charge
  replay. Do not repeat the owner-funded proof.

### 2. Build the shared six-product public gateway and commerce layer

- Generalize the Search-specific public operation path into a versioned product
  router without changing frozen request, quote, receipt, or replay semantics.
- Bind every released operation to one price version, maximum charge, supplier
  cost ceiling, idempotency key, durable state machine, receipt, and accounting
  entry.
- Publish both x402 and MPP on every payable operation. An unpaid probe must
  receive both protocol-native challenge headers before body validation; both
  protocols must bind the same price, receiver, request, replay state, useful
  output, settlement ledger, and receipt semantics.
- Add async operation and artifact delivery for long-running media and Sandbox
  work; use private R2 storage, scanning, bounded signed retrieval, expiry, and
  cleanup.
- Keep unsupported operations disabled in registry, OpenAPI, SDK, MCP, and edge
  routing until their complete gate passes.
- Add an explicit caller-supplied signer interface to the clients. Clients may
  inspect and approve a quote, but never read or store a wallet key, silently
  sign, or retry an unknown settlement.

### 3. Launch AI

Production runtime, qualified supply, public access, durable media delivery,
and dual-protocol challenges completed on 2026-08-04. Product-specific paid
result/replay acceptance remains for the final consolidated proof.

- Refresh qualifications for at least three independent lawful supply families
  and disable expired, substituted, unhealthy, or accounting-unknown routes.
- Protect the existing `ai.clervo.dev` gateway; use it only as an upstream exact
  route and never reconfigure or expose its runtime.
- Release `ai.chat`, `ai.embed`, `ai.image`, and `ai.speech` with exact model
  identities plus the stable aliases required by the master plan.
- Reconcile input, cached-input, output, reasoning, image, and character usage
  against route-specific prices and shadow budgets.
- Store generated media through the bounded artifact plane; never return fake
  success or unscanned arbitrary provider URLs.
- Qualify failover, route identity, quality, quota exhaustion, cost stops,
  x402, receipts, replay, monitoring, and external output.

### 4. Launch Secure Sandbox

Private execution, public access, bounded commerce challenges, durable replay,
cleanup, and single-node production capacity completed on 2026-08-04.
Product-specific paid result/replay acceptance remains for the final
consolidated proof.

- Put the existing private gVisor controller behind the shared public operation
  gateway without exposing its control endpoint or credentials.
- Add fixed maximum-charge quotes, admission/abuse policy, customer quotas,
  artifact scanning/retrieval, and durable session cleanup.
- Preserve no-network defaults, metadata/secret/host denial, strict resource
  ceilings, unknown-execution quarantine, and no automatic side-effect retry.
- Obtain enough quota or reduce committed capacity so the release has an honest
  supportable concurrency and recovery posture.
- Pass public execution, replay, kill-switch, orphan cleanup, monitoring, load,
  and rollback acceptance.

### 5. Launch RPC

- Keep customer routing disabled until terms-compatible multichain supply is
  documented. Continue integration and source qualification in parallel.
- Release tested chains and methods only; publish exact archive/debug/broadcast
  coverage rather than a universal count claim.
- Connect reads, batches, health, archive, and tightly controlled broadcast to
  public pricing, x402, receipts, caching, failover, and durable broadcast
  reconciliation.
- Prove stale/fork removal, unsafe-method denial, failover, and no rebroadcast
  on replay.

### 6. Launch Prediction Intelligence

- Qualify commercial reuse, resale, and retained-history rights before customer
  routing or history storage.
- Connect normalized markets, comparisons, history, and signals to public
  pricing, commerce, durable retention, and source-independent degradation.
- Prove freshness, resolution provenance, false-merge rejection, venue outage,
  and external useful output.

### 7. Launch Crypto Intelligence

- Qualify commercially permitted EVM, Solana, wallet, token, transaction, and
  protocol supply before customer routing.
- Connect the existing read-only normalization gateway to public pricing,
  commerce, receipts, durability, and independent source degradation.
- Preserve missing values, conflicts, field provenance, freshness, careful risk
  language, and the prohibition on custody, signing, submission, and trading.

### 8. Freeze and distribute the full-platform release

- Create a new versioned release candidate; never mutate the historical private
  freeze or its evidence.
- Freeze the exact six-product public operation set, schemas, prices,
  lifecycle, examples, clients, and compatibility hashes.
- Expand and republish TypeScript, Python, MCP, raw HTTP, OpenAPI, catalog, and
  discovery from that one frozen registry.
- Run cross-client installation, request, payment approval, result, receipt,
  replay, recovery, and unsupported-operation conformance.

### 9. Complete production acceptance and First Revenue Release

- Build and scan the exact full-platform image and media/artifact workers.
- Apply only required migrations and deploy through zero-traffic candidates.
- Run consolidated security, provider failure, load, cost, accounting,
  reconciliation, backup/restore, kill-switch, rollback, and external-smoke
  checks across all six pillars.
- Verify every master-plan section 3.1 gate and one external paid useful result.
- Only then mark the complete Clervo Platform First Revenue Release finished.

## Isolated owner blockers

- Provider account, written commercial permission, or quota interaction when
  no terms-compatible technical alternative exists.
- Any real customer or owner wallet signature; unknown settlement always stops
  new authorization until reconciliation.
- The external payer needed for the final demand proof.

None of these blockers pauses independent gateway, commerce, runtime, adapter,
client, test, or operations work for the other pillars.
