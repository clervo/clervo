#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const dist = path.join(root, 'apps/site/dist');
const manifest = JSON.parse(await readFile(path.join(root, 'apps/site/routes.json'), 'utf8'));

function destinationFor(route) {
  return route === '/' ? path.join(dist, 'index.html') : path.join(dist, route.slice(1), 'index.html');
}
function visibleText(html) {
  return html.replace(/<!--.*?-->/gu, '').replace(/<[^>]+>/gu, ' ').replace(/&amp;/gu, '&').replace(/\s+/gu, ' ');
}

for (const route of manifest.routes) {
  const file = destinationFor(route.path);
  const html = await readFile(file, 'utf8');
  const text = visibleText(html);
  if (!text.includes(route.expect)) throw new Error(`site_prerender_content_missing:${route.path}:${route.expect}`);
  if (!html.includes(`rel="canonical" href="https://clervo.dev${route.path}"`)) throw new Error(`site_prerender_canonical_missing:${route.path}`);
  if (!html.includes(`property="og:url" content="https://clervo.dev${route.path}"`)) throw new Error(`site_prerender_og_url_missing:${route.path}`);
  if (html.includes('<div id="root"></div>')) throw new Error(`site_prerender_empty:${route.path}`);
}
for (const alias of manifest.aliases) {
  const html = await readFile(destinationFor(alias.path), 'utf8');
  if (!html.includes(`rel="canonical" href="https://clervo.dev${alias.target}"`)) throw new Error(`site_alias_canonical_invalid:${alias.path}`);
  if (!html.includes(`location.replace(${JSON.stringify(alias.target)})`)) throw new Error(`site_alias_redirect_missing:${alias.path}`);
}

console.log(`site prerender validation: PASS (${manifest.routes.length} canonical routes, ${manifest.aliases.length} aliases)`);
