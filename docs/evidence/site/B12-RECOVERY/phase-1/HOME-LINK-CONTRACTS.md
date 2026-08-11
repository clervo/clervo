# Home link-contract validation

Reachability and semantic destination correctness are recorded separately. All
19 rendered Home links/fragments resolve in the production build. Destination
archetypes still awaiting their own recovery gate are named explicitly; their
current visual state is not accepted by this Home checkpoint.

| Visible label | User intent | Destination | Expected destination state | Home source contract | Destination recovery state |
| --- | --- | --- | --- | --- | --- |
| Skip to main content | Bypass global navigation | `#home-title` | Home promise heading | PASS | PASS local fragment |
| Set up Clervo | Begin canonical Clervo activation | `/start` | Real B11 integration choice and first result | PASS canonical intent | START pending its later archetype gate |
| Explore the product | Understand the operating layer | `/product` | Product overview, not another Home | PASS | PRODUCT pending |
| Search | Understand cited retrieval | `/products/search` | Search-specific product surface | PASS | PRODUCT FAMILY pending |
| AI | Browse the AI operating family | `/products/ai` | AI family linked to model discovery | PASS | PRODUCT FAMILY pending |
| Secure Sandbox | Understand bounded execution | `/products/sandbox` | Sandbox-specific product surface | PASS | PRODUCT FAMILY pending |
| Prediction Intelligence | Understand sourced market context | `/products/prediction` | Prediction-specific product surface | PASS | PRODUCT FAMILY pending |
| Crypto Intelligence | Understand on-chain signals | `/products/crypto` | Crypto-specific product surface | PASS | PRODUCT FAMILY pending |
| Multi-chain RPC | Understand RPC position and current boundary | `/products/rpc` | Honest unavailable state until B14 | PASS; Home already says unavailable | PRODUCT FAMILY pending; B14 remains blocked by B12 |
| Router / CLI | Choose command-line integration | `/docs/cli` | Released Router / CLI documentation | PASS | DOCS pending |
| TypeScript | Choose released TypeScript SDK | `/docs/typescript` | Current package instructions | PASS | DOCS pending |
| MCP | Choose released MCP server | `/docs/mcp` | Current package instructions | PASS | DOCS pending |
| Python | Choose released Python SDK | `/docs/python` | Current package instructions | PASS | DOCS pending |
| OpenAI-compatible | Use an existing OpenAI client | `/docs/openai` | Current compatibility contract | PASS | DOCS pending |
| Get a free first result | Run the observed free Search entry | `/docs/quickstart` | Copyable public request before wallet setup | PASS | DOCS pending; current route carries real generated request truth |
| Read the docs | Enter developer documentation | `/docs` | Developer portal entry | PASS | DOCS pending |
| Understand Clervo proof | Learn result/evidence/receipt meaning | `/proof` | Clervo-specific proof architecture | PASS | PROOF pending |
| Find an AI model | Browse technical model catalog | `/catalog` | Searchable technical catalog | PASS | MODELS pending |

The repeated “Set up Clervo” action has one route and one meaning across Home,
header, and footer: `/start`. Phase 1 does not alter Start because the owner
explicitly set it as the next independent archetype after Home review.
