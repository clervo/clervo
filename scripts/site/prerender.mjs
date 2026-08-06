#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const dist = path.join(root, 'apps/site/dist');
const serverBundle = path.join(root, 'apps/site/dist-server/entry-server.js');
const template = await readFile(path.join(dist, 'index.html'), 'utf8');
const manifest = JSON.parse(await readFile(path.join(root, 'apps/site/routes.json'), 'utf8'));
const { render } = await import(serverBundle);

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function destinationFor(route) {
  return route === '/' ? path.join(dist, 'index.html') : path.join(dist, route.slice(1), 'index.html');
}

for (const route of manifest.routes) {
  const content = render(`https://clervo.dev${route.path}`);
  const canonical = `https://clervo.dev${route.path}`;
  const html = template
    .replace('<div id="root"></div>', `<div id="root">${content}</div>`)
    .replace(/<title>.*?<\/title>/u, `<title>${escapeHtml(route.title)} — Clervo</title>`)
    .replace(/<link rel="canonical"[^>]*>/u, `<link rel="canonical" href="${canonical}" />`)
    .replace(/<meta property="og:url"[^>]*>/u, `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta property="og:title"[^>]*>/u, `<meta property="og:title" content="${escapeHtml(route.title)} — Clervo" />`);
  const destination = destinationFor(route.path);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html);
}

for (const alias of manifest.aliases) {
  const canonical = `https://clervo.dev${alias.target}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="canonical" href="${canonical}"><meta http-equiv="refresh" content="0;url=${alias.target}"><title>Moved — Clervo</title></head><body><p>This route moved to <a href="${alias.target}">${alias.target}</a>.</p><script>location.replace(${JSON.stringify(alias.target)});</script></body></html>`;
  const destination = destinationFor(alias.path);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html);
}

console.log(`site prerender: PASS (${manifest.routes.length} canonical routes, ${manifest.aliases.length} aliases)`);
