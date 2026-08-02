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
  ['/product', 'Product and capabilities'],
  ['/build', 'Build with Clervo'],
  ['/proof-lab', 'Proof Lab'],
  ['/docs', 'Developer docs'],
  ['/docs/http', 'Raw HTTP developer docs'],
  ['/docs/typescript', 'TypeScript developer docs'],
  ['/docs/python', 'Python developer docs'],
  ['/docs/mcp', 'MCP developer docs'],
  ['/pricing', 'Pricing truth'],
  ['/benchmarks', 'Benchmark truth'],
  ['/security', 'Security controls'],
  ['/legal', 'Legal boundaries'],
  ['/status', 'Product status'],
];

for (const [route, title] of routes) {
  const content = render(`https://clervo.dev${route}`);
  const html = template
    .replace('<div id="root"></div>', `<div id="root">${content}</div>`)
    .replace(
      /<title>.*?<\/title>/u,
      `<title>${title} — Clervo</title><link rel="canonical" href="https://clervo.dev${route}">`,
    );
  const destination = route === '/'
    ? path.join(dist, 'index.html')
    : path.join(dist, route.slice(1), 'index.html');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html);
}

console.log(`site prerender: PASS (${routes.length} static routes)`);
