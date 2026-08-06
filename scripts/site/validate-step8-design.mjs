#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (value) => readFile(path.join(root, value), 'utf8');
function invariant(condition, code) { if (!condition) throw new Error(code); }

const [favicon, mark, index, source, product, routes, prerender, validatePrerender] = await Promise.all([
  read('apps/site/public-assets/favicon.svg'),
  read('apps/site/public-assets/clervo-hollow-apex.svg'),
  read('apps/site/index.html'),
  read('apps/site/src/data/public-site-source.ts'),
  read('apps/site/src/product.ts'),
  read('apps/site/routes.json').then(JSON.parse),
  read('scripts/site/prerender.mjs'),
  read('scripts/site/validate-prerender.mjs'),
]);

for (const asset of [favicon, mark]) {
  invariant(asset.includes('M20 2 38 30H2L20 2'), 'hollow_apex_geometry_missing');
  invariant(asset.includes('#FF3B30') && asset.includes('#00E5FF') && asset.includes('#FFC800'), 'semantic_beam_colors_missing');
  invariant(asset.includes('hollow-apex-v1.0'), 'logo_authority_marker_missing');
}
invariant(!favicon.includes('a12 12') && !favicon.includes('#d6b86a'), 'legacy_favicon_detected');
invariant(index.includes('Outcome infrastructure for AI agents. Give your agent a task. Get a verified result.'), 'site_description_authority_missing');
invariant(index.includes('Buy outcomes. Not integrations.'), 'structured_brand_promise_missing');
invariant(index.includes('rel="canonical" href="https://clervo.dev/"'), 'root_canonical_missing');
invariant(index.includes('property="og:title"') && index.includes('name="twitter:title"'), 'social_metadata_missing');
invariant(source.includes("id: 'repository-fixture'"), 'fixture_source_missing');
invariant(source.includes('public_api_source_not_implemented'), 'api_source_fail_closed_missing');
invariant(source.includes('repository_fixture_cannot_claim_public_payment_or_operations'), 'fixture_truth_guard_missing');
invariant(routes.schemaVersion === 'clervo.site-routes.v1', 'route_manifest_schema_invalid');
invariant(routes.routes.length === 28, 'canonical_route_set_incomplete');
invariant(routes.aliases.some(({ path: value, target }) => value === '/build' && target === '/start'), 'build_alias_missing');
invariant(routes.aliases.some(({ path: value, target }) => value === '/proof-lab' && target === '/proof'), 'proof_alias_missing');
invariant(prerender.includes('apps/site/routes.json') && validatePrerender.includes('apps/site/routes.json'), 'prerender_manifest_not_shared');
invariant(!prerender.includes("['/build'") && !prerender.includes("['/proof-lab'"), 'legacy_canonical_prerender_route_detected');

invariant(product.includes('./data/public-site-source'), 'product_facade_bypasses_source');
invariant(!product.includes('generated/public/.well-known/clervo.json'), 'product_facade_imports_generated_fixture');
const pagesDir = path.join(root, 'apps/site/src/pages');
const publicPages = ['Home.tsx', 'Product.tsx', 'Catalog.tsx', 'Capability.tsx', 'Operation.tsx', 'Docs.tsx', 'Status.tsx', 'Trust.tsx'];
const pageNames = new Set(await readdir(pagesDir));
for (const name of publicPages) {
  invariant(pageNames.has(name), `public_page_missing:${name}`);
  const value = await read(`apps/site/src/pages/${name}`);
  invariant(/import\s+\{[^}]*discovery[^}]*\}\s+from\s+'\.\.\/product'/u.test(value), `public_page_bypasses_product_facade:${name}`);
  invariant(!value.includes('generated/public/'), `public_page_imports_generated_fixture:${name}`);
}

console.log(`Step 8 design validation: PASS (${routes.routes.length} canonical routes, ${publicPages.length} source-bound pages)`);
