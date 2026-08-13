import { readFile } from 'node:fs/promises';
import path from 'node:path';

const fixedRoutes = [
  ['/', 'Outcome infrastructure for agents', 'Give your agent a task. Get a verified result. Clervo qualifies capability, cost and policy, executes within a bounded contract, and keeps evidence, receipt and replay state inspectable.'],
  ['/start', 'Set up Clervo', 'Set up Clervo in an agent with explicit approval boundaries, environment checks, recovery states and a verified first-task workflow.'],
  ['/catalog', 'AI model catalog', 'Inspect Clervo model identities, capability families, current availability, proof state and published pricing without guessing provider or lifecycle state.'],
  ['/research', 'Research outcome', 'Use Clervo Research for fresh source retrieval with citations, evidence and explicit outcome boundaries.'],
  ['/platform', 'Clervo Platform', 'One operating contract for bounded requests, capability qualification, execution, verification, evidence and safe replay.'],
  ['/product', 'Product and capabilities', 'Explore ClervoRouter and the six permanent capability families behind one bounded outcome contract.'],
  ['/products/search', 'Search product family', 'Clervo Research retrieves fresh sources with citations and evidence while keeping route, price and proof state explicit.'],
  ['/products/ai', 'AI product family', 'Clervo AI exposes a qualified model catalog behind one request contract with exact model identity, capability, price and availability boundaries.'],
  ['/products/sandbox', 'Secure Sandbox product family', 'Clervo Secure Sandbox runs bounded no-network code execution with resource limits, receipt and replay-safe outcome semantics.'],
  ['/products/rpc', 'Multi-chain RPC product family', 'Clervo Multi-chain RPC product identity and current public availability boundary.'],
  ['/products/prediction', 'Prediction Intelligence product family', 'Clervo Prediction Intelligence returns normalized market context, freshness, evidence and provenance across supported public market data routes.'],
  ['/products/crypto', 'Crypto Intelligence product family', 'Clervo Crypto Intelligence returns bounded wallet and on-chain signals with chain coverage, evidence and provenance.'],
  ['/build', 'Build with Clervo', 'Build agent workflows against Clervo machine contracts, published clients, explicit approvals and inspectable recovery semantics.'],
  ['/proof', 'Payment and replay proof', 'Inspect Clervo payment verification, settlement evidence, replay guarantees and the boundary between verified, refused and unresolved states.'],
  ['/proof-lab', 'Proof Lab', 'Interact with Clervo proof-state fixtures to understand request, qualification, verification, receipt and replay boundaries without creating a live transaction.'],
  ['/docs', 'Developer docs', 'Clervo developer documentation for the first free call, exact public operations, clients, wallet opt-in, payment boundaries, receipts, replay and recovery.'],
  ['/docs/quickstart', 'Developer quickstart', 'Install a published Clervo client, make a first free request, inspect the exact operation contract and opt into paid work only when needed.'],
  ['/docs/http', 'Raw HTTP developer docs', 'Call Clervo through raw HTTP using the current OpenAPI contract, explicit idempotency and typed payment or recovery states.'],
  ['/docs/typescript', 'TypeScript developer docs', 'Use the published Clervo TypeScript SDK with explicit base URL, idempotency, payment opt-in and recovery boundaries.'],
  ['/docs/python', 'Python developer docs', 'Use the published Clervo Python SDK with explicit base URL, idempotency, payment opt-in and recovery boundaries.'],
  ['/docs/mcp', 'MCP developer docs', 'Connect Clervo through the published MCP package while preserving operation identity, approval, evidence and recovery semantics.'],
  ['/docs/cli', 'Router and CLI developer docs', 'Use the Clervo Router and CLI for free Search, catalog inspection, quotes, wallet setup, limits, receipts, replay, reconciliation and diagnostics.'],
  ['/docs/openai', 'OpenAI-compatible client docs', 'Use the Clervo localhost OpenAI-compatible proxy with canonical model IDs and explicit paid-use opt-in.'],
  ['/docs/receipts', 'Receipt contract guide', 'Understand how Clervo receipts bind operation identity, request, evidence, cost and replay state to a returned outcome.'],
  ['/docs/replay', 'Replay contract guide', 'Reuse the same Clervo idempotency key for the identical request and recover the same completed result without a second effect or charge.'],
  ['/docs/failures', 'Failure recovery guide', 'Distinguish refused from unresolved Clervo failures and know whether correction, reconciliation or replay is the next safe action.'],
  ['/docs/x402', 'x402 contract guide', 'Inspect Clervo x402 payment challenges, exact maximum charge and approval boundaries before authorization or execution.'],
  ['/docs/catalog', 'Capability catalog guide', 'Understand how Clervo projects one canonical registry into capability, lifecycle, pricing, status and discovery surfaces.'],
  ['/pricing', 'Pricing truth', 'Inspect Clervo operation-level fixed maximums and request-derived quote boundaries without invented subscription tiers or hidden charges.'],
  ['/benchmarks', 'Benchmark truth', 'Clervo benchmark methodology and evidence boundaries: no performance number without the method, scope and reproducible proof behind it.'],
  ['/security', 'Security controls', 'Inspect Clervo authority, wallet, execution, replay and recovery controls with explicit scope and fail-closed boundaries.'],
  ['/legal', 'Legal boundaries', 'Clervo legal and product boundaries for usage, payments, privacy and acceptable operation without overstating unsupported guarantees.'],
  ['/status', 'Product status', 'Current Clervo product lifecycle, package, API and proof state generated from the observed registry rather than marketing interpretation.'],
  ['/changelog', 'Changelog', 'Dated, source-bound Clervo changes to public product, distribution, runtime and proof state.'],
  ['/trust', 'Trust center', 'Inspect Clervo proof, status, security, benchmark, pricing and legal boundaries from one trust center.'],
].map(([route, title, description]) => ({ route, title, description, kind: 'fixed' }));

export function canonicalPath(route) {
  return route === '/' ? '/' : `${route.replace(/\/+$/u, '')}/`;
}

export async function siteRouteInventory(root) {
  const catalog = JSON.parse(await readFile(path.join(root, 'generated/public/catalog.json'), 'utf8'));
  const operationIds = new Set();
  for (const family of catalog.observedTruth?.products ?? []) {
    for (const operationId of family.operations ?? []) operationIds.add(operationId);
  }
  for (const product of catalog.products ?? []) operationIds.add(product.operationId);
  const operations = [...operationIds].sort().map((operationId) => ({
    route: `/operations/${operationId}`,
    title: `Operation ${operationId}`,
    description: `Inspect the ${operationId} Clervo operation contract: current availability, request and response schema, price and approval boundary, evidence, receipt, errors and safe replay semantics.`,
    kind: 'operation',
  }));

  const models = JSON.parse(await readFile(path.join(root, 'generated/public/models.json'), 'utf8'));
  const modelRoutes = (models.data ?? []).map((model) => {
    const slug = encodeURIComponent(String(model.id).replace(/^clervo\//u, ''));
    const identity = model.clervo?.identityKind === 'alias' ? 'Clervo routing profile' : 'canonical AI model';
    return {
      route: `/models/${slug}`,
      title: `${model.clervo?.name ?? model.id} API`,
      description: `${model.clervo?.description ?? model.id} Inspect the exact Clervo ID, creator review, capabilities, availability, published pricing, and ${identity} contract.`,
      kind: 'model',
      modelId: model.id,
    };
  });

  const routes = [...fixedRoutes, ...operations, ...modelRoutes];
  const seen = new Set();
  for (const item of routes) {
    if (seen.has(item.route)) throw new Error(`site_route_inventory_duplicate:${item.route}`);
    seen.add(item.route);
  }
  return routes;
}
