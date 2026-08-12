# B12 recovery — Phase 0 evidence index

Status: **PHASE 0 COMPLETE — RECOVERY FOUNDATION ACCEPTED.**

This directory preserves a forensic snapshot of the owner-rejected B12 product
experience. It does not replace or discredit `B12-CLOSURE-EVIDENCE.md`; that
record remains evidence of the engineering and distribution work that occurred.
The current recovery exists because later owner product/visual acceptance
failed.

B13 remains blocked. Phase 1 is authorized only for Global Shell/shared
primitives and Home.

## Evidence

- [Forensic audit](./PHASE-0-FORENSIC-AUDIT.md)
- [Page archetype map](./PAGE-ARCHETYPE-MAP.md)
- [Machine-readable route/archetype assignments](./route-archetypes.json)
- [Page contracts](./PAGE-CONTRACTS.md)
- [Final Phase 0 exit gate](./PHASE-0-EXIT-GATE.md)
- [Functional benchmark notes](./BENCHMARK-NOTES.md)
- [Browser benchmark observations](./benchmark-browser-observations.json)
- [Component and asset inventory](./COMPONENT-ASSET-INVENTORY.md)
- [Authoritative semantic fixture inventory](./PROTOTYPE-FIXTURE-INVENTORY.md)
- [Normalized interaction inventory](./NORMALIZED-INTERACTION-INVENTORY.md)
- [Canonical journeys and CTA semantics](./CANONICAL-JOURNEYS.md)
- [Docs search contract](./DOCS-SEARCH-CONTRACT.md)
- [Trust, legal, and `/build` decisions](./TRUST-LEGAL-BUILD-DECISIONS.md)
- [Recovery quality/delta gates](./RECOVERY-QUALITY-GATES.md)
- [Link graph audit](./LINK-GRAPH-AUDIT.md)
- [Rendered interaction/link contracts](./interaction-contracts.json.gz)
- [Production rendered crawl](./production/forensic-audit.json.gz)
- [Production accessibility baseline](./production/accessibility-baseline.txt)
- [Production Lighthouse mobile baseline](./production/lighthouse-mobile.json)
- [Production Lighthouse desktop baseline](./production/lighthouse-desktop.json)
- [Local production-build crawl](./local/forensic-audit.json.gz)
- [Local production build log](./local/site-build.txt)
- [Rejected-state visual evidence](./rejected-current-state/README.md)

The exhaustive crawl and interaction ledgers are gzip-compressed because their
repeated per-route records compress from roughly 30 MB to under 1 MB. They are
ordinary UTF-8 JSON after decompression and are reproducible with the Phase 0
scripts.

## Exit

All 18 final correction conditions pass. The foundation is accepted and the
workflow proceeds automatically to Global Shell/shared primitives and Home,
then stops at the Home evidence checkpoint.
