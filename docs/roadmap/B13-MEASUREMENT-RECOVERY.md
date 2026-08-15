# B13 measurement recovery note

The original B13 definition is preserved in the pre-compression `ROADMAP.md`
history (the parent of `9785b88`, section “B13 — Measurement”). It called for
an end-to-end funnel (discovery, install, wallet/free use, paid outcomes and
repeat use), acquisition source, conversion, retention, and per-product
revenue/gross margin reconciled to settlement records.

| Historical item | Classification | Disposition |
| --- | --- | --- |
| Discovery/install/source attribution | STILL NEEDED | Privacy-safe site events in `clervo_commercial_events`; no prompts or response bodies. |
| Setup/onboarding, catalog exploration | STILL NEEDED | Route-level site events; current visual/product surfaces remain unchanged. |
| Free first useful result | STILL NEEDED | Authoritative API event on successful free Search/AI execution. |
| Wallet created/funded | MOVED | Client (B11) owns local wallet behavior; paid authorization/settlement remains API truth. |
| First/second paid outcome and repeat use | STILL NEEDED | Derived from durable x402 operations and pseudonymous payer references. |
| 7/30-day retention | STILL NEEDED | Read-only report derives windows when the observation window is long enough. |
| Revenue and supplier cost | STILL NEEDED | Existing receiver accounting journal is the only revenue/cost source; exact atomic arithmetic. |
| Margin and capability/model mix | STILL NEEDED | Report groups accounting by the quoted product identity; facilitator overhead is null when unattributed. |
| “Commercial proof”, maturity, owner-funded release gates | OBSOLETE CEREMONY | Not restored; buyer behavior is reported as market outcome. |

B11 client/distribution work and B12 site/distribution work remain intact. RPC
is unrelated to this recovery and remains unavailable (B14 not started).
