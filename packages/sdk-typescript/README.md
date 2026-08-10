# `@clervo/sdk`

Typed TypeScript client for Clervo's current Search client surface.

Current package scope is deliberately narrow:

- `search.web` and `search.answer`;
- explicit free or challenge execution modes;
- typed payment-required failures;
- idempotency and request cancellation;
- no wallet, signer, automatic payment, or payment retry.

The public Clervo endpoint is `https://api.clervo.dev`. The client still requires
an explicit `baseUrl` so callers choose the service boundary deliberately.

```ts
import { ClervoClient } from '@clervo/sdk';

const clervo = new ClervoClient({ baseUrl: 'https://api.clervo.dev' });
const result = await clervo.search.web({ query: 'agent payment idempotency' });
```

`search.answer` sets synthesis explicitly. Callers cannot silently change the
product identity through the request body.

The published SDK does not yet represent every product family in Clervo's
public capability catalog. Use the current catalog and OpenAPI artifacts for the
full observed operation set.

Known payment failures can be reduced to one bounded next action without
triggering a payment or retry:

```ts
import { recoveryActionFor } from '@clervo/sdk';

const recovery = recoveryActionFor(error);
```

Unknown settlement and payment-timeout actions prohibit retry until the
existing idempotency key is reconciled.