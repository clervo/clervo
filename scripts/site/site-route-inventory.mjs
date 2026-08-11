import { readFile } from 'node:fs/promises';
import path from 'node:path';

const fixedRoutes = [
  ['/', 'Outcome infrastructure for agents'],
  ['/start', 'Set up Clervo'],
  ['/catalog', 'AI models and capability catalog'],
  ['/research', 'Research outcome'],
  ['/platform', 'Clervo Platform'],
  ['/product', 'Product and capabilities'],
  ['/products/search', 'Research product family'],
  ['/products/ai', 'AI product family'],
  ['/products/sandbox', 'Secure Sandbox product family'],
  ['/products/rpc', 'Multi-chain RPC product family'],
  ['/products/prediction', 'Prediction Intelligence product family'],
  ['/products/crypto', 'Crypto Intelligence product family'],
  ['/build', 'Build with Clervo'],
  ['/proof', 'Payment and replay proof'],
  ['/proof-lab', 'Proof Lab'],
  ['/docs', 'Developer docs'],
  ['/docs/quickstart', 'Developer quickstart'],
  ['/docs/http', 'Raw HTTP developer docs'],
  ['/docs/typescript', 'TypeScript developer docs'],
  ['/docs/python', 'Python developer docs'],
  ['/docs/mcp', 'MCP developer docs'],
  ['/docs/cli', 'Router and CLI developer docs'],
  ['/docs/openai', 'OpenAI-compatible client docs'],
  ['/docs/receipts', 'Receipt contract guide'],
  ['/docs/replay', 'Replay contract guide'],
  ['/docs/failures', 'Failure recovery guide'],
  ['/docs/x402', 'x402 contract guide'],
  ['/docs/catalog', 'Capability catalog guide'],
  ['/pricing', 'Pricing truth'],
  ['/benchmarks', 'Benchmark truth'],
  ['/security', 'Security controls'],
  ['/legal', 'Legal boundaries'],
  ['/status', 'Product status'],
  ['/changelog', 'Changelog'],
  ['/trust', 'Trust center'],
].map(([route, title]) => ({ route, title, kind: 'fixed' }));

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
