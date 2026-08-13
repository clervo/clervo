#!/usr/bin/env node

// Projects generated/public into apps/site/public so the deployed site serves
// exactly what the generator produced.
//
// This script previously refused to run unless the discovery document declared
// the product not publicly distributed, not publicly available, and not
// callable. That was a frozen-status gate living in the publish path: the
// moment the runtime started taking payment, the only way to publish was to
// keep saying it did not. It is the reason the deployed site denied that the
// API was callable while the API was returning real payment challenges.
//
// The gate is replaced by an invariant that does not care what the status says:
// the projected files must equal the generated files, byte for byte. Truth is
// the generator's job, and the generator renders it from the probed registry.

import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalPath, siteRouteInventory } from './site-route-inventory.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'generated/public');
const target = path.join(root, 'apps/site/public');
const mediaSource = path.join(root, 'apps/site/public-assets');
const renderSource = path.join(root, 'apps/site/media/optimized');
const discovery = JSON.parse(await readFile(path.join(source, '.well-known/clervo.json'), 'utf8'));
const status = JSON.parse(await readFile(path.join(source, 'status.json'), 'utf8'));
const routeInventory = await siteRouteInventory(root);
const siteRoutes = routeInventory.map(({ route }) => canonicalPath(route));

// The projection must carry the generator's observed truth through unchanged.
// A projected surface that has lost it is a surface that can no longer say what
// the runtime does.
if (!Array.isArray(discovery.observedTruth?.products) || discovery.observedTruth.products.length === 0) {
  throw new Error('site_public_projection_missing_observed_truth');
}

// Sitemap and prerender consume one generated inventory. Writing the sitemap
// into generated/public before projection preserves the byte-for-byte source
// invariant and prevents route counts from drifting between human and machine
// surfaces.
await writeFile(path.join(source, 'sitemap.xml'), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...siteRoutes.map((route) => `  <url><loc>https://clervo.dev${route}</loc></url>`),
  '</urlset>',
  '',
].join('\n'));

const xml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');
const observedAt = discovery.observedTruth.provenance.observedAt;
const packageVerifiedAt = status.packages.verifiedAt;
const liveFamilies = discovery.observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'live').length;
const packageSummary = status.packages.items
  .map(({ name, version }) => `${name} ${version}`)
  .join(', ');
const feedItems = [
  {
    id: `urn:clervo:catalog:${discovery.observedTruth.provenance.releaseId ?? observedAt}`,
    title: 'Public catalog observation regenerated',
    date: observedAt,
    description: `${liveFamilies} of ${discovery.observedTruth.products.length} product families were observed serving. The catalog and status surfaces were regenerated from that observation.`,
  },
  {
    id: `urn:clervo:packages:${packageVerifiedAt}`,
    title: 'Clervo Connect packages registry-verified',
    date: packageVerifiedAt,
    description: `${packageSummary} were observed on their public registries.`,
  },
].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
await writeFile(path.join(source, 'feed.xml'), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
  '  <channel>',
  '    <title>Clervo changelog</title>',
  '    <link>https://clervo.dev/changelog/</link>',
  '    <description>Dated, source-bound changes to Clervo public product and distribution state.</description>',
  '    <language>en</language>',
  '    <atom:link href="https://clervo.dev/feed.xml" rel="self" type="application/rss+xml"/>',
  ...feedItems.flatMap((item) => [
    '    <item>',
    `      <guid isPermaLink="false">${xml(item.id)}</guid>`,
    `      <title>${xml(item.title)}</title>`,
    '      <link>https://clervo.dev/changelog/</link>',
    `      <pubDate>${new Date(item.date).toUTCString()}</pubDate>`,
    `      <description>${xml(item.description)}</description>`,
    '    </item>',
  ]),
  '  </channel>',
  '</rss>',
  '',
].join('\n'));

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
await cp(mediaSource, path.join(target, 'assets'), { recursive: true });
await cp(renderSource, path.join(target, 'assets/renders'), { recursive: true });

// Search/index crawlers are allowed to read the human and machine surfaces.
// OAI-SearchBot is named explicitly so ChatGPT Search inclusion does not depend
// on a crawler interpreting the generic group. GPTBot is not given a separate
// training policy here; this file only states the existing public crawl policy.
await writeFile(path.join(target, 'robots.txt'), [
  'User-agent: OAI-SearchBot',
  'Allow: /',
  '',
  'User-agent: *',
  'Allow: /',
  '',
  'Sitemap: https://clervo.dev/sitemap.xml',
  '',
].join('\n'));

await writeFile(path.join(target, '_redirects'), [
  ...siteRoutes
    .filter((route) => route !== '/')
    .map((route) => {
      return `${route.slice(0, -1)} ${route} 301`;
    }),
  '/models /catalog/ 301',
  '',
].join('\n'));
await writeFile(path.join(target, 'manifest.webmanifest'), `${JSON.stringify({
  name: 'Clervo',
  short_name: 'Clervo',
  description: 'Outcome infrastructure for agents.',
  start_url: '/',
  display: 'standalone',
  background_color: '#000000',
  theme_color: '#000000',
  icons: [{ src: '/assets/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
}, null, 2)}\n`);
await writeFile(path.join(target, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
  '  Cross-Origin-Opener-Policy: same-origin',
  // The visible site is self-hosted: Clervo identity/media, fonts and the Home
  // ecosystem typography do not depend on a third-party asset origin.
  '  Content-Security-Policy: default-src \'self\'; script-src \'self\' https://static.cloudflareinsights.com; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; font-src \'self\'; connect-src \'self\' https://cloudflareinsights.com https://*.cloudflareinsights.com; object-src \'none\'; base-uri \'self\'; frame-ancestors \'none\'; form-action \'self\'',
  '',
  '/assets/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
  // The agent-facing documents are for machine readers, which need to fetch
  // them cross-origin and must receive them as text rather than a download.
  '/skill.md',
  '  Content-Type: text/markdown; charset=utf-8',
  '  Access-Control-Allow-Origin: *',
  '',
  '/agent.md',
  '  Content-Type: text/markdown; charset=utf-8',
  '  Access-Control-Allow-Origin: *',
  '',
  '/llms.txt',
  '  Content-Type: text/plain; charset=utf-8',
  '  Access-Control-Allow-Origin: *',
  '',
  '/llms-full.txt',
  '  Content-Type: text/plain; charset=utf-8',
  '  Access-Control-Allow-Origin: *',
  '',
  '/feed.xml',
  '  Content-Type: application/rss+xml; charset=utf-8',
  '  Access-Control-Allow-Origin: *',
  '',
].join('\n'));

// The invariant that replaces the frozen-status gate: every generated file is
// present in the projection and identical to its source. The site cannot
// disagree with the generator, whatever either of them happens to say.
async function generatedFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await generatedFiles(path.join(directory, entry.name), relative));
    else files.push(relative);
  }
  return files.sort();
}

const projectionMismatches = [];
for (const relative of await generatedFiles(source)) {
  const projected = path.join(target, relative);
  try {
    await stat(projected);
  } catch {
    projectionMismatches.push(`${relative}: missing from the projection`);
    continue;
  }
  const [generated, published] = await Promise.all([
    readFile(path.join(source, relative)),
    readFile(projected),
  ]);
  if (!generated.equals(published)) projectionMismatches.push(`${relative}: differs from the generated file`);
}
if (projectionMismatches.length > 0) {
  throw new Error(`site_public_projection_differs_from_generated: ${projectionMismatches.join('; ')}`);
}

console.log(`site public projection: PASS (${discovery.runtimeRelease.sourceCommit})`);
