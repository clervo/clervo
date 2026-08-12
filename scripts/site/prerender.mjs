#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { canonicalPath, siteRouteInventory } from './site-route-inventory.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const dist = path.join(root, 'apps/site/dist');
const serverBundle = path.join(root, 'apps/site/dist-server/entry-server.js');
const template = await readFile(path.join(dist, 'index.html'), 'utf8');
const { render } = await import(serverBundle);

const routes = await siteRouteInventory(root);
const escapeAttribute = (value) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
const segmentLabel = (segment) => decodeURIComponent(segment)
  .replaceAll('-', ' ')
  .replaceAll('_', ' ')
  .replace(/\b\w/gu, (letter) => letter.toUpperCase());

function schemaType(route) {
  if (route === '/catalog') return 'CollectionPage';
  if (route.startsWith('/docs/') || route.startsWith('/operations/')) return 'TechArticle';
  return 'WebPage';
}

function routeStructuredData({ route, title, description, canonical }) {
  const url = `https://clervo.dev${canonical}`;
  const parts = route.split('/').filter(Boolean);
  const breadcrumbs = [
    { '@type': 'ListItem', position: 1, name: 'Clervo', item: 'https://clervo.dev/' },
    ...parts.map((segment, index) => ({
      '@type': 'ListItem',
      position: index + 2,
      name: index === parts.length - 1 ? title : segmentLabel(segment),
      item: `https://clervo.dev/${parts.slice(0, index + 1).map(encodeURIComponent).join('/')}/`,
    })),
  ];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': schemaType(route),
        '@id': `${url}#page`,
        url,
        name: title,
        description,
        inLanguage: 'en',
        isPartOf: { '@id': 'https://clervo.dev/#website' },
        about: { '@id': 'https://clervo.dev/#software' },
        publisher: { '@id': 'https://clervo.dev/#organization' },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumbs`,
        itemListElement: breadcrumbs,
      },
    ],
  };
}

for (const { route, title, description: routeDescription } of routes) {
  const content = render(`https://clervo.dev${route}`);
  const canonical = canonicalPath(route);
  const description = routeDescription
    ?? (route === '/'
      ? 'Give your agent a task. Get a verified result. Clervo connects models, data, and secure execution through one inspectable outcome contract.'
      : `${title} from Clervo, with current lifecycle, product behavior, and evidence boundaries kept explicit.`);
  const routeJsonLd = JSON.stringify(routeStructuredData({ route, title, description, canonical })).replaceAll('<', '\\u003c');
  // Use a replacement callback: rendered contract/schema text can legitimately
  // contain `$&`, which has special meaning in String.replace replacement
  // strings and would otherwise inject a second empty root into the HTML.
  const html = template
    .replace('<div id="root"></div>', () => `<div id="root" data-prerender-path="${route}">${content}</div>`)
    .replace(
      /<title>.*?<\/title>/u,
      `<title>${escapeAttribute(title)} — Clervo</title><link rel="canonical" href="https://clervo.dev${canonical}">`,
    )
    .replace(/<meta name="description" content="[^"]*" \/>/u, `<meta name="description" content="${escapeAttribute(description)}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/u, `<meta property="og:title" content="${escapeAttribute(title)} — Clervo" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/u, `<meta property="og:description" content="${escapeAttribute(description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/u, `<meta property="og:url" content="https://clervo.dev${canonical}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*" \/>/u, `<meta name="twitter:title" content="${escapeAttribute(title)} — Clervo" />`)
    .replace(/<meta name="twitter:description" content="[^"]*" \/>/u, `<meta name="twitter:description" content="${escapeAttribute(description)}" />`)
    .replace('</head>', () => `${route === '/proof' || route === '/proof-lab' ? `<!-- b12-evidence-surface-v1:${route.slice(1)} -->\n` : ''}<script type="application/ld+json" data-clervo-route-jsonld>${routeJsonLd}</script>\n</head>`);
  const destination = route === '/'
    ? path.join(dist, 'index.html')
    : path.join(dist, route.slice(1), 'index.html');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html);
}

// The site previously answered 200 for every unknown URL, so a crawler saw a
// site that claimed every path existed and would not index it. Every real route
// above is a file, so an unmatched path is genuinely not a page: the deployment
// serves this document with a real 404 status (`not_found_handling: 404-page`).
const notFoundPath = '/404';
await writeFile(
  path.join(dist, '404.html'),
  template
    .replace('<div id="root"></div>', () => `<div id="root" data-prerender-path="${notFoundPath}">${render(`https://clervo.dev${notFoundPath}`)}</div>`)
    .replace(/<title>.*?<\/title>/u, '<title>Route not found — Clervo</title><meta name="robots" content="noindex">')
    .replace(/<meta name="robots" content="[^"]*" \/>/u, '<meta name="robots" content="noindex" />'),
);

console.log(`site prerender: PASS (${routes.length} static routes, 404 document)`);
