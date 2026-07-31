# N4.27 dated agent-search capability matrix

Reviewed 2026-07-31. `Proven` means direct repository/staging evidence for the
named system; vendor rows based only on current official documentation are
`partially proven` because no owner credential was available for direct test.
Official pages and captured response hashes:

- Exa Search: `https://docs.exa.ai/reference/search`, SHA-256
  `11f1dfbbcdf3975cf679f44c5d0f4ebb76d7927a49691eee6f105dbb772b981d`.
- Tavily Search: `https://docs.tavily.com/documentation/api-reference/endpoint/search`,
  SHA-256 `135240328f98a3cef8071ee9dcb11c17e2d149ccdd7ca3b30b505459ce9e6085`.
- Firecrawl Search: `https://docs.firecrawl.dev/features/search`, SHA-256
  `99eea3ffdfe260961167c58c4a96dfea6aad9d5f1d9a2247cc94ce9f343f9915`.
- SearXNG repository: `https://github.com/searxng/searxng`, SHA-256
  `76ddd7263aea7bc96592fe3f41558a5433f93758806655bd1247f720a1112b05`.
- Typesense vector-search docs: `https://typesense.org/docs/30.0/api/vector-search.html`,
  SHA-256 `3de9cb24096bd664b114523f015fe254a1fae48c4261e4b6384e85c0957c67ab`.

| Capability | Repaired Clervo | Exa | Tavily | Firecrawl | SearXNG / Typesense |
| --- | --- | --- | --- | --- | --- |
| Long semantic and exact-entity queries | Partially proven; regression improved, holdout failed | Partially proven from official Search modes | Partially proven from official search depth | Partially proven from official search | SearXNG keyword metasearch / Typesense lexical-vector support documented |
| Keyword, ambiguity, multi/negative constraints | Partially proven; no negative-filter contract | Partially proven | Partially proven | Partially proven | Partially proven |
| Fast / balanced / thorough profiles | Proven deterministic behavior; latency and thorough-recall gates failed | Documented search modes, direct behavior unavailable | Basic/advanced documented | Search plus scrape options documented | Configuration-dependent |
| Include/exclude domain and path | Unsupported in the public Clervo contract | Documented domain controls; direct test unavailable | Documented domain controls | Documented sources/categories; exact parity unavailable | Engine-dependent |
| Date range and freshness policy | Unsupported beyond observed timestamps/cache disclosure | Documented date/content controls; direct test unavailable | Documented time/date controls | Partially documented | Engine-dependent |
| Language, country, result count | Language/region/count partially proven; upstream honoring unproven | Partially documented | Partially documented | Location/limit documented | Engine-dependent |
| Max latency and max result cost | Internal deadlines/cost ceiling proven; public additive filters incomplete | Unavailable for direct test | Unavailable for direct test | Timeout documented | Self-host operator controlled |
| Metadata, cleaned text, Markdown, highlights, full content | Cleaned evidence text and metadata proven; Markdown/full-content/highlight contract incomplete | Contents/highlights documented | Raw content/chunks documented | Scrape formats documented | Requires composition |
| Exact evidence citations and provenance | Proven on regression, but citation floor missed | Unavailable for direct verification | Unavailable for direct verification | Unavailable for direct verification | Requires composition |
| Five explicit freshness modes and response timestamps | Cache state partially proven; complete response contract unsupported | Unavailable for direct test | Unavailable for direct test | Unavailable for direct test | Requires composition |
| Caller field schemas and field-level evidence | Unsupported for arbitrary caller schemas; deterministic fixed fields only | Partially documented in contents/extraction surfaces | Structured answer differs and is unavailable for direct test | Structured extraction documented separately | Requires composition |
| Per-URL independent status | Partial route-level lifecycle only | Unavailable for direct test | Unavailable for direct test | Partially documented | Requires composition |
| Monitoring/collections/webhooks | Planned Stage 5 | Documented product workflow; not a Stage 4 requirement | Product-specific | Product-specific | Requires composition |
| AI synthesis/reasoning | Planned AI stage | Product capability, unavailable for direct test | Documented answer path | Separate extraction/agent features | Unsupported without composition |
| Fixed x402 quote, receipt and replay | Repository mock contracts exist; N4.27 staging proof correctly skipped | Unsupported/unknown for direct test | Unsupported/unknown | Unsupported/unknown | Unsupported without composition |

The matrix does not establish Exa parity, index-scale parity, people/company
data parity, or a universal search claim. Direct Exa comparison is unavailable
until the exact owner action in `claim-decision.v1.json` is satisfied.
