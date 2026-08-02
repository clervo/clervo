#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const dist = path.join(root, 'apps/site/dist');
const expectations = [
  ['index.html', 'Find.'],
  ['product/index.html', 'One platform.'],
  ['build/index.html', 'Prove the path.'],
  ['proof-lab/index.html', 'Inspect the mechanism.'],
  ['docs/http/index.html', 'Raw HTTP client'],
  ['docs/typescript/index.html', 'TypeScript client'],
  ['docs/python/index.html', 'Python client'],
  ['docs/mcp/index.html', 'MCP client'],
  ['pricing/index.html', 'No sellable price'],
  ['benchmarks/index.html', 'No superiority claim'],
  ['security/index.html', 'Failure closes the boundary'],
  ['legal/index.html', 'Availability follows rights'],
  ['status/index.html', 'Private core frozen.'],
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
