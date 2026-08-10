# `clervo-sdk`

Dependency-free Python client for Clervo's current Search client surface.

The package exposes `search.web` and `search.answer`, requires an explicit base
URL, preserves idempotency, and returns typed payment-required errors. It does
not contain a wallet, signer, automatic payment, or payment retry.

The current public Clervo endpoint is `https://api.clervo.dev`.

```python
from clervo import Clervo

client = Clervo(base_url="https://api.clervo.dev")
result = client.search.web(query="agent payment idempotency")
```

`search.answer` fixes synthesis to the answer product. The caller cannot change
that product identity through arbitrary request fields.

The published Python SDK is intentionally narrower than Clervo's complete
public capability catalog. Use the current catalog and OpenAPI artifacts for the
full observed operation set.

Known payment failures can be reduced to one bounded next action without
triggering a payment or retry:

```python
from clervo import recovery_action_for

recovery = recovery_action_for(error)
```

Unknown settlement and payment-timeout actions prohibit retry until the
existing idempotency key is reconciled.