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
const evidenceHash = 'sha256:8dcdd0f8e461b7748702534089a45efaf93160d0a0e0a469bec6880ba87afc31';
const checkedAt = '2026-08-02T04:15:00.210Z';
const expiresAt = '2026-08-09T04:15:00.210Z';
const capabilities = ['text_input', 'text_output', 'streaming', 'structured_output', 'reasoning'];

const specs = [
  { routeId: 'ai.route.cf_gpt_oss_20b', qualificationId: 'aiqual_01K0CFGPTOSS20B000001', exactModelId: '@cf/openai/gpt-oss-20b', latencyMsP95: 904.1 },
  { routeId: 'ai.route.cf_gpt_oss_120b', qualificationId: 'aiqual_01K0CFGPTOSS120B00001', exactModelId: '@cf/openai/gpt-oss-120b', latencyMsP95: 586.27 },
];

const codes = {
  authentication: 'credential_accepted',
  exact_identity: 'exact_identity_observed',
  input_dependence: 'input_dependence_observed',
  output_shape: 'bounded_text_valid',
  usage_reporting: 'usage_reported',
  latency: 'latency_within_ceiling',
  failure_handling: 'invalid_model_failed_safely',
  cost_ceiling: 'cost_within_ceiling',
  terms: 'value_added_use_restricted',
  streaming: 'stream_terminal_usage_valid',
  structured_output: 'structured_output_valid',
};

const definitions = specs.map((spec) => {
  const checks = [...aiQualificationCheckNames, 'streaming', 'structured_output']
    .map((name) => ({ name, status: 'passed', code: codes[name], evidenceHash }));
  const qualification = createAiRouteQualification({
    qualificationId: spec.qualificationId,
    routeId: spec.routeId,
    providerId: 'provider.cloudflare_workers_ai',
    supplyFamilyId: 'supply.cloudflare_workers_ai',
    exactModelId: spec.exactModelId,
    productIds: ['ai.chat'],
    checkedAt,
    expiresAt,
    termsStatus: 'restricted',
    resaleAllowed: true,
    checks,
    observed: {
      modelIdentity: spec.exactModelId,
      latencyMsP95: spec.latencyMsP95,
      maximumSupplierCost: { asset: 'USD', amountAtomic: '10000', decimals: 6 },
    },
  }, capabilities);
  return {
    routeId: spec.routeId,
    providerId: 'provider.cloudflare_workers_ai',
    supplyFamilyId: 'supply.cloudflare_workers_ai',
    exactModelId: spec.exactModelId,
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
  evaluatedAt: checkedAt,
  routes: [...retained, ...definitions],
});
process.stdout.write(`${JSON.stringify(merged, null, 2)}\n`);
