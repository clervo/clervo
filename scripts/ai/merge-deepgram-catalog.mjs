#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aiQualificationCheckNames,
  createAiModelCatalog,
  createAiRouteQualification,
} from '../../dist/packages/contracts/src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-model-catalog.v1.json'), 'utf8'));
const evidenceHash = 'sha256:bb895d9521e42f9da3323388f7b98512e047c6a5378e345a84d3c92285e8ebd7';
const checkedAt = '2026-08-02T03:08:58.000Z';
const expiresAt = '2026-08-09T03:08:58.000Z';
const capabilities = ['text_input', 'audio_output'];

const specs = [
  { routeId: 'ai.route.aura_2_thalia_en', qualificationId: 'aiqual_01K0DEEPGRAMAURA2THALIA1', exactModelId: 'aura-2-thalia-en', latencyMsP95: 1684.72 },
  { routeId: 'ai.route.aura_2_arcas_en', qualificationId: 'aiqual_01K0DEEPGRAMAURA2ARCAS01', exactModelId: 'aura-2-arcas-en', latencyMsP95: 1787.38 },
];

const codes = {
  authentication: 'credential_accepted',
  exact_identity: 'exact_identity_observed',
  input_dependence: 'synthetic_roundtrip_dependence',
  output_shape: 'bounded_audio_valid',
  usage_reporting: 'character_usage_reported',
  latency: 'latency_within_ceiling',
  failure_handling: 'invalid_model_failed_safely',
  cost_ceiling: 'cost_within_ceiling',
  terms: 'value_added_use_restricted',
};

const definitions = specs.map((spec) => {
  const qualification = createAiRouteQualification({
    qualificationId: spec.qualificationId,
    routeId: spec.routeId,
    providerId: 'provider.deepgram',
    supplyFamilyId: 'supply.deepgram',
    exactModelId: spec.exactModelId,
    productIds: ['ai.speech'],
    checkedAt,
    expiresAt,
    termsStatus: 'restricted',
    resaleAllowed: true,
    checks: aiQualificationCheckNames.map((name) => ({ name, status: 'passed', code: codes[name], evidenceHash })),
    observed: { modelIdentity: spec.exactModelId, latencyMsP95: spec.latencyMsP95, maximumSupplierCost: { asset: 'USD', amountAtomic: '60000', decimals: 6 } },
  }, capabilities);
  return { routeId: spec.routeId, providerId: 'provider.deepgram', supplyFamilyId: 'supply.deepgram', exactModelId: spec.exactModelId, productIds: ['ai.speech'], capabilities, requiredSecretNames: ['DEEPGRAM_API_KEY'], quickAiPremium: false, qualification };
});

const retained = catalog.routes.filter(({ supplyFamilyId }) => supplyFamilyId !== 'supply.deepgram');
const merged = createAiModelCatalog({ catalogId: 'aicat_01K0CLERVOSPEECHCAT01', evaluatedAt: '2026-08-02T03:10:00.000Z', routes: [...retained, ...definitions] });
process.stdout.write(`${JSON.stringify(merged, null, 2)}\n`);
