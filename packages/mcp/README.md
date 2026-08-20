# `@clervo/mcp`

Stdio MCP server for Clervo Connect. A clean one-command install uses the public
production origin and the same local wallet, limits, receipts and unresolved
operation state as every other Connect surface:

```json
{
  "mcpServers": {
    "clervo": { "command": "npx", "args": ["-y", "@clervo/mcp"] }
  }
}
```

Claude Code:

```sh
claude mcp add clervo -s user -- npx -y @clervo/mcp
```

The default origin is `https://api.clervo.dev`. Set `CLERVO_BASE_URL` only for
another HTTPS deployment or loopback development.

Use `--profile research|ai|prediction|crypto|sandbox|full` to load only the
schemas relevant to an agent. Profiles are checked against the live registry on
every execution, and unavailable operations are not exposed.

Alongside useful Search and AI tools, `clervo_execute` safely exposes operations
served in the selected profile. `connect_status`, `spend_limits`, `local_usage`,
`reconcile`, and `doctor` expose shared local state without wallet secrets.

Automatic payment is off by default. `--auto-pay` is an explicit local opt-in;
even then, every quote is bounded by the Router's per-operation and daily
ceilings before signing. Unknown settlement blocks MCP and every other Connect
surface. Reconciliation and same-key replay carry no fresh payment
authorization, and the server never blindly retries.

The package writes MCP protocol messages to stdout and operational failures to
stderr only. This client code is MIT licensed; use of the hosted Clervo service
remains subject to its service terms.
