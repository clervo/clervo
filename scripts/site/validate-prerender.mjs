#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalPath, siteRouteInventory } from './site-route-inventory.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const dist = path.join(root, 'apps/site/dist');
const inventory = await siteRouteInventory(root);
const expectedFiles = inventory.map(({ route }) => route === '/'
  ? 'index.html'
  : `${route.replace(/^\//u, '').replace(/\/$/u, '')}/index.html`);

const routeByFile = new Map(inventory.map((item) => [
  item.route === '/' ? 'index.html' : `${item.route.replace(/^\//u, '').replace(/\/$/u, '')}/index.html`,
  item,
]));
const routeSet = new Set(inventory.map(({ route }) => route === '/' ? '/' : route.replace(/\/+$/u, '')));
routeSet.add('/models'); // intentional redirect to /catalog/
const machineAssetPrefixes = [
  '/assets/', '/.well-known/', '/openapi.', '/catalog.json', '/capabilities.json', '/pricing.json',
  '/status.json', '/onboarding.json', '/models.json', '/llms.txt', '/llms-full.txt', '/skill.md', '/agent.md',
  '/feed.xml', '/sitemap.xml', '/manifest.webmanifest', '/robots.txt',
];

function plainText(html) {
  return html
    .replace(/<!--.*?-->/gu, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ');
}

function metaContent(html, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = html.match(new RegExp(`<meta\\s+[^>]*${escaped}[^>]*content="([^"]+)"[^>]*>`, 'iu'));
  return match?.[1] ?? null;
}

function assertRouteMetadata(file, html, route) {
  const expectedCanonical = `https://clervo.dev${canonicalPath(route.route)}`;
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"[^>]*>/iu)?.[1] ?? null;
  if (canonical !== expectedCanonical) throw new Error(`site_prerender_canonical_wrong:${file}:${canonical ?? 'missing'}`);
  if (!/<title>[^<]+ — Clervo<\/title>/u.test(html)) throw new Error(`site_prerender_title_missing:${file}`);
  for (const [label, selector] of [
    ['description', 'name="description"'],
    ['og_title', 'property="og:title"'],
    ['og_description', 'property="og:description"'],
    ['og_url', 'property="og:url"'],
    ['twitter_title', 'name="twitter:title"'],
    ['twitter_description', 'name="twitter:description"'],
    ['robots', 'name="robots"'],
  ]) {
    if (metaContent(html, selector) === null) throw new Error(`site_prerender_${label}_missing:${file}`);
  }
  if (metaContent(html, 'property="og:url"') !== expectedCanonical) throw new Error(`site_prerender_og_url_wrong:${file}`);
  const robots = metaContent(html, 'name="robots"') ?? '';
  if (!robots.includes('index') || !robots.includes('follow')) throw new Error(`site_prerender_robots_wrong:${file}:${robots}`);

  const jsonLdMatch = html.match(/<script type="application\/ld\+json" data-clervo-route-jsonld>([\s\S]*?)<\/script>/u);
  if (jsonLdMatch?.[1] === undefined) throw new Error(`site_prerender_route_jsonld_missing:${file}`);
  try {
    const jsonLd = JSON.parse(jsonLdMatch[1]);
    const page = Array.isArray(jsonLd['@graph']) ? jsonLd['@graph'][0] : jsonLd;
    if (page?.url !== expectedCanonical) throw new Error('route_jsonld_url_mismatch');
    if (typeof page?.name !== 'string' || page.name.length < 2) throw new Error('route_jsonld_name_missing');
    if (typeof page?.description !== 'string' || page.description.length < 20) throw new Error('route_jsonld_description_missing');
  } catch (error) {
    throw new Error(`site_prerender_route_jsonld_invalid:${file}:${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateInternalLinks(file, html) {
  const hrefs = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/giu)].map((match) => match[1]);
  for (const href of hrefs) {
    if (href === '' || href.startsWith('#') || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    if (!href.startsWith('/')) throw new Error(`site_prerender_relative_link_unresolved:${file}:${href}`);
    const pathname = href.split(/[?#]/u)[0] || '/';
    if (machineAssetPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) continue;
    const normalized = pathname === '/' ? '/' : pathname.replace(/\/+$/u, '');
    if (!routeSet.has(normalized)) throw new Error(`site_prerender_internal_link_unknown:${file}:${href}`);
  }
}

for (const file of expectedFiles) {
  const html = await readFile(path.join(dist, file), 'utf8');
  const text = plainText(html);
  if (text.length < 20) throw new Error(`site_prerender_content_missing:${file}`);
  if (/\bundefined\b/u.test(text)) throw new Error(`site_prerender_undefined_value:${file}`);
  if (/href="[^"]*(?:undefined|null)[^"]*"/u.test(html)) throw new Error(`site_prerender_bad_href:${file}`);
  if (html.includes('<div id="root"></div>')) throw new Error(`site_prerender_empty:${file}`);
  const h1Count = (html.match(/<h1\b/gu) ?? []).length;
  if (h1Count !== 1) throw new Error(`site_prerender_h1_count:${file}:${h1Count}`);
  const route = routeByFile.get(file);
  if (route === undefined) throw new Error(`site_prerender_inventory_missing:${file}`);
  assertRouteMetadata(file, html, route);
  validateInternalLinks(file, html);
}

// The 404 document is what makes a nonexistent URL answer 404 instead of 200.
// It is checked separately because it is deliberately not canonical and
// deliberately not indexed.
const notFound = await readFile(path.join(dist, '404.html'), 'utf8');
const notFoundText = plainText(notFound);
if (!notFoundText.includes('This path has no contract.')) throw new Error('site_prerender_content_missing:404.html');
if (notFound.includes('<div id="root"></div>')) throw new Error('site_prerender_empty:404.html');
if (notFound.includes('rel="canonical"')) throw new Error('site_prerender_404_must_not_be_canonical');
if (!/name="robots" content="noindex(?:,[^"]*)?"/u.test(notFound)) throw new Error('site_prerender_404_must_be_noindex');
if ((notFound.match(/<h1\b/gu) ?? []).length !== 1) throw new Error('site_prerender_404_h1_count');

console.log(`site prerender validation: PASS (${expectedFiles.length} routes, metadata, internal links, 404 document)`);
