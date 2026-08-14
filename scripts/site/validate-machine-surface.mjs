#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { canonicalPath, siteRouteInventory } from './site-route-inventory.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const dist = path.join(root, 'apps/site/dist');
const required = [
  'robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt', 'skill.md', 'agent.md',
  'openapi.json', 'openapi.yaml', 'catalog.json', 'capabilities.json', 'models.json',
  'status.json', 'pricing.json', 'onboarding.json', '.well-known/clervo.json', '.well-known/x402.json',
  '_headers', 'manifest.webmanifest',
];

for (const relative of required) {
  const file = path.join(dist, relative);
  const info = await stat(file);
  if (!info.isFile() || info.size < 8) throw new Error(`site_machine_surface_missing_or_empty:${relative}`);
  const text = await readFile(file, 'utf8');
  if (/\bundefined\b/u.test(text)) throw new Error(`site_machine_surface_undefined:${relative}`);
}

const robots = await readFile(path.join(dist, 'robots.txt'), 'utf8');
if (!/User-agent:\s*OAI-SearchBot[\s\S]*?Allow:\s*\//u.test(robots)) throw new Error('site_robots_oai_searchbot_missing');
if (!robots.includes('Sitemap: https://clervo.dev/sitemap.xml')) throw new Error('site_robots_sitemap_missing');

const inventory = await siteRouteInventory(root);
const sitemap = await readFile(path.join(dist, 'sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>(https:\/\/clervo\.dev[^<]+)<\/loc>/gu)].map((match) => match[1]);
const expectedUrls = inventory.map(({ route }) => `https://clervo.dev${canonicalPath(route)}`);
if (sitemapUrls.length !== expectedUrls.length) throw new Error(`site_sitemap_route_count:${sitemapUrls.length}/${expectedUrls.length}`);
for (const url of expectedUrls) {
  const count = sitemapUrls.filter((item) => item === url).length;
  if (count !== 1) throw new Error(`site_sitemap_canonical_count:${url}:${count}`);
}

const headers = await readFile(path.join(dist, '_headers'), 'utf8');
if (!headers.includes("img-src 'self' data:")) throw new Error('site_csp_self_hosted_images_missing');
if (headers.includes('upload.wikimedia.org')) throw new Error('site_csp_remote_logo_origin_present');
if (!headers.includes("object-src 'none'")) throw new Error('site_csp_object_src_missing');
if (!headers.includes("frame-ancestors 'none'")) throw new Error('site_csp_frame_ancestors_missing');

for (const relative of ['catalog.json', 'capabilities.json', 'models.json', 'status.json', 'pricing.json', 'onboarding.json', '.well-known/clervo.json', '.well-known/x402.json', 'openapi.json', 'manifest.webmanifest']) {
  try { JSON.parse(await readFile(path.join(dist, relative), 'utf8')); }
  catch (error) { throw new Error(`site_machine_json_invalid:${relative}:${error instanceof Error ? error.message : String(error)}`); }
}

const openapi = JSON.parse(await readFile(path.join(dist, 'openapi.json'), 'utf8'));
if (openapi.openapi !== '3.1.1') throw new Error(`site_openapi_version:${openapi.openapi ?? 'missing'}`);
if (openapi.jsonSchemaDialect !== 'https://json-schema.org/draft/2020-12/schema') throw new Error(`site_openapi_json_schema_dialect:${openapi.jsonSchemaDialect ?? 'missing'}`);

// llms.txt is generated as a compact documentation map. Validate its canonical
// relative machine links and current availability framing.
const llms = await readFile(path.join(dist, 'llms.txt'), 'utf8');
for (const needle of [
  '[OpenAPI contract](/openapi.json)',
  '[Catalog](/catalog.json)',
  '[Status](/status.json)',
  '[Agent skill](/skill.md)',
  'Current product availability',
  'Multi-chain RPC | unavailable',
]) {
  if (!llms.includes(needle)) throw new Error(`site_llms_reference_missing:${needle}`);
}

const skill = await readFile(path.join(dist, 'skill.md'), 'utf8');
for (const needle of ['# Clervo skill', '## When to use this skill', '## Failure behaviour', '## Machine-readable contracts']) {
  if (!skill.includes(needle)) throw new Error(`site_skill_reference_missing:${needle}`);
}
if (!/operation/iu.test(skill) || !/receipt/iu.test(skill) || !/replay/iu.test(skill)) throw new Error('site_skill_reference_incomplete');

const agent = await readFile(path.join(dist, 'agent.md'), 'utf8');
for (const needle of ['# Clervo for agents', '## Identity', '## Observed state', '## Idempotency contract', '## Discovery paths']) {
  if (!agent.includes(needle)) throw new Error(`site_agent_reference_missing:${needle}`);
}
if (!/payment/iu.test(agent) || !/replay/iu.test(agent) || !/unavailable/iu.test(agent)) throw new Error('site_agent_reference_incomplete');

console.log(`site machine surface validation: PASS (${required.length} canonical files, ${inventory.length} sitemap routes)`);
