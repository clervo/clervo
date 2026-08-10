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
}, { idempotencyKey: 'my-stable-request-0001' });
```

`models.list()` returns stable canonical Clervo IDs and explicit alias
contracts, capabilities, health, availability, free/paid state, pricing, and
commerce metadata. `ai.execute()` accepts the normalized chat, embedding,
image, speech, video, music, and virtual-try-on inputs published by OpenAPI.
Canonical IDs are never silently substituted.

Paid models throw `ClervoPaymentRequiredError` with the server's exact
`PAYMENT-REQUIRED` challenge. The SDK never creates a wallet, signs, pays, or
retries a payment automatically. A caller may deliberately pass an approved
`paymentSignature` or `paymentAuthorization`; same-key replay returns the same
receipted result without another authorization.

Search remains available through `clervo.search.web()` and
`clervo.search.answer()`. Known failures can be reduced to a bounded recovery
action with `recoveryActionFor(error)`. Unknown settlement and payment timeout
states prohibit retry until the original idempotency key is reconciled.

Set `baseUrl` only for another HTTPS deployment or loopback development. This
client code is MIT licensed; use of the hosted Clervo service remains subject
to its service terms.
