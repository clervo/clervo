#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAiModelCatalog } from '../../dist/packages/contracts/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-model-catalog.v1.json'), 'utf8'));
const live = JSON.parse(await readFile(path.join(root, 'docs/evidence/supply-foundation/cloudflare-expanded-chat-qualification.v1.json'), 'utf8'));
const capabilities = ['text_input', 'text_output', 'streaming', 'structured_output', 'reasoning'];
const definitions = live.qualifications.filter(({ status }) => status === 'passed').map((qualification) => {
  return {
    routeId: qualification.routeId,
    providerId: 'provider.cloudflare_workers_ai',
    supplyFamilyId: 'supply.cloudflare_workers_ai',
    exactModelId: qualification.exactModelId,
    productIds: ['ai.chat'],
    capabilities,
    requiredSecretNames: ['CLOUDFLARE_API_TOKEN'],
    quickAiPremium: false,
    qualification,
  };
});

const retained = catalog.routes.filter(({ supplyFamilyId }) => supplyFamilyId !== 'supply.cloudflare_workers_ai');
const merged = createAiModelCatalog({
  catalogId: 'aicat_01K0CLERVOFREETIER01',
  evaluatedAt: live.checkedAt,
  routes: [...retained, ...definitions],
});
process.stdout.write(`${JSON.stringify(merged, null, 2)}\n`);
