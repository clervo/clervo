# `@clervo/mcp`

Local stdio MCP server for Clervo's repository-local preview interface.

It exposes exactly two tools:

- `search_web` → `search.web`
- `search_answer` → `search.answer`

Set `CLERVO_BASE_URL` to an explicitly selected Clervo preview endpoint. No
public deployment is assumed. The tools never sign, pay, retry payment, or
convert a non-payable `402` challenge into success.

```json
{
  "mcpServers": {
    "clervo": {
      "command": "npx",
      "args": ["-y", "@clervo/mcp"],
      "env": {
        "CLERVO_BASE_URL": "http://127.0.0.1:8080"
      }
    }
  }
}
```

The package writes protocol messages to stdout and operational failures to
stderr only.

Known future payment failures include the same single recovery action as both
SDKs. The server never performs that action, signs, pays, or retries on the
agent's behalf. Unknown settlement and payment timeouts remain blocked until
the original idempotency key is reconciled.