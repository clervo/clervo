# Clervo

Clervo is outcome infrastructure for agents: **Find → Understand → Act**.

This repository contains the clean-room Clervo platform, frozen distribution
candidate, TypeScript and Python clients, MCP server, and the repository-local
V6 product experience.

## Current public boundary

The distribution candidate exposes two frozen operations:

- `search.web`
- `search.answer`

They are repository-local preview surfaces. No public callable deployment or
payable route is currently verified. The SDKs require an explicit base URL, and
they never sign, pay, or retry a payment automatically.

The other Clervo product cores and combined workflows are implemented and
qualified privately. Their customer lifecycle and public availability remain
controlled by the canonical registry and current evidence; source code or a
package archive does not make a capability production-ready.

## Packages

- [`@clervo/sdk`](packages/sdk-typescript) — typed TypeScript client
- [`clervo-sdk`](packages/sdk-python) — dependency-free Python client
- [`@clervo/mcp`](packages/mcp) — stdio MCP server backed by the TypeScript SDK

The current versions are published with registry provenance: `@clervo/sdk` and
`@clervo/mcp` at `0.3.0`, and `clervo-sdk` at `0.2.0`. Older registry versions
are preserved as history and carry deprecation guidance where their claims are
stale. Package publication does not make the API publicly callable.

## Local verification

The repository is pinned to Node.js `24.18.1` and npm `10.9.8`.

```sh
npm ci --ignore-scripts
npm run test:stage13:clients
npm run test:stage13:site
```

The site can then be previewed locally:

```sh
npm run site:preview
```

## Security and product truth

Product contracts and lifecycle records are the source of truth. Never place
credentials, wallet material, customer payloads, or authentication files in
issues or commits. Security concerns can be reported through the repository's
private security-reporting channel once the canonical GitHub repository is
public.

This source is currently unlicensed (`UNLICENSED`). No permission to copy,
modify, or redistribute is granted unless Clervo publishes separate terms.
