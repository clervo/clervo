# ADR-0004: Operations and idempotency

- Status: accepted

Every operation has a stable operation ID, versioned request and result
contracts, bounded inputs, explicit failure codes, and a durable state machine.
Terminal success requires a receipt; unknown execution or settlement state
requires reconciliation.

Idempotency keys bind to the canonical request identity. Reusing a key with the
same request returns the stored state or result without another execution or
charge. Reusing it with a different request fails with a conflict. Retries may
not skip quote, authorization, settlement, or reconciliation gates.
