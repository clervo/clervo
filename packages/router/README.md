# @clervo/router

Buy verified machine work from the command line. One install, one command, a real
result before you create a wallet or spend anything.

```
npx @clervo/router search "World Wide Web"
```

That returns real search results. No signup, no API key, no wallet, no funding.
It is the same live endpoint paid calls use, on the free path.

## The order this is built around

Most agent-payment tools ask you to create a wallet and fund it before you learn
whether the thing works. This one is deliberately the other way round: the first
useful outcome happens first, and you only create a wallet when you have already
decided the paid product is worth it.

```
search        a real result, free, nothing installed but this package
catalog       what the live system actually sells right now
quote         the exact price of a call, without paying it
wallet create the dedicated payment wallet, once you want a paid product
run           pay for one call and get the receipted result
replay        fetch a settled result again, without paying twice
doctor        check the whole machine end to end
```

## Install

```
npm install -g @clervo/router     # then: clervo search "..."
npx @clervo/router search "..."   # or run it without installing
```

Node 20 or newer.

## A free result first

```
clervo search "World Wide Web"
clervo catalog --models
clervo quote search.web "World Wide Web"
```

`catalog` and `quote` read the deployed system, not a list baked into this
package. If a product is not being served right now, it is not offered, and the
price shown for a fixed-price product is the price the server quotes.

## Paying for something

```
clervo wallet create
```

This creates the one local wallet used by the Router CLI, MCP, the TypeScript
and Python SDKs, and the OpenAI-compatible proxy. It prints its recovery
phrase once. Write it down before continuing — it is the only way to recover the
wallet, and `clervo wallet backup` will show it again only after you confirm.

The wallet is stored at `~/.clervo/wallet.json`, readable only by you, and:

- `wallet create` never overwrites an existing wallet, funded or not.
- `wallet restore` refuses outright if the wallet being replaced holds a balance.
- Every command that loads the wallet re-checks the file permissions first.

Fund it with **USDC on Base mainnet**. Nothing else arrives:

```
clervo wallet address
clervo wallet balance
```

You do not need ETH. A Clervo payment is a signed USDC authorization that the
facilitator submits, so no gas is paid from your wallet.

Then buy one call:

```
clervo run search.web "World Wide Web"
```

Provider-neutral AI uses the same quote, receipt, history, replay, and spend
controls. Select only a stable ID published by the live catalog:

```
clervo catalog --models
clervo run ai.chat "Reply with ready" --model clervo/gpt-oss-20b
```

The catalog includes chat, embedding, image, speech, video, music, and virtual
try-on capabilities for SDK callers. This CLI version executes chat; it never
silently substitutes one canonical model ID for another.

You see the quoted price and confirm before anything is signed. What comes back
is the result plus a receipt.

## Not paying twice

Every paid call carries an idempotency key. Running the same key with the same
request again returns the stored result and does not authorize a second payment:

```
clervo run search.web "..." --key my-key-0001
clervo replay my-key-0001
clervo receipt my-key-0001
clervo history
```

`replay` sends no payment authorization at all, so it cannot charge you even if
the local record is wrong.

## When something is unclear

If a call fails after the payment was sent, whether it settled is genuinely
unknown. The router records that, refuses to spend again, and tells you to
reconcile:

```
clervo reconcile
```

Reconciliation asks the server what it knows, using a replay that carries no
payment authorization. Until it resolves, no new paid call is allowed. This is
deliberate: spending again on top of an unknown settlement is how a double charge
becomes invisible.

## Spend limits

Limits are enforced on your machine, against the quote, before anything is
signed. The server enforces its own ceiling, but that one is the seller's.

```
clervo limits
clervo limits set --per-operation 0.05 --daily 1.00
```

Defaults are 0.02 USDC per operation and 0.10 USDC per day.

## Checking the machine

```
clervo doctor
```

Reports the runtime, directory permissions, the API origin, whether the live
catalog is reachable, the wallet and its permissions and balance, the spend
limits, and whether anything is unreconciled. It never repairs anything on its
own — a tool that silently fixes a wallet is a tool that can silently replace
one.

## Local usage

Usage is computed from durable operation records and server receipts under
`CLERVO_HOME`; it is not a separate counter and never invents revenue.

```
clervo usage
clervo usage --json
```

The report includes calls by surface and family, free versus paid, authorized
and settled amounts, route/model identity, replayed/refused outcomes, today's
spend, and the unresolved-operation count.

## OpenAI-compatible clients

Start a loopback-only process:

```
clervo proxy
```

Point an ordinary OpenAI client at `http://127.0.0.1:8402/v1` and use any
placeholder API key its constructor requires. The placeholder and wallet key
are never sent to Clervo. Supported compatibility endpoints are
`GET /v1/models`, `POST /v1/chat/completions` (non-streaming and SSE), and
`POST /v1/embeddings`. The normalized upstream operation is synchronous, so
SSE begins after the verified result completes.

`/v1/responses`, image-generation and audio endpoints are not claimed because
the current normalized artifact contract cannot expose those OpenAI contracts
faithfully.

Auto-pay is disabled by default. Enable it only after reviewing the limits:

```
clervo limits
clervo proxy --auto-pay
```

Every proxy payment still uses the global limits and reconciliation freeze. A
canonical model ID is exact or the call fails; only a published alias may
route, and the actual model, operation, receipt and route remain visible in
`clervo` response metadata and `x-clervo-*` headers.

## Configuration

| Variable | Meaning |
| --- | --- |
| `CLERVO_HOME` | Where the wallet, limits, receipts, and operation records live. Default `~/.clervo`. Must be an absolute path. |
| `CLERVO_API_ORIGIN` | The API to talk to. Default `https://api.clervo.dev`. HTTPS, or loopback for local development. |
| `CLERVO_BASE_RPC_URL` | The Base RPC used to read balances. Default `https://mainnet.base.org`. |

Add `--json` to any command for machine-readable output.

## Other clients

Use `@clervo/sdk`, `clervo-sdk`, or `@clervo/mcp` when you need the normalized
multi-modality contract programmatically. All clients consume the same live
catalog and quote authority.

## Security

- The recovery phrase is written only to `~/.clervo/wallet.json` at mode `0600`,
  and is printed only by `wallet create` and by `wallet backup` after you
  confirm. It is never logged, never included in diagnostics, and never sent
  anywhere.
- Payments are USDC on Base mainnet via x402. The amount you approve is the
  maximum that can be taken for that call.
- Receipts and operation records are stored locally, under `CLERVO_HOME`.

## License

The distributed `@clervo/router` client package is MIT licensed. Use of
Clervo's hosted services remains subject to the applicable service terms.
