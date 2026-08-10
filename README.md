# Clervo

**Outcome infrastructure for AI agents.**

> Give your agent a task. Get a verified result.

Clervo is being built as a unified execution layer for agents that need to discover capabilities, route work, execute through providers, handle paid execution when supported, and receive results with clear execution evidence.

**Buy outcomes. Not integrations.**

Instead of wiring every model, search provider, sandbox, RPC, or paid tool independently, agent builders can work toward one coherent capability layer. Clervo's product direction spans AI, Search, Secure Sandbox, Prediction, Crypto Intelligence, Multi-chain RPC, and the routing infrastructure that connects them.

## Current public availability

Today, this repository exposes two preview operations:

- `search.web`
- `search.answer`

These are repository-local preview surfaces. **No public callable deployment or payable route is currently verified.** The SDKs require an explicit base URL, and they never sign, pay, or retry a payment automatically.

Other Clervo product cores and combined workflows are implemented and qualified privately. Their customer lifecycle and public availability remain controlled by the canonical registry and current evidence; source code or a package archive does not make a capability production-ready.

## For developers

The public repository includes:

- [`@clervo/sdk`](packages/sdk-typescript) — typed TypeScript client
- [`clervo-sdk`](packages/sdk-python) — dependency-free Python client
- [`@clervo/mcp`](packages/mcp) — stdio MCP server backed by the TypeScript SDK

The current versions are published with registry provenance: `@clervo/sdk` and `@clervo/mcp` at `0.3.0`, and `clervo-sdk` at `0.2.0`. Older registry versions are preserved as history and carry deprecation guidance where their claims are stale. Package publication does not make the API publicly callable.

## Try the repository locally

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

Clervo separates implemented capability from public availability. Product contracts and lifecycle records are the source of truth, and public claims should follow current evidence rather than source-code presence alone.

Never place credentials, wallet material, customer payloads, or authentication files in issues or commits. Security concerns can be reported through the repository's private security-reporting channel.

This source is currently unlicensed (`UNLICENSED`). No permission to copy, modify, or redistribute is granted unless Clervo publishes separate terms.