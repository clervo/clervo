import { readFile } from 'node:fs/promises';
import path from 'node:path';

const fixedRoutes = [
  ['/', 'AI and agent tools, paid per call', 'Clervo lets software use AI models and agent tools with pay-per-use x402 payments, without managing separate provider accounts or API keys.'],
  ['/start', 'Start using Clervo', 'Make a free AI call, connect Claude through MCP, or start with an OpenAI-compatible app, CLI, TypeScript, or Python.'],
  ['/catalog', 'AI model catalog', 'Inspect exact Clervo model IDs, capabilities, current availability, free or paid billing, and public pricing.'],
  ['/research', 'Web Search', 'Retrieve fresh ranked web results with citations through Clervo free and paid routes.'],
  ['/product', 'Products', 'Explore the AI, Search, Sandbox, Prediction, and Crypto products currently available through Clervo, with routes and pricing.'],
  ['/products/search', 'Web Search', 'Retrieve fresh ranked web results with citations through free and paid routes.'],
  ['/products/ai', 'AI models', 'Use chat, embeddings, and multimodal models through one catalog and execution API.'],
  ['/products/sandbox', 'Secure Sandbox product family', 'Clervo Secure Sandbox runs bounded no-network code execution with resource limits, receipt and replay-safe outcome semantics.'],
  ['/products/rpc', 'Multi-chain RPC', 'Multi-chain RPC has no public execution route at this time.'],
  ['/products/prediction', 'Prediction Intelligence product family', 'Clervo Prediction Intelligence returns normalized market context, freshness, evidence and provenance across supported public market data routes.'],
  ['/products/crypto', 'Crypto Intelligence product family', 'Clervo Crypto Intelligence returns bounded wallet and on-chain signals with chain coverage, evidence and provenance.'],
  ['/docs', 'Developer docs', 'Clervo developer documentation for the first free call, exact public operations, clients, wallet opt-in, payment boundaries, receipts, replay and recovery.'],
  ['/docs/quickstart', 'Developer quickstart', 'Install a published Clervo client, make a first free request, inspect the exact operation contract and opt into paid work only when needed.'],
  ['/docs/http', 'Raw HTTP developer docs', 'Call Clervo through raw HTTP using the current OpenAPI contract, explicit idempotency and typed payment or recovery states.'],
  ['/docs/typescript', 'TypeScript developer docs', 'Use the published Clervo TypeScript SDK with explicit base URL, idempotency, payment opt-in and recovery boundaries.'],
  ['/docs/python', 'Python developer docs', 'Use the published Clervo Python SDK with explicit base URL, idempotency, payment opt-in and recovery boundaries.'],
  ['/docs/mcp', 'MCP developer docs', 'Connect Clervo through the published MCP package while preserving operation identity, approval, evidence and recovery semantics.'],
  ['/docs/cli', 'Router and CLI developer docs', 'Use the Clervo Router and CLI for free Search, catalog inspection, quotes, wallet setup, limits, receipts, replay, reconciliation and diagnostics.'],
  ['/docs/openai', 'OpenAI-compatible client docs', 'Use the hosted Clervo compatibility API directly, or use the local Router proxy for wallet-backed paid calls.'],
  ['/docs/receipts', 'Receipt contract guide', 'Understand how Clervo receipts bind operation identity, request, evidence, cost and replay state to a returned outcome.'],
  ['/docs/replay', 'Replay contract guide', 'Reuse the same Clervo idempotency key for the identical request and recover the same completed result without a second effect or charge.'],
  ['/docs/failures', 'Failure recovery guide', 'Distinguish refused from unresolved Clervo failures and know whether correction, reconciliation or replay is the next safe action.'],
  ['/docs/x402', 'x402 contract guide', 'Inspect Clervo x402 payment challenges, exact maximum charge and approval boundaries before authorization or execution.'],
  ['/docs/catalog', 'Capability catalog guide', 'Use Clervo catalog, status, pricing, discovery, and model documents to select a currently available operation.'],
  ['/pricing', 'Pricing', 'Understand Clervo pay-per-call pricing, request-time 402 quotes, USDC payment, local spend limits, and replay behavior.'],
  ['/security', 'Security controls', 'Inspect Clervo authority, wallet, execution, replay and recovery controls with explicit scope and fail-closed boundaries.'],
  ['/legal', 'Legal boundaries', 'Clervo legal and product boundaries for usage, payments, privacy and acceptable operation without overstating unsupported guarantees.'],
  ['/status', 'Product status', 'Current Clervo API, package, product, route, and model availability.'],
  ['/changelog', 'Changelog', 'Dated changes to Clervo public product, distribution, and runtime behavior.'],
].map(([route, title, description]) => ({ route, title, description, kind: 'fixed' }));

export function canonicalPath(route) {
  return route === '/' ? '/' : `${route.replace(/\/+$/u, '')}/`;
}

export async function siteRouteInventory(root) {
  const catalog = JSON.parse(await readFile(path.join(root, 'generated/public/catalog.json'), 'utf8'));
  const operationIds = new Set();
  for (const product of catalog.products ?? []) operationIds.add(product.operationId);
  const operations = [...operationIds].sort().map((operationId) => ({
    route: `/operations/${operationId}`,
    title: `Operation ${operationId}`,
    description: `Inspect the ${operationId} Clervo operation: current route, availability, request and response schema, price, errors, and replay behavior.`,
    kind: 'operation',
  }));

  const models = JSON.parse(await readFile(path.join(root, 'generated/public/models.json'), 'utf8'));
  const modelRoutes = (models.data ?? []).map((model) => {
    const slug = encodeURIComponent(String(model.id).replace(/^clervo\//u, ''));
    const identity = model.clervo?.identityKind === 'alias' ? 'Clervo routing profile' : 'canonical AI model';
    return {
      route: `/models/${slug}`,
      title: `${model.clervo?.name ?? model.id} API`,
      description: `${model.clervo?.description ?? model.id} Inspect the exact Clervo ID, capabilities, availability, public pricing, and ${identity} contract.`,
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
