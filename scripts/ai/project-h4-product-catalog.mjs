#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createDynamicAiProductionRuntime } from '../../apps/api/src/ai-dynamic-production-runtime.mjs';
import { createAiPublicModelList } from '../../dist/services/ai/src/product-catalog.js';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const runtime = await createDynamicAiProductionRuntime({
  env: {
    CLERVO_AI_BASE_URL: 'https://ai.clervo.dev/v1/',
    CLERVO_AI_GATEWAY_TOKEN: 'catalog-projection-placeholder',
    GROQ_API_KEY: 'catalog-projection-placeholder',
  },
  fetcher: async () => { throw new Error('h4_catalog_projection_network_forbidden'); },
  clock: () => new Date().toISOString(),
  artifactStore: { async put() { throw new Error('h4_catalog_projection_execution_forbidden'); } },
});
const models = createAiPublicModelList(runtime.productCatalog);
const destination = path.join(root, 'generated/b7-ai/public');
await mkdir(destination, { recursive: true });
await writeFile(path.join(destination, 'models.json'), `${JSON.stringify(models, null, 2)}\n`, { mode: 0o644 });

const canonical = models.data.filter(({ clervo }) => clervo.identityKind === 'canonical');
const active = canonical.filter(({ clervo }) => clervo.publicSellable && clervo.availability === 'available');
const temporary = canonical.filter(({ id }) => /(?:^|\/)gpt-5\.6|(?:^|\/)claude/iu.test(id));
process.stdout.write(`H4 product catalog: ${active.length} active, ${temporary.length} temporarily unavailable, ${canonical.length - active.length - temporary.length} other unavailable\n`);
