#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generated = path.join(root, 'generated/public');
const live = process.argv.includes('--live');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function text(relative) {
  return readFile(path.join(root, relative), 'utf8');
}

async function generatedText(relative) {
  return readFile(path.join(generated, relative), 'utf8');
}

const [discoveryText, openapiText, pricingText, statusText, capabilitiesText, onboardingText, modelsText, mcpText, x402Text, agentText, skillText, llmsText] = await Promise.all([
  generatedText('.well-known/clervo.json'),
  generatedText('openapi.json'),
  generatedText('pricing.json'),
  generatedText('status.json'),
  generatedText('capabilities.json'),
  generatedText('onboarding.json'),
  generatedText('models.json'),
  generatedText('.well-known/mcp.json'),
  generatedText('.well-known/x402'),
  generatedText('agent.md'),
  generatedText('skill.md'),
  generatedText('llms.txt'),
]);

const discovery = JSON.parse(discoveryText);
const openapi = JSON.parse(openapiText);
const pricing = JSON.parse(pricingText);
const status = JSON.parse(statusText);
const capabilities = JSON.parse(capabilitiesText);
const onboarding = JSON.parse(onboardingText);
const models = JSON.parse(modelsText);
const mcp = JSON.parse(mcpText);
const x402 = JSON.parse(x402Text);

const apiOrigin = 'https://api.clervo.dev';
const siteOrigin = 'https://clervo.dev';
const claudeCommand = 'claude mcp add clervo -s user -- npx -y @clervo/mcp';
const commercialDescription = 'Clervo lets software use AI models and agent tools with pay-per-use x402 payments, without managing separate provider accounts or API keys.';

check(discovery.description === commercialDescription, 'discovery commercial description differs');
check(discovery.distribution?.publicAvailable === true && discovery.distribution?.callable === true, 'discovery does not mark the public API callable');
check(status.publicApi?.endpoint === apiOrigin && status.publicApi?.publicCallable === true, 'status production API origin or availability differs');
check(mcp.publicApiBaseUrl === apiOrigin && mcp.publicApiAvailable === true, 'MCP production API origin or availability differs');
check(mcp.claudeCodeCommand === claudeCommand, 'MCP Claude installation command differs');
check(onboarding.publicCallable === true && onboarding.paymentImplemented === true, 'onboarding does not describe the current public payment boundary');
check(!/localhost|127\.0\.0\.1/iu.test(onboardingText), 'production onboarding contains a loopback origin');

const publishedPackages = new Map(status.packages.items.map((item) => [item.name, item.version]));
const [mcpPackage, sdkPackage, routerPackage, pythonProject] = await Promise.all([
  text('packages/mcp/package.json').then(JSON.parse),
  text('packages/sdk-typescript/package.json').then(JSON.parse),
  text('packages/router/package.json').then(JSON.parse),
  text('packages/sdk-python/pyproject.toml'),
]);
check(publishedPackages.get('@clervo/mcp') === mcpPackage.version && mcp.version === mcpPackage.version, 'MCP package version differs across metadata');
check(publishedPackages.get('@clervo/sdk') === sdkPackage.version, 'TypeScript package version differs across metadata');
check(routerPackage.homepage === `${siteOrigin}/docs/cli`, 'Router homepage does not point to customer docs');
check(pythonProject.includes(`version = "${publishedPackages.get('clervo-sdk')}"`), 'Python package version differs across metadata');

const advertisedRoutes = new Set(discovery.products.flatMap((product) => Object.values(product.routes ?? {})));
for (const route of advertisedRoutes) check(openapi.paths[route] !== undefined, `advertised route missing from OpenAPI: ${route}`);
for (const route of ['/v1/chat/completions', '/v1/messages', '/v1/responses', '/v1/ai/execute', '/v1/models']) {
  check(openapi.paths[route] !== undefined, `supported AI route missing from OpenAPI: ${route}`);
}

const discoveryProducts = new Set(discovery.products.map(({ productId }) => productId));
const pricedProducts = new Set(pricing.offers.map(({ productId }) => productId));
check(discoveryProducts.size === pricedProducts.size && [...discoveryProducts].every((id) => pricedProducts.has(id)), 'discovery and pricing product inventories differ');
check(discovery.products.every(({ publicAvailable, lifecycle }) => publicAvailable === true && lifecycle === 'available'), 'public discovery advertises an unavailable or maturity-state operation');
check(capabilities.products.filter(({ lifecycleState }) => lifecycleState === 'unavailable').every(({ operations }) => operations.length === 0), 'unavailable family advertises callable operations');

const sellableModels = models.data.filter(({ clervo }) => clervo.publicSellable === true);
const freeModels = sellableModels.filter(({ clervo }) => clervo.billingMode === 'free');
check(models.object === 'list' && sellableModels.length > 0, 'model catalog has no sellable models');
check(freeModels.length > 0, 'model catalog has no free first-call model');
check(x402.x402Version === 2 && x402.items.length > 0, 'x402 v2 manifest has no paid resources');
check(x402.clervo.freeResources.some(({ operationId }) => operationId === 'ai.execute'), 'x402 manifest omits the free AI entry');

const aliasPairs = [
  ['.well-known/clervo.json', '.well-known/agent.json'],
  ['.well-known/mcp.json', '.well-known/mcp/server.json'],
  ['.well-known/x402.json', '.well-known/x402'],
  ['models.json', 'v1/models'],
  ['agent.md', 'agents.txt'],
];
for (const [canonical, alias] of aliasPairs) {
  check(await generatedText(canonical) === await generatedText(alias), `${alias} differs from ${canonical}`);
}

const customerDocuments = [discoveryText, statusText, capabilitiesText, agentText, skillText, llmsText].join('\n');
for (const phrase of ['commercially unproven', 'owner funded', 'owner-funded', 'quote observed unpaid', 'no external customer', 'release candidate', 'proofLevel', 'proofLevels', 'public preview', 'callable preview']) {
  check(!customerDocuments.toLowerCase().includes(phrase.toLowerCase()), `customer documents expose internal maturity wording: ${phrase}`);
}

const [siteStart, siteDocs, apiEdge] = await Promise.all([
  text('apps/site/src/pages/Start.tsx'),
  text('apps/site/src/pages/Docs.tsx'),
  text('apps/worker/src/api-edge.js'),
]);
check(siteStart.includes(claudeCommand), 'Start page Claude command differs from MCP discovery');
check(siteStart.includes(apiOrigin) && siteStart.includes('http://127.0.0.1:8402/v1'), 'Start page does not distinguish hosted and local origins');
check(siteDocs.includes('hosted API') && siteDocs.includes('local Router proxy'), 'Docs do not distinguish hosted and local compatibility surfaces');
for (const route of ['/openapi.json', '/catalog.json', '/pricing.json', '/status.json', '/llms.txt', '/.well-known/mcp.json', '/.well-known/x402', '/v1/models']) {
  check(apiEdge.includes(`'${route}'`) || apiEdge.includes(`"${route}"`), `API edge does not statically map discovery route: ${route}`);
}

if (live) {
  const livePaths = ['/openapi.json', '/catalog.json', '/capabilities.json', '/pricing.json', '/status.json', '/onboarding.json', '/agents.txt', '/llms.txt', '/skill.md', '/agent.md', '/.well-known/clervo.json', '/.well-known/agent.json', '/.well-known/mcp.json', '/.well-known/mcp/server.json', '/.well-known/x402', '/v1/models'];
  for (const origin of [siteOrigin, apiOrigin]) {
    for (const route of livePaths) {
      const response = await fetch(`${origin}${route}`, { redirect: 'manual' });
      check(response.status === 200, `${origin}${route} returned ${response.status}`);
    }
  }
  const [liveDiscoveryResponse, liveMcpResponse] = await Promise.all([
    fetch(`${apiOrigin}/.well-known/clervo.json`),
    fetch(`${apiOrigin}/.well-known/mcp.json`),
  ]);
  const liveDiscovery = await liveDiscoveryResponse.json();
  const liveMcp = await liveMcpResponse.json();
  check(liveDiscovery.description === commercialDescription, 'live discovery has not published the commercial description');
  check(!JSON.stringify(liveDiscovery).includes('proofLevel'), 'live discovery still exposes internal proof classification');
  check(liveMcp.claudeCodeCommand === claudeCommand, 'live MCP discovery has not published the Claude command');
}

const reconstruction = {
  whatIsClervo: discovery.description,
  public: discovery.distribution.callable,
  availableFamilies: capabilities.products.filter(({ lifecycleState }) => lifecycleState === 'live').map(({ label }) => label),
  unavailableFamilies: capabilities.products.filter(({ lifecycleState }) => lifecycleState === 'unavailable').map(({ label }) => label),
  start: `${siteOrigin}/start/`,
  mcp: { supported: mcp.publicApiAvailable, install: mcp.claudeCodeCommand },
  openAiCompatible: ['/v1/chat/completions', '/v1/responses'],
  anthropicCompatible: '/v1/messages',
  payment: { protocols: discovery.payment.protocols, network: discovery.payment.network, asset: discovery.payment.asset, quotedBeforeExecution: true, automaticPayment: false },
  origins: { hosted: apiOrigin, localProxy: 'http://127.0.0.1:8402/v1' },
  pricing: `${apiOrigin}/pricing.json`,
  products: `${apiOrigin}/catalog.json`,
  models: `${apiOrigin}/v1/models`,
  counts: { publicOperations: discovery.products.length, sellableModels: sellableModels.length, freeModels: freeModels.length },
};

if (failures.length > 0) {
  console.error(`public truth audit: FAIL (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`public truth audit: PASS (${live ? 'live + generated' : 'generated'}, ${discovery.products.length} operations, ${sellableModels.length} sellable models)`);
  console.log(JSON.stringify(reconstruction, null, 2));
}
