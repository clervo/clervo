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
| AI | Preview-callable; qualified requests can expose an exact payment quote; paid-result proof remains pending |
| Secure Sandbox | Publicly callable bounded one-shot execution with owner-funded paid-outcome proof; current release is intentionally single-node |
| Prediction Intelligence | Publicly callable paid outcomes have been verified with owner-funded production proof |
| Crypto Intelligence | Publicly callable paid outcomes have been verified for Ethereum and Base |
| Multi-chain RPC | Private core qualified; public availability remains blocked pending commercial-rights and lifecycle requirements |

Owner-funded production proof demonstrates bounded technical behavior. It is
**not** evidence of customer revenue, market demand, or unrelated-customer use.

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
