# Contributing

Clervo is developed from contracts and observed behavior. A change must keep
schemas, lifecycle, pricing, receipts, discovery, documentation, and public
claims consistent with what the implementation proves.

Before opening a change:

1. Keep credentials, wallet material, customer payloads, and authentication
   files out of source, issues, test fixtures, and logs.
2. Add focused tests for changed behavior and preserve payment idempotency,
   sandbox isolation, SSRF protection, cleanup, and cost ceilings.
3. Run `npm run lint`, the relevant focused test, and
   `./scripts/verify-clean-room-boundary.sh` for boundary-relevant work.
4. Do not describe preview or unavailable capabilities as production-ready.

This repository is currently unlicensed. A public source checkout does not
grant permission to redistribute or create derivative works unless Clervo
publishes separate terms.
