#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const dist = path.join(root, 'apps/site/dist');
const serverBundle = path.join(root, 'apps/site/dist-server/entry-server.js');
const template = await readFile(path.join(dist, 'index.html'), 'utf8');
const { render } = await import(serverBundle);

const routes = [
  ['/', 'Outcome infrastructure for agents'],
  ['/research', 'Research outcome'],
  ['/platform', 'Clervo Platform'],
  ['/product', 'Product and capabilities'],
  ['/products/search', 'Research product core'],
  ['/products/ai', 'AI product core'],
  ['/products/sandbox', 'Secure Sandbox product core'],
  ['/products/rpc', 'Multi-chain RPC product core'],
  ['/products/prediction', 'Prediction Intelligence product core'],
  ['/products/crypto', 'Crypto Intelligence product core'],
  ['/build', 'Build with Clervo'],
  ['/proof', 'Payment and replay proof'],
  ['/proof-lab', 'Proof Lab'],
  ['/docs', 'Developer docs'],
  ['/docs/quickstart', 'Developer quickstart'],
  ['/docs/http', 'Raw HTTP developer docs'],
  ['/docs/typescript', 'TypeScript developer docs'],
  ['/docs/python', 'Python developer docs'],
  ['/docs/mcp', 'MCP developer docs'],
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
  ['/compare/blockrun', 'Clervo and BlockRun'],
  ['/trust', 'Trust center'],
];

for (const [route, title] of routes) {
  const content = render(`https://clervo.dev${route}`);
  const canonical = route === '/' ? '/' : `${route}/`;
  const html = template
    .replace('<div id="root"></div>', `<div id="root" data-prerender-path="${route}">${content}</div>`)
    .replace(
      /<title>.*?<\/title>/u,
      `<title>${title} — Clervo</title><link rel="canonical" href="https://clervo.dev${canonical}">`,
    );
  const destination = route === '/'
    ? path.join(dist, 'index.html')
    : path.join(dist, route.slice(1), 'index.html');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html);
}

// The site previously answered 200 for every unknown URL, so a crawler saw a
// site that claimed every path existed and would not index it. Every real route
// above is a file, so an unmatched path is genuinely not a page: the deployment
// serves this document with a real 404 status
// (`not_found_handling: 404-page` in apps/site/wrangler.jsonc).
//
// It is rendered from the same app as every other route, so the 404 page is a
// real page rather than a bare string, and it carries no canonical link —
// nothing should be indexed as the canonical version of a missing route.
const notFoundPath = '/404';
await writeFile(
  path.join(dist, '404.html'),
  template
    .replace('<div id="root"></div>', `<div id="root" data-prerender-path="${notFoundPath}">${render(`https://clervo.dev${notFoundPath}`)}</div>`)
    .replace(/<title>.*?<\/title>/u, '<title>Route not found — Clervo</title><meta name="robots" content="noindex">'),
);

console.log(`site prerender: PASS (${routes.length} static routes, 404 document)`);
