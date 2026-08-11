# Clervo Roadmap

**Outcome infrastructure for AI agents.**

> Give your agent a task. Get a verified result.

This is Clervo's **public product-direction roadmap**. It is intentionally not
an internal operations log, deployment runbook, recovery document, credential
index, payment ledger, or private planning authority.

Current lifecycle and availability must be established from **observed deployed
behavior** and the canonical catalog/launch-state data in this repository.
When prose disagrees with directly observed behavior, observed behavior wins.

## Product direction

Clervo is building a coherent execution layer for agents that need to discover
capabilities, understand cost and constraints, execute through external
infrastructure, handle paid execution where supported, and receive a result
with evidence appropriate to the job.

The capability layer spans:

- AI and model routing;
- Search;
- Secure Sandbox;
- Prediction Intelligence;
- Crypto Intelligence;
- Multi-chain RPC;
- MCP and agent-tool interfaces;
- machine-to-machine payment flows; and
- execution receipts, provenance, and verification.

**Buy outcomes. Not integrations.**

## Current public state

The following summary reflects the repository's canonical launch-state. Exact
serving operations, lifecycle labels, prices, constraints, and allowed claims
belong in the generated catalog and launch-state rather than being duplicated
here.

| Capability | Public state |
|---|---|
| Search | Publicly callable; bounded free access and owner-funded paid-outcome proof exist |
| AI | Publicly callable with 89 callable IDs (85 canonical models and 4 aliases), 88 currently sellable; owner-funded paid outcomes are verified for chat and image |
| Secure Sandbox | Publicly callable bounded one-shot execution with owner-funded paid-outcome proof; current release is intentionally single-node |
| Prediction Intelligence | Publicly callable paid outcomes have been verified with owner-funded production proof |
| Crypto Intelligence | Publicly callable paid outcomes have been verified for Ethereum and Base |
| Clervo Connect | Published Router CLI, MCP, TypeScript, Python, and local OpenAI-compatible proxy share one local wallet and commerce core; clean-machine owner-funded production proof is closed |
| Multi-chain RPC | Private core qualified; public availability remains blocked pending commercial-rights and lifecycle requirements |

Owner-funded production proof demonstrates bounded technical behavior. It is
**not** evidence of customer revenue, market demand, or unrelated-customer use.

### Delivered milestone: Clervo Connect v1 (B11) — CLOSED

The externally proven customer release consists of `@clervo/router@0.3.1`,
`@clervo/mcp@0.5.2`, `@clervo/sdk@0.5.2`, and `clervo-sdk==0.4.2`. Registry-only
clean-machine acceptance verified free-first use, one shared local wallet,
buyer-side spend limits, MCP, TypeScript, Python, and OpenAI-compatible access,
idempotent replay, and shared fail-closed reconciliation. The bounded proof made
exactly three owner-funded production payment effects totaling 0.005000 USDC.
That is engineering and commercial-path proof, not customer revenue or demand.

Continuation: B13.

### Delivered milestone: Clervo final website / distribution launch (B12) — CLOSED

The final public Clervo experience is deployed at <https://clervo.dev> with
the held B12 visual direction preserved and surgically completed across the
homepage, product families, model catalog, generated model pages, B11 customer
interfaces, proof surfaces, documentation, status, trust, and responsive
templates. The site is generated from the canonical catalog and launch-state,
ships a consistent Hollow Apex identity pack, and exposes sitemap, robots,
schema, OpenGraph, llms, RSS, MCP, and x402 discovery surfaces. Current model
inventory and availability remain generated facts rather than frozen roadmap
copy. Detailed release evidence is recorded outside this public direction
document.

Continuation: B13.

### Planned milestone: 10,000-Wallet Connect Scale Qualification (B15)

B15 will measure Clervo Connect with 10,000 synthetic, independently generated
self-custody wallets. The benchmark must report attempted and successful wallet
counts, the measured success rate, address uniqueness, permission safety,
free-first behavior, five-surface wallet identity, paid settlement and replay
results, reconciliation, throughput, latency, resource use, and every terminal
failure class. It must not describe synthetic wallets as customers, users,
revenue, adoption, or demand.

Local wallet qualification requires no USDC, ETH, funding, or production calls.
Any paid-production phase remains separately owner-authorized and progressively
ramped. Its planning budget, current price basis, facilitator-fee assumptions,
gas reference, safety gates, and required pre-run revalidation are recorded in
[`packages/catalog/connect-wallet-scale-benchmark-plan.v1.json`](packages/catalog/connect-wallet-scale-benchmark-plan.v1.json).
B15 remains planned and unexecuted until canonical evidence records the actual
numerators, denominators, costs, settlement effects, and accounting result.

## Roadmap themes

### Broaden reliable capability coverage

Expand the number of genuinely qualified operations and routes while preserving
fail-closed behavior when a provider, commercial permission, qualification, or
required dependency is unavailable.

### Strengthen agent execution

Improve the contract between agent intent and execution: capability discovery,
routing, bounded authorization, idempotent payment, safe retries, receipts,
provenance, and result verification.

### Harden public runtimes

Increase resilience and operational maturity of publicly callable services
without representing bounded or single-node systems as highly available before
the evidence supports that claim.

### Improve developer experience

Keep the public API, SDKs, MCP surface, generated catalog, documentation, and
examples aligned with the operations that are actually serving.

### Expand only with clear rights and evidence

Do not publish a capability merely because code exists. Public lifecycle changes
require technical qualification, an appropriate commercial/rights basis where
applicable, and evidence from the externally reachable system.

## Evidence standard

Clervo uses a deliberately strict claims boundary:

- source code presence is not public availability;
- a local test is not production proof;
- a quote is not a paid result;
- owner-funded proof is not customer demand or revenue;
- historical provider or competitor observations are not durable current facts;
- unsupported, expired, or unqualified routes fail closed rather than being
  represented as available.

Public product copy should derive status from the canonical registry and
launch-state, not from milestones, chat history, old screenshots, or archived
planning documents.

## Public-repository boundary

Operational material that would unnecessarily expose or couple production
operations does **not** belong in this public roadmap. That includes credential
or secret-version information, wallet material, private branch/recovery state,
rollback targets, deployment or worker identifiers, internal spending
authorizations, private supplier credentials, and incident-recovery details.

Security-sensitive reports should follow [`SECURITY.md`](SECURITY.md).

## Start here

- Repository: <https://github.com/clervo/clervo>
- Public API: <https://api.clervo.dev>
- Product site: <https://clervo.dev>
- Security: [`SECURITY.md`](SECURITY.md)
- Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md)

The roadmap will evolve as capabilities become externally proven. The permanent
rule is simpler: **represent what the system can actually do, and no more.**
