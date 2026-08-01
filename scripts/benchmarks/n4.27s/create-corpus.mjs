#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const frozenAt = '2026-07-31T22:00:00.000Z';
const familyProfiles = {
  commerce_marketplaces: 'commerce',
  property_local_markets: 'property',
  company_competitive: 'companies',
  research_evidence: 'research',
  developer_agent_retrieval: 'developer_documentation',
};

const definitions = {
  commerce_marketplaces: [
    ['WooCommerce LoginKit current USD offer', ['loginkit', 'usd'], ['https://woocommerce.com/products/loginkit/'], 'woocommerce_store_api', 'en', 'US'],
    ['WooCommerce AI Semantic Search current USD offer', ['semantic', 'search', 'usd'], ['https://woocommerce.com/products/ai-semantic-search/'], 'woocommerce_store_api', 'en', 'US'],
    ['WooCommerce Store Vacation Mode current offer', ['store', 'vacation', 'mode'], ['https://woocommerce.com/products/store-vacation-mode/'], 'woocommerce_store_api', 'en', 'US'],
    ['WooCommerce Automatic Order Expiration current offer', ['automatic', 'order', 'expiration'], ['https://woocommerce.com/products/automatic-order-expiration/'], 'woocommerce_store_api', 'en', 'US'],
    ['WooCommerce Trendyol Integration current offer', ['trendyol', 'integration'], ['https://woocommerce.com/products/trendyol/'], 'woocommerce_store_api', 'en', 'US'],
    ['WooCommerce Product Add-Ons current marketplace offer', ['product', 'add-ons'], ['https://woocommerce.com/products/product-add-ons/'], 'woocommerce_store_api', 'en', 'GB'],
    ['WooCommerce Subscriptions current marketplace offer', ['woocommerce', 'subscriptions'], ['https://woocommerce.com/products/woocommerce-subscriptions/'], 'woocommerce_store_api', 'en', 'CA'],
    ['WooCommerce Bookings current marketplace offer', ['woocommerce', 'bookings'], ['https://woocommerce.com/products/woocommerce-bookings/'], 'woocommerce_store_api', 'en', 'AU'],
    ['WooCommerce Google for WooCommerce current offer', ['google', 'woocommerce'], ['https://woocommerce.com/products/google-listings-and-ads/'], 'woocommerce_store_api', 'en', 'US'],
    ['WooCommerce FMA Extra Fee and Charges current offer', ['extra', 'fee', 'charges'], ['https://woocommerce.com/products/extra-fee-and-charges/'], 'woocommerce_store_api', 'en', 'US'],
    ['WooCommerce nonexistent Quantum Narwhal extension 987654', [], [], 'woocommerce_store_api', 'en', 'US', true],
  ],
  property_local_markets: [
    ['NYC rolling sales property dataset', ['rolling', 'sales'], ['data.cityofnewyork.us'], 'government_open_data', 'en', 'US'],
    ['Chicago building permits open data', ['building', 'permits'], ['data.cityofchicago.org'], 'government_open_data', 'en', 'US'],
    ['Seattle real property sales open data', ['real', 'property', 'sales'], ['data.seattle.gov'], 'government_open_data', 'en', 'US'],
    ['Austin issued construction permits open data', ['issued', 'construction', 'permits'], ['data.austintexas.gov'], 'government_open_data', 'en', 'US'],
    ['San Francisco assessor property characteristics', ['assessor', 'property'], ['data.sfgov.org'], 'government_open_data', 'en', 'US'],
    ['Los Angeles building permits open data', ['building', 'permits'], ['data.lacity.org'], 'government_open_data', 'en', 'US'],
    ['Dallas building permits open data', ['building', 'permits'], ['www.dallasopendata.com'], 'government_open_data', 'en', 'US'],
    ['Montgomery County real property sales open data', ['real', 'property', 'sales'], ['data.montgomerycountymd.gov'], 'government_open_data', 'en', 'US'],
    ['New Orleans building permits open data', ['building', 'permits'], ['data.nola.gov'], 'government_open_data', 'en', 'US'],
    ['Vancouver property tax report open data', ['property', 'tax'], ['opendata.vancouver.ca'], 'government_open_data', 'en', 'CA'],
    ['Open data nonexistent Zircon Borough property dataset 987654', [], [], 'government_open_data', 'en', 'US', true],
  ],
  company_competitive: [
    ['Astera Labs recent annual report 10-K', ['astera', 'labs', '10-k'], ['https://www.sec.gov/Archives/edgar/data/1736297/'], 'sec_edgar', 'en', 'US'],
    ['Reddit recent annual report 10-K', ['reddit', '10-k'], ['https://www.sec.gov/Archives/edgar/data/1713445/'], 'sec_edgar', 'en', 'US'],
    ['Rubrik recent annual report 10-K', ['rubrik', '10-k'], ['https://www.sec.gov/Archives/edgar/data/1943896/'], 'sec_edgar', 'en', 'US'],
    ['CoreWeave recent annual report 10-K', ['coreweave', '10-k'], ['https://www.sec.gov/Archives/edgar/data/1769628/'], 'sec_edgar', 'en', 'US'],
    ['Klaviyo recent annual report 10-K', ['klaviyo', '10-k'], ['https://www.sec.gov/Archives/edgar/data/1835830/'], 'sec_edgar', 'en', 'US'],
    ['Tempus AI recent annual report 10-K', ['tempus', 'ai', '10-k'], ['https://www.sec.gov/Archives/edgar/data/1717115/'], 'sec_edgar', 'en', 'US'],
    ['Arm Holdings recent annual report 20-F', ['arm', 'holdings', '20-f'], ['https://www.sec.gov/Archives/edgar/data/1973239/'], 'sec_edgar', 'en', 'GB'],
    ['Birkenstock Holding recent annual report 20-F', ['birkenstock', '20-f'], ['https://www.sec.gov/Archives/edgar/data/1977102/'], 'sec_edgar', 'de', 'DE'],
    ['Maplebear Instacart recent annual report 10-K', ['maplebear', '10-k'], ['https://www.sec.gov/Archives/edgar/data/1579091/'], 'sec_edgar', 'en', 'US'],
    ['Cava Group recent annual report 10-K', ['cava', 'group', '10-k'], ['https://www.sec.gov/Archives/edgar/data/1639438/'], 'sec_edgar', 'en', 'US'],
    ['SEC nonexistent Quantum Narwhal Holdings 987654 10-K', [], [], 'sec_edgar', 'en', 'US', true],
  ],
  research_evidence: [
    ['Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks DOI', ['retrieval-augmented', 'generation'], ['https://doi.org/10.48550/arXiv.2005.11401', 'https://doi.org/10.5555/3495724.3496517'], 'crossref', 'en', 'US'],
    ['Attention Is All You Need DOI', ['attention', 'all', 'need'], ['https://doi.org/10.48550/arXiv.1706.03762', 'https://doi.org/10.5555/3295222.3295349'], 'crossref', 'en', 'US'],
    ['BERT Pre-training of Deep Bidirectional Transformers DOI', ['bert', 'pre-training'], ['https://doi.org/10.48550/arXiv.1810.04805'], 'crossref', 'en', 'US'],
    ['Mastering the game of Go with deep neural networks and tree search DOI 10.1038/nature16961', ['mastering', 'game', 'go'], ['https://doi.org/10.1038/nature16961'], 'crossref', 'en', 'US'],
    ['Direct Preference Optimization language models DOI', ['direct', 'preference', 'optimization'], ['https://doi.org/10.48550/arXiv.2305.18290'], 'crossref', 'en', 'US'],
    ['Segment Anything research paper DOI', ['segment', 'anything'], ['https://doi.org/10.48550/arXiv.2304.02643'], 'crossref', 'en', 'US'],
    ['A programmable dual-RNA-guided DNA endonuclease DOI 10.1126/science.1225829', ['programmable', 'rna-guided', 'endonuclease'], ['https://doi.org/10.1126/science.1225829'], 'crossref', 'en', 'US'],
    ['LoRA Low-Rank Adaptation language models DOI', ['lora', 'low-rank', 'adaptation'], ['https://doi.org/10.48550/arXiv.2106.09685'], 'crossref', 'en', 'US'],
    ['Chain-of-Thought Prompting Elicits Reasoning DOI', ['chain-of-thought', 'prompting'], ['https://doi.org/10.48550/arXiv.2201.11903'], 'crossref', 'en', 'US'],
    ['Toolformer language models teach themselves tools DOI', ['toolformer', 'tools'], ['https://doi.org/10.48550/arXiv.2302.04761'], 'crossref', 'en', 'US'],
    ['Crossref nonexistent Quantum Narwhal Study 987654 DOI', [], [], 'crossref', 'en', 'US', true],
  ],
  developer_agent_retrieval: [
    ['npm package zod current version schema validation', ['zod', 'schema', 'validation'], ['https://www.npmjs.com/package/zod'], 'developer_registry', 'en', 'US'],
    ['npm package hono current version web framework', ['hono', 'web', 'framework'], ['https://www.npmjs.com/package/hono'], 'developer_registry', 'en', 'JP'],
    ['npm package fastify current version web framework', ['fastify', 'web', 'framework'], ['https://www.npmjs.com/package/fastify'], 'developer_registry', 'en', 'GB'],
    ['npm package undici current version HTTP client', ['undici', 'http', 'client'], ['https://www.npmjs.com/package/undici'], 'developer_registry', 'en', 'US'],
    ['npm package drizzle-orm current version TypeScript ORM', ['drizzle-orm', 'typescript', 'orm'], ['https://www.npmjs.com/package/drizzle-orm'], 'developer_registry', 'en', 'US'],
    ['GitHub repository modelcontextprotocol/typescript-sdk in:name', ['modelcontextprotocol', 'typescript-sdk'], ['https://github.com/modelcontextprotocol/typescript-sdk'], 'developer_registry', 'en', 'US'],
    ['GitHub repository openai agents python SDK', ['openai', 'agents', 'python'], ['https://github.com/openai/openai-agents-python'], 'developer_registry', 'en', 'US'],
    ['GitHub repository microsoft playwright current release', ['microsoft', 'playwright'], ['https://github.com/microsoft/playwright'], 'developer_registry', 'en', 'US'],
    ['GitHub repository meilisearch engine current release', ['meilisearch', 'engine'], ['https://github.com/meilisearch/meilisearch'], 'developer_registry', 'fr', 'FR'],
    ['GitHub repository cloudflare agents SDK', ['cloudflare', 'agents', 'sdk'], ['https://github.com/cloudflare/agents'], 'developer_registry', 'en', 'US'],
    ['Developer registry nonexistent quantum-narwhal-sdk-987654', [], [], 'developer_registry', 'en', 'US', true],
  ],
};

const tasks = [];
const labels = [];
for (const [family, rows] of Object.entries(definitions)) {
  rows.forEach(([query, expectedTerms, expectedUrlPrefixes, sourceClass, language, region, noResult = false], index) => {
    const id = `n427s-${family.split('_')[0]}-${String(index + 1).padStart(2, '0')}`;
    const task = {
      id,
      family,
      query,
      verticalProfile: familyProfiles[family],
      locale: { language, region },
      accessMode: 'official_api',
      sourceClass,
      answerable: !noResult,
      freshnessSensitive: !noResult,
      queryKind: index % 2 === 0 ? 'exact' : 'semantic',
      requiresJavascript: false,
      controlledDegradation: false,
    };
    tasks.push(task);
    labels.push({
      taskId: id,
      noResult,
      expectedTerms,
      expectedUrlPrefixes,
      expectedSourceClass: sourceClass,
      evidenceExpectation: noResult ? 'no matching public record' : 'current public metadata with exact source URL and evidence text',
      sourceDateRecordedAt: frozenAt,
      validation: 'pending_preflight',
    });
  });
}

const corpus = {
  schemaVersion: 'clervo.n4.27s.staging-corpus.v1',
  frozenAt,
  finalRunLimit: 1,
  priorSealedSetsProhibited: ['benchmarks/n4.27', 'benchmarks/n4.27r/sealed-validation-corpus.v1.json'],
  tasks,
};
const labelSet = { schemaVersion: 'clervo.n4.27s.staging-labels.v1', frozenAt, labels };
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const corpusText = canonical(corpus);
const labelsText = canonical(labelSet);
const manifest = {
  schemaVersion: 'clervo.n4.27s.corpus-freeze.v1',
  frozenAt,
  tasks: tasks.length,
  tasksPerFamily: Object.fromEntries(Object.keys(definitions).map((family) => [family, tasks.filter((task) => task.family === family).length])),
  corpusSha256: sha256(corpusText),
  labelsSha256: sha256(labelsText),
  finalRunCount: 0,
  labelsValidated: false,
  implementationFrozen: false,
  evaluatorFrozen: false,
};

await mkdir(new URL('../../../benchmarks/n4.27s/', import.meta.url), { recursive: true });
await writeFile(new URL('../../../benchmarks/n4.27s/staging-corpus.v1.json', import.meta.url), corpusText);
await writeFile(new URL('../../../benchmarks/n4.27s/staging-labels.v1.json', import.meta.url), labelsText);
await writeFile(new URL('../../../benchmarks/n4.27s/corpus-freeze.v1.json', import.meta.url), canonical(manifest));
process.stdout.write(`${JSON.stringify(manifest)}\n`);
