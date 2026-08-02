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

await writeFile(path.join(target, 'sitemap.xml'), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...[
    '/',
    '/product',
    '/build',
    '/proof-lab',
    '/docs/typescript',
    '/docs/python',
    '/docs/mcp',
    '/pricing',
    '/benchmarks',
    '/security',
    '/legal',
    '/status',
  ]
    .map((route) => `  <url><loc>https://clervo.dev${route}</loc></url>`),
  '</urlset>',
  '',
].join('\n'));

await writeFile(path.join(target, '_redirects'), '/* /index.html 200\n');
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
