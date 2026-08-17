# Clervo

Clervo lets software use AI models and agent tools with pay-per-use x402 payments, without managing separate provider accounts or API keys.

The public API is `https://api.clervo.dev`. Current products include AI, Web Search, Secure Sandbox, Prediction Intelligence, and Crypto Intelligence. Multi-chain RPC is not currently available through the public API.

## Start

Make a free AI call:

```sh
curl -sS https://api.clervo.dev/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"clervo/laguna-s-2.1","messages":[{"role":"user","content":"Reply with ready."}],"max_completion_tokens":16}'
```

Connect Claude Code through MCP:

```sh
claude mcp add clervo -s user -- npx -y @clervo/mcp
```

Or choose another supported path at [clervo.dev/start](https://clervo.dev/start/):

- [`@clervo/sdk`](packages/sdk-typescript) for TypeScript
- [`clervo-sdk`](packages/sdk-python) for Python
- [`@clervo/mcp`](packages/mcp) for Claude and other MCP clients
- [`@clervo/router`](packages/router) for the CLI and local OpenAI-compatible proxy
- [OpenAPI](https://api.clervo.dev/openapi.json) for direct HTTP

The hosted API supports OpenAI Chat Completions at `POST /v1/chat/completions`, OpenAI Responses at `POST /v1/responses`, Anthropic Messages at `POST /v1/messages`, and the native Clervo route at `POST /v1/ai/execute`.

## Payment safety

Free operations require no wallet. Paid operations return HTTP 402 with the maximum price before execution. Clervo clients keep automatic payment off by default and support per-operation limits, daily limits, receipts, reconciliation, and same-key replay without a second payment.

Payment uses USDC on Base through x402 or MPP. If settlement is unknown, retry only after reconciliation; never create a new authorization just to recover an uncertain request.

Current products, model availability, routes, and prices are machine-readable:

- [Discovery](https://api.clervo.dev/.well-known/clervo.json)
- [Models](https://api.clervo.dev/v1/models)
- [Pricing](https://api.clervo.dev/pricing.json)
- [Status](https://api.clervo.dev/status.json)
- [MCP discovery](https://api.clervo.dev/.well-known/mcp.json)
- [x402 manifest](https://api.clervo.dev/.well-known/x402)
- [Agent reference](https://api.clervo.dev/llms.txt)

## Work with the repository

The repository requires Node.js `24.18.1` and npm `10.9.8`.

```sh
npm ci --ignore-scripts
npm run generate:discovery
npm run test:b13:clients
npm run site:build
```

Never place credentials, wallet material, customer payloads, or authentication files in issues or commits. Report security concerns through the repository's private vulnerability-reporting channel.

This source is currently unlicensed (`UNLICENSED`). No permission to copy, modify, or redistribute is granted unless Clervo publishes separate terms.
