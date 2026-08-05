# Clervo

Clervo is outcome infrastructure for agents: **Find → Understand → Act**.

## Public preview

The protected public API is available at `https://api.clervo.dev`.

Current generated public operations include:

- `search.web` — live cited web results; maximum charge `0.006 USDC` on Base
- `ai.chat` — bounded qualified AI chat with request-derived pricing
- `sandbox.run` — bounded one-shot gVisor execution; maximum charge `0.120000 USDC`

`search.answer` synthesis and the remaining private product operations are not
currently public offers.

The active Shop-Open focus is `search.web`: synchronize every discovery and
buyer surface, complete the owner-approved production purchase, verify the
receipt and safe replay, and open distribution.

## Packages

- `@clervo/sdk` — TypeScript client
- `clervo-sdk` — Python client
- `@clervo/mcp` — MCP server backed by the TypeScript SDK

Clients require an explicit Clervo base URL and never silently sign or retry a
payment.

## Product truth

Current public truth is generated from the repository registry and
`packages/catalog/launch-state.v1.json`:

```sh
npm run generate:discovery
node ./scripts/verify-product-scope.mjs
```

Generated catalog, pricing, status, OpenAPI, MCP discovery, onboarding,
`llms.txt`, and the website must agree.

## Security

Never place credentials, wallet material, customer payloads, or authentication
files in issues, commits, or logs. Payment retries remain prohibited while
settlement is unknown.

This source is currently unlicensed (`UNLICENSED`).
