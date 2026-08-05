# Current engineering state

The compact operational state is `docs/CURRENT-STATE.yaml`.

## Current production truth

- The protected public API is callable.
- `search.web` returns live cited results and exposes an exact `0.006 USDC`
  maximum charge on Base.
- `ai.chat` and `sandbox.run` are public previews.
- `search.answer` synthesis is not a public offer.
- The payment system has real settlement, durable receipt, and replay-safety
  capability.
- The active opening test uses the owner-approved wallet.

## Active work

Gate 4.5 removes obsolete control authority, synchronizes Search visibility,
then completes the public owner-wallet purchase, receipt, replay, and second new
purchase.

The six-family platform remains intact. Expansion work is paused until the
Search shop is open.

Historical stage records remain in Git and `docs/archive/**`; they are not
current execution authority.
