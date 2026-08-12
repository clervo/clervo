# `@clervo/sdk`

Typed client for the live Clervo API. It exposes cited Search plus the complete
provider-neutral AI catalog and normalized AI execution contract.

```ts
import { ClervoClient } from '@clervo/sdk';

const clervo = new ClervoClient(); // https://api.clervo.dev
const catalog = await clervo.models.list();
const free = catalog.data.find((model) =>
  model.clervo.publicSellable && model.clervo.billingMode === 'free'
);
if (!free) throw new Error('no free model is currently available');

const result = await clervo.ai.execute({
  model: free.id,
  input: {
    kind: 'chat',
    messages: [{ role: 'user', content: 'Reply with the single word ready.' }],
    responseFormat: 'text',
    stream: false,
  },
  maximumOutputTokens: 16,
}); // the client generates a fresh key for this logical operation
```

`models.list()` returns stable canonical Clervo IDs and explicit alias
contracts, capabilities, health, availability, free/paid state, pricing, and
commerce metadata. `ai.execute()` accepts the normalized chat, embedding,
image, speech, video, music, and virtual-try-on inputs published by OpenAPI.
Canonical IDs are never silently substituted.

Paid models throw `ClervoPaymentRequiredError` with the server's exact challenge
by default. Enable Connect explicitly to use the same local wallet and commerce
core as the CLI, MCP, Python and OpenAI proxy:

```ts
const clervo = new ClervoClient({ connect: { autoPay: true } });
const result = await clervo.ai.execute(request); // fresh operation key by default
```

`autoPay` is false unless it is literally `true`. The shared core enforces the
global per-operation/daily limits before signing, freezes every surface after an
unknown settlement, persists receipts and history, and replays/reconciles with
no fresh authorization. Use `clervo.catalog`, `clervo.commerce`,
`clervo.wallet`, `clervo.limits`, `clervo.usage`, and `clervo.diagnostics` for
all currently served product families and local Connect state.

Search remains available through `clervo.search.web()`. The released
`clervo.search.answer()` compatibility method fails deterministically because
synthesis is not implemented. Known failures can be reduced to a bounded recovery
action with `recoveryActionFor(error)`. Unknown settlement and payment timeout
states prohibit retry until the original idempotency key is reconciled.

Set `baseUrl` only for another HTTPS deployment or loopback development. This
client code is MIT licensed; use of the hosted Clervo service remains subject
to its service terms.
