# `@clervo/mcp`

Local stdio MCP server for Clervo's current Search client surface.

It exposes exactly two tools:

- `search_web` → `search.web`
- `search_answer` → `search.answer`

Set `CLERVO_BASE_URL` to the Clervo service boundary you intend to use. The
current public endpoint is `https://api.clervo.dev`.

```json
{
  "mcpServers": {
    "clervo": {
      "command": "npx",
      "args": ["-y", "@clervo/mcp"],
      "env": {
        "CLERVO_BASE_URL": "https://api.clervo.dev"
      }
    }
  }
}
```

The MCP package is intentionally narrower than Clervo's complete public
capability catalog. It never signs, pays, retries a payment, or converts a
payment-required response into success on the agent's behalf.

The package writes protocol messages to stdout and operational failures to
stderr only.

Known payment failures include the same bounded recovery actions as the SDKs.
Unknown settlement and payment timeouts remain blocked until the original
idempotency key is reconciled.