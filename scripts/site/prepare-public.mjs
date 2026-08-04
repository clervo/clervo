#!/usr/bin/env node

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'generated/public');
const target = path.join(root, 'apps/site/public');
const mediaSource = path.join(root, 'apps/site/public-assets');
const renderSource = path.join(root, 'apps/site/media/optimized');
const discovery = JSON.parse(await readFile(path.join(source, '.well-known/clervo.json'), 'utf8'));

if (
  discovery.distribution?.noPublicDistribution !== true
  || discovery.distribution?.publicAvailable !== false
  || discovery.distribution?.callable !== false
) throw new Error('site_public_projection_unsafe');

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
await cp(mediaSource, path.join(target, 'assets'), { recursive: true });
await cp(renderSource, path.join(target, 'assets/renders'), { recursive: true });

await writeFile(path.join(target, 'robots.txt'), [
  'User-agent: *',
  'Allow: /',
  'Sitemap: https://clervo.dev/sitemap.xml',
  '',
].join('\n'));

const siteRoutes = [
  '/',
  '/research/',
  '/platform/',
  '/product',
  '/products/search/',
  '/products/ai/',
  '/products/sandbox/',
  '/products/rpc/',
  '/products/prediction/',
  '/products/crypto/',
  '/build',
  '/proof/',
  '/proof-lab',
  '/docs/quickstart/',
  '/docs/http',
  '/docs/typescript',
  '/docs/python',
  '/docs/mcp',
  '/docs/receipts/',
  '/docs/replay/',
  '/docs/failures/',
  '/docs/x402/',
  '/docs/catalog/',
  '/pricing',
  '/benchmarks',
  '/security',
  '/legal',
  '/status',
  '/changelog/',
  '/compare/blockrun/',
  '/trust/',
];

await writeFile(path.join(target, 'sitemap.xml'), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...siteRoutes
    .map((route) => {
      const canonical = route === '/' ? '/' : `${route.replace(/\/+$/u, '')}/`;
      return `  <url><loc>https://clervo.dev${canonical}</loc></url>`;
    }),
  '</urlset>',
  '',
].join('\n'));

await writeFile(path.join(target, '_redirects'), [
  ...siteRoutes
    .filter((route) => route !== '/')
    .map((route) => {
      const canonical = `${route.replace(/\/+$/u, '')}/`;
      return `${canonical.slice(0, -1)} ${canonical} 301`;
    }),
  '',
].join('\n'));
await writeFile(path.join(target, 'manifest.webmanifest'), `${JSON.stringify({
  name: 'Clervo',
  short_name: 'Clervo',
  description: 'Outcome infrastructure for agents.',
  start_url: '/',
  display: 'standalone',
  background_color: '#050606',
  theme_color: '#050606',
  icons: [{ src: '/assets/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
}, null, 2)}\n`);
await writeFile(path.join(target, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
  '  Cross-Origin-Opener-Policy: same-origin',
  '  Content-Security-Policy: default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; font-src \'self\'; connect-src \'self\'; object-src \'none\'; base-uri \'self\'; frame-ancestors \'none\'; form-action \'self\'',
  '',
  '/assets/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
].join('\n'));

console.log(`site public projection: PASS (${discovery.distribution.releaseCandidateId})`);
