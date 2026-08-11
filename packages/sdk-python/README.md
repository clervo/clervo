# `clervo-sdk`

Dependency-free Python client for the live Clervo API. It exposes cited Search
plus the complete provider-neutral AI catalog and normalized AI execution
contract.

```python
from clervo import Clervo

client = Clervo()  # https://api.clervo.dev
catalog = client.models.list()
free = next(
    model for model in catalog["data"]
    if model["clervo"]["publicSellable"]
    and model["clervo"]["billingMode"] == "free"
)
result = client.ai.execute(
    model=free["id"],
    input={
        "kind": "chat",
        "messages": [{"role": "user", "content": "Reply with ready."}],
        "responseFormat": "text",
        "stream": False,
    },
    maximum_output_tokens=16,
    idempotency_key="my-stable-request-0001",
)
```

The catalog carries stable canonical Clervo IDs and explicit alias contracts,
capabilities, health, availability, free/paid state, pricing, and commerce
metadata. `client.ai.execute()` accepts the normalized chat, embedding, image,
speech, video, music, and virtual-try-on inputs published by OpenAPI. Canonical
IDs are never silently substituted.

Paid models raise `ClervoPaymentRequiredError` with the exact payment challenge
by default. Python deliberately contains no second wallet or signing
implementation. Start the shipped local core with `clervo proxy --auto-pay`,
then opt in from Python:

```python
client = Clervo(
    connect_url="http://127.0.0.1:8402",
    auto_pay=True,
)
```

`client.connect` exposes the live catalog, quotes, generic execution, the shared
wallet address, limits, durable usage, doctor and retrieval-only reconciliation.
All paid work crosses loopback into the Router core, so the same ceilings,
idempotency records, receipts and unknown-settlement freeze apply to Python.
Neither wallet key material nor a placeholder OpenAI key leaves the machine.

Search remains available through `client.search.web()` and
`client.search.answer()`. `recovery_action_for(error)` returns one safe next
action for known failures. Unknown settlement and timeout states prohibit retry
until reconciliation.

Pass `base_url` only for another HTTPS deployment or loopback development. This
client code is MIT licensed; use of the hosted Clervo service remains subject
to its service terms.
