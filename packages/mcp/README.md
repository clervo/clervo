# `@clervo/mcp`

Stdio MCP server for the live Clervo API. It exposes four bounded tools:

- `search_web` → raw cited Search;
- `search_answer` → cited synthesis;
- `models_list` → the authoritative provider-neutral AI catalog;
- `ai_execute` → normalized free execution or an exact paid challenge.

```json
{
  "mcpServers": {
    "clervo": {
      "command": "npx",
      "args": ["-y", "@clervo/mcp"]
    }
  }
}
```

The default origin is `https://api.clervo.dev`. Set `CLERVO_BASE_URL` only for
another HTTPS deployment or loopback development.

`models_list` publishes stable IDs, capabilities, health, availability,
free/paid state, pricing, and commerce metadata. `ai_execute` can run a free
model. For a paid model it returns the exact `402` challenge as an MCP error; it
never creates a wallet, signs, pays, or retries a payment on the agent's behalf.
Use a stable idempotency key for safe recovery.

The package writes MCP protocol messages to stdout and operational failures to
stderr only. This client code is MIT licensed; use of the hosted Clervo service
remains subject to its service terms.
