# Clervo

**Outcome infrastructure for AI agents.**

> Give your agent a task. Get a verified result.

Clervo is an execution layer for agents that need to discover capabilities, route work, execute through external infrastructure, handle paid execution when supported, and receive results with explicit evidence and cost boundaries.

**Buy outcomes. Not integrations.**

Instead of wiring every model, search provider, sandbox, data source, RPC, or paid tool independently, agent builders can work through one coherent capability layer. Clervo's product direction spans AI, Search, Secure Sandbox, Prediction, Crypto Intelligence, Multi-chain RPC, and the routing infrastructure that connects them.

## Current public state

Clervo keeps product direction separate from observed availability. The canonical launch state currently records:

| Capability | Public state |
| --- | --- |
| Search | Publicly callable; bounded free entry and paid Base USDC execution verified |
| AI | Publicly callable through the current canonical IDs and stable aliases published by `/v1/models`; owner-funded paid outcomes are verified for chat and image |
| Secure Sandbox | Publicly callable paid one-shot execution verified; intentionally bounded single-node release |
| Prediction Intelligence | Publicly callable paid outcomes verified |
| Crypto Intelligence | Publicly callable paid outcomes verified for Ethereum and Base |
| Multi-chain RPC | Private core qualified; public availability and commercial rights remain blocked |

Paid-outcome evidence currently comes from bounded owner-funded production proof. **No customer revenue, market demand, or external-customer payment is claimed.** Lifecycle state is generated from the canonical registry and current evidence rather than inferred from source-code presence.

Public endpoint: `https://api.clervo.dev`

## For developers

The public repository includes:

- [`@clervo/sdk`](packages/sdk-typescript) — typed TypeScript client for the current Search client surface
- [`clervo-sdk`](packages/sdk-python) — dependency-free Python client for the current Search client surface
- [`@clervo/mcp`](packages/mcp) — stdio MCP server backed by the TypeScript SDK
- machine-readable discovery, capability, pricing, status, onboarding, and OpenAPI artifacts generated from the product registry

The published client packages remain narrower than the complete public capability catalog: package support does not imply every public operation is exposed through every client.

## Try Clervo

The current TypeScript client requires an explicit base URL:

```ts
import { ClervoClient } from '@clervo/sdk';

const clervo = new ClervoClient({ baseUrl: 'https://api.clervo.dev' });
const result = await clervo.search.web({ query: 'agent payment idempotency' });
```

For the exact operations, prices, payment boundary, lifecycle state, and failure contracts that are serving now, use the generated public catalog and OpenAPI artifacts rather than a hard-coded marketing claim.

## Work with the repository

The repository is pinned to Node.js `24.18.1` and npm `10.9.8`.

```sh
npm ci --ignore-scripts
npm run test:stage13:clients
npm run test:stage13:site
```

Then preview the site locally:

```sh
npm run site:preview
```

## Why trust the boundary

Clervo separates implementation, qualification, public availability, commercial proof, and market proof. A capability is not presented as live merely because code exists, and owner-funded proof is not presented as customer adoption.

Never place credentials, wallet material, customer payloads, or authentication files in issues or commits. Security concerns should use the repository's private vulnerability-reporting channel.

This source is currently unlicensed (`UNLICENSED`). No permission to copy, modify, or redistribute is granted unless Clervo publishes separate terms.
