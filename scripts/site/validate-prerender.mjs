#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const dist = path.join(root, 'apps/site/dist');
const expectations = [
  ['index.html', 'One job in.'],
  ['research/index.html', 'Ask now.'],
  ['platform/index.html', 'One platform.'],
  ['product/index.html', 'One platform.'],
  ['products/search/index.html', 'Research.'],
  ['products/ai/index.html', 'AI.'],
  ['products/sandbox/index.html', 'Secure Sandbox.'],
  ['products/rpc/index.html', 'Multi-chain RPC.'],
  ['products/prediction/index.html', 'Prediction Intelligence.'],
  ['products/crypto/index.html', 'Crypto Intelligence.'],
  ['build/index.html', 'Prove the path.'],
  ['proof-lab/index.html', 'Inspect the mechanism.'],
  ['proof/index.html', 'The mechanism ran.'],
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
  ['pricing/index.html', 'Proof amount is not public price'],
  ['benchmarks/index.html', 'No superiority claim'],
  ['security/index.html', 'Failure closes the boundary'],
  ['legal/index.html', 'Availability follows rights'],
  ['status/index.html', 'Built privately.'],
  ['changelog/index.html', 'What changed.'],
  ['compare/blockrun/index.html', 'Compare mechanisms.'],
  ['trust/index.html', 'Inspect the mechanism.'],
];

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

console.log(`site prerender validation: PASS (${expectations.length} content routes)`);
