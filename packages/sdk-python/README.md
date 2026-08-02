# `clervo-sdk`

Dependency-free Python client for Clervo's frozen distribution candidate.

The current package exposes only `search.web` and `search.answer`, requires an
explicit base URL, preserves idempotency, and returns typed non-payable `402`
errors. It does not contain a wallet, signer, payment retry, or public deployment
assumption.

```python
from clervo import Clervo

client = Clervo(base_url="http://127.0.0.1:8080")
result = client.search.web(query="payment idempotency")
```

`search.answer` fixes synthesis to the answer product. The caller cannot change
that product identity through arbitrary request fields.

Known future payment failures can be reduced to one bounded next action without
triggering a payment or retry:

```python
from clervo import recovery_action_for

recovery = recovery_action_for(error)
```

Unknown settlement and payment-timeout actions prohibit retry until the
existing idempotency key is reconciled.
