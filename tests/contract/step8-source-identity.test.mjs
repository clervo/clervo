import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Step 8C replaces the legacy favicon with the locked Hollow Apex geometry', async () => {
  const favicon = await read('apps/site/public-assets/favicon.svg');
  const mark = await read('apps/site/public-assets/clervo-hollow-apex.svg');
  for (const asset of [favicon, mark]) {
    assert.match(asset, /M20 2 38 30H2L20 2/);
    assert.match(asset, /#FF3B30/); assert.match(asset, /#00E5FF/); assert.match(asset, /#FFC800/);
    assert.match(asset, /hollow-apex-v1\.0/);
  }
  assert.doesNotMatch(favicon, /#d6b86a|a12 12/u);
});

test('Step 8C metadata uses the permanent category, human promise, and brand promise', async () => {
  const index = await read('apps/site/index.html');
  assert.match(index, /Outcome infrastructure for AI agents\. Give your agent a task\. Get a verified result\./);
  assert.match(index, /Buy outcomes\. Not integrations\./);
  assert.match(index, /property="og:title"/);
  assert.match(index, /name="twitter:title"/);
  assert.match(index, /rel="canonical" href="https:\/\/clervo\.dev\/"/);
});

test('Step 8C binds public pages to one typed repository-fixture source through the product facade', async () => {
  const source = await read('apps/site/src/data/public-site-source.ts');
  const product = await read('apps/site/src/product.ts');
  assert.match(source, /interface PublicSiteSource/);
  assert.match(source, /repositoryFixtureSource/);
  assert.match(source, /public_api_source_not_implemented/);
  assert.match(product, /\.\/data\/public-site-source/);
  assert.doesNotMatch(product, /generated\/public\/\.well-known\/clervo\.json/);
  for (const page of ['Home', 'Product', 'Catalog', 'Capability', 'Operation', 'Docs', 'Status', 'Trust']) {
    const value = await read(`apps/site/src/pages/${page}.tsx`);
    assert.ok(value.includes('discovery') && value.includes("from '../product'"));
    assert.doesNotMatch(value, /generated\/public\//u);
  }
});
test('Step 8C route manifest covers the complete locked public surface and safe legacy aliases', async () => {
  const manifest = JSON.parse(await read('apps/site/routes.json'));
  assert.equal(manifest.routes.length, 28);
  const paths = new Set(manifest.routes.map(({ path }) => path));
  for (const path of ['/', '/product', '/catalog', '/start', '/proof', '/status', '/changelog', '/legal/terms', '/legal/privacy', '/legal/payments', '/legal/acceptable-use', '/capabilities/search', '/operations/search.web']) assert.ok(paths.has(path), path);
  assert.deepEqual(manifest.aliases, [{ path: '/build', target: '/start' }, { path: '/proof-lab', target: '/proof' }]);
});
