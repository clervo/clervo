> **Historical restoration notice (Gate 4.5):** This file preserves earlier
> project history at its original path. Its original status and instructions
> below are historical metadata only. It is not part of the active authority
> chain and cannot authorize work. The Gate 4.5 six-family correction controls
> every conflict.

# NPLAN.3 six-product core-first Clervo Platform decision

- **Status:** owner-authorized active forward product decision
- **Date:** 2026-08-01
- **Ticket:** NPLAN.3
- **Authority effect:** future program and release scope only

## Context

The owner directed a full-plan audit and a forward roadmap that completes all
six product cores before Clervo builds its common API/SDK/MCP, onboarding,
design, documentation, discovery, JSON-LD, sitemap, SEO, distribution,
deployment, and launch surfaces. This supersedes NPLAN.2's forward decision to
launch Live Intelligence first and add five pillars later.

The audit found one implemented pillar foundation, Search, while AI, Sandbox,
RPC, Prediction, and Crypto Intelligence service directories are empty. The
intended shared catalog, commerce, routing, observability, worker, MCP, and SDK
packages are also empty. `apps/site` contains only prototype Markdown and one
manually maintained scope JSON file; there is no production site, token system,
JSON-LD, sitemap, robots policy, or task-page system.

Clervo already has useful versioned contracts and deterministic generation,
but the current public generator is Search-specific, copies all schemas into
OpenAPI, and emits product records that are not conforming `CatalogEntry`
values. Lifecycle, release scope, and product narrative are repeated across
TypeScript, JSON Schema, site JSON, generated output, and prose. Building the
public shell before the five unknown product cores would freeze guesses or
cause repeated widening and redesign.

## Decision

The First Revenue Release becomes **Clervo Platform** (`clervo.platform`) and
requires all six stable pillars:

1. Live Intelligence / Search;
2. AI;
3. Secure Sandbox;
4. Universal multi-chain RPC;
5. Prediction-market Intelligence; and
6. Crypto Intelligence.

The old `fullPlatformExpansion` scope becomes a versioned pre-public
`productCore` gate. That gate is ready only when every pillar is independently
core-qualified, the public interfaces are frozen, and cross-pillar
compatibility is verified. Product-core readiness is private stabilization,
not availability, deployment, payment, demand, or launch.

All six pillars are assigned to the First Revenue Release. Current lifecycle
truth remains more conservative: Search is `preview`; the other five are
`unavailable`; every `coreQualified` value is false; both the product-core and
First Revenue Release gates are false. NPLAN.3 adopts the program but does not
claim that later-pillar implementation has begun.

## Build-once boundary

Each Stage 5–10 product core must still establish its own versioned wire
contracts, internal catalog candidates, lawful supplier/source qualification,
security, quality, degradation, latency, provider/infrastructure costs, hard
ceilings, mock commerce, replay/receipt behavior, operations, evidence, and
cleanup. Deferring those would produce unsafe code and more rework.

What waits until after the Stage 12 freeze is the shared public projection:

- generic HTTP routing and OpenAPI;
- MCP plus TypeScript and Python SDKs;
- raw examples and the bounded auto-payment client;
- public catalog and `/.well-known` discovery;
- one design system, site, docs, pricing, status, security, legal, and
  benchmark experience;
- `llms.txt`, JSON-LD, sitemaps, robots, canonical metadata, and task-oriented
  SEO/GEO/LLM pages; and
- packages, registries, GitHub, x402 discovery, and approved distribution.

One source controls each class of truth: human authority, versioned wire
schemas, a platform registry, approved evidence manifests, runtime status,
semantic design tokens, and reviewed legal/narrative prose. Public facts are
projected from those sources rather than independently hand-entered.

## Ordered future program

Completed Stages 0–4 keep their historical meaning. After Stage 4 passes, the
exact future order is:

1. Stage 5 — Live Intelligence productization and platform-registry
   foundation.
2. Stage 6 — AI product core.
3. Stage 7 — Secure Sandbox product core.
4. Stage 8 — Universal multi-chain RPC product core.
5. Stage 9 — Prediction-market Intelligence product core.
6. Stage 10 — Crypto Intelligence product core.
7. Stage 11 — Combined workflows and private six-product stabilization.
8. Stage 12 — Cross-pillar contract and product-core freeze.
9. Stage 13 — Shared access, design, onboarding, and distribution.
10. Stage 14 — Full-platform production hardening and deployment.
11. Stage 15 — Bounded real x402 settlement proof.
12. Stage 16 — External paid result and First Revenue Release.

Stage 13 may contain several bounded tickets, but every public projection must
consume the same Stage 12 frozen registry/contracts and approved evidence. A
stage heading is not implementation authorization.

## Preserved invariants

- NPLAN.1 and NPLAN.2 remain immutable historical decisions.
- Completed tickets, scores, failures, costs, cleanup, and journal entries are
  not reclassified or rewritten.
- Frozen, final, sealed, or once-only corpora, evaluators, implementations, and
  evidence remain immutable.
- Stable pillar and capability IDs remain unchanged; the umbrella release ID
  and scope wire shape change under version `2026-08-01.3`.
- Search must finish Stage 4 and earn reference-pattern authority before Stage
  5 begins.
- No later pillar becomes `preview`, `degraded`, or `available` without its own
  exact evidence and authorized lifecycle transition.
- Core Search retains USD 0 mandatory third-party general-Web provider API
  cost; infrastructure costs remain measured and capped.
- Cloud, IAM, deployment, provider, secret, production, payment, wallet, USDC,
  legacy, and destructive changes still require exact separate authority.
- The 0.03 USDC reserve stays untouched until Stage 15; owner-funded proof is
  plumbing evidence, never demand or revenue.

## Current ticket boundary

N4.27T was explicitly owner-authorized under its recorded scope and stop
conditions, then paused before implementation when the owner redirected this
session to NPLAN.3. This decision does not implement or widen N4.27T, close a
Stage 4 blocker, authorize Stage 5, or supply the missing exact cloud resource
and cost boundary for a future deployment.

## Rejected alternatives

- **Launch Live Intelligence, then add five products:** rejected because common
  API, SDK, MCP, site, discovery, docs, SEO, onboarding, and deployment would
  be repeatedly expanded or redesigned.
- **Build the public shell before product contracts settle:** rejected because
  it would freeze invented schemas, prices, routes, lifecycle, and UX.
- **Defer contracts, security, costs, and mock commerce with the public shell:**
  rejected because they are product correctness boundaries.
- **Treat roadmap adoption or private core completion as availability:**
  rejected because public access, deployment, settlement, external value, and
  launch remain independent gates.
- **Rewrite historical evidence to match the new plan:** rejected.

## Consequences

The first external launch moves later. In exchange, Clervo completes the six
real product cores first and builds its shared client, public, design,
discovery, deployment, and payment boundary once against a frozen compatible
platform. Future changes use versioning and deterministic regeneration instead
of independent redesign.
