# `@clervo/sdk`

Typed client for Clervo's frozen distribution candidate.

Current scope is deliberately narrow:

- `search.web` and `search.answer`;
- repository-local preview execution;
- typed non-payable `402` challenges;
- idempotency and request cancellation;
- no wallet, signer, payment retry, or public-service assumption.

The client requires an explicit `baseUrl` because no public API deployment is
currently verified.

```ts
import { ClervoClient } from '@clervo/sdk';

const clervo = new ClervoClient({ baseUrl: 'http://127.0.0.1:8080' });
const result = await clervo.search.web({ query: 'payment idempotency' });
```

`search.answer` sets synthesis explicitly. Callers cannot silently change the
product identity through the request body.
