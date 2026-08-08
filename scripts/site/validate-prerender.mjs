#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const dist = path.join(root, 'apps/site/dist');
const expectations = [
  // Locked route promises. Keep these as stable human-visible strings so a
  // successful prerender proves the intended page body, not only an empty root.
  ['index.html', 'Give your agent a task.'],
  ['start/index.html', 'Set up Clervo'],
  ['catalog/index.html', 'What does your agent need to do?'],
  ['research/index.html', 'Ask now.'],
  ['platform/index.html', 'One task in.'],
  ['product/index.html', 'One task in.'],
  ['products/search/index.html', 'Search'],
  ['products/ai/index.html', 'AI'],
  ['products/sandbox/index.html', 'Secure Sandbox'],
  ['products/rpc/index.html', 'Multi-chain RPC'],
  ['products/prediction/index.html', 'Prediction'],
  ['products/crypto/index.html', 'Crypto Intelligence'],
  ['build/index.html', 'What you have done.'],
  ['proof-lab/index.html', 'Inspect the mechanism.'],
  ['proof/index.html', 'Proof when work succeeds'],
  ['docs/index.html', 'Start from what your agent needs to do.'],
  ['docs/quickstart/index.html', 'Install the client.'],
  ['docs/http/index.html', 'Raw HTTP client'],
  ['docs/typescript/index.html', 'TypeScript client'],
  ['docs/python/index.html', 'Python client'],
  ['docs/mcp/index.html', 'MCP client'],
  ['docs/receipts/index.html', 'The result keeps its boundary.'],
  ['docs/replay/index.html', 'Same request. No second effect.'],
  ['docs/failures/index.html', 'One failure. One bounded action.'],
  ['docs/x402/index.html', 'Inspect before authorization.'],
  ['docs/catalog/index.html', 'One registry drives every surface.'],
  ['pricing/index.html', 'Know the maximum before Clervo acts.'],
  ['benchmarks/index.html', 'No number without the method behind it.'],
  ['security/index.html', 'Authority is explicit, scoped, and inspectable.'],
  ['legal/index.html', 'Terms should explain how the system actually works.'],
  ['status/index.html', 'Current truth without marketing interpretation.'],
  ['changelog/index.html', 'What changed, what broke'],
  ['compare/blockrun/index.html', 'Compare mechanisms.'],
  ['trust/index.html', 'Inspect the mechanism.'],
];

// Validate every canonical operation route generated from the public catalog.
// The operation identifier itself is the stable minimum content assertion:
// published human copy may evolve, but the route must never render a different
// contract identity or an empty shell.
const catalog = JSON.parse(await readFile(path.join(root, 'generated/public/catalog.json'), 'utf8'));
const operationIds = new Set();
for (const family of catalog.observedTruth?.products ?? []) {
  for (const operationId of family.operations ?? []) operationIds.add(operationId);
}
for (const product of catalog.products ?? []) operationIds.add(product.operationId);
for (const operationId of [...operationIds].sort()) {
  expectations.push([`operations/${operationId}/index.html`, operationId]);
}

for (const [file, content] of expectations) {
  const html = await readFile(path.join(dist, file), 'utf8');
  const text = html
    .replace(/<!--.*?-->/gu, '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ');
  if (!text.includes(content)) throw new Error(`site_prerender_content_missing:${file}`);
  if (!html.includes('rel="canonical"')) throw new Error(`site_prerender_canonical_missing:${file}`);
  if (html.includes('<div id="root"></div>')) throw new Error(`site_prerender_empty:${file}`);
}

// The 404 document is what makes a nonexistent URL answer 404 instead of 200.
// It is checked separately because it is deliberately not canonical and
// deliberately not indexed.
const notFound = await readFile(path.join(dist, '404.html'), 'utf8');
const notFoundText = notFound
  .replace(/<!--.*?-->/gu, '')
  .replace(/<[^>]+>/gu, ' ')
  .replace(/\s+/gu, ' ');
if (!notFoundText.includes('This path has no contract.')) throw new Error('site_prerender_content_missing:404.html');
if (notFound.includes('<div id="root"></div>')) throw new Error('site_prerender_empty:404.html');
if (notFound.includes('rel="canonical"')) throw new Error('site_prerender_404_must_not_be_canonical');
if (!notFound.includes('name="robots" content="noindex"')) throw new Error('site_prerender_404_must_be_noindex');

console.log(`site prerender validation: PASS (${expectations.length} content routes, 404 document)`);
