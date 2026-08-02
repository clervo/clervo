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
const evidenceHash = 'sha256:c38264133e60878bb4c0dc65e6a323350a1ddf0f75cf3f24e73ef64b734432d0';
const checkedAt = '2026-08-02T03:29:20.759Z';
const expiresAt = '2026-08-09T03:29:20.759Z';
const capabilities = ['text_input', 'text_output', 'streaming', 'structured_output', 'reasoning'];

const specs = [
  { routeId: 'ai.route.gpt_oss_20b', qualificationId: 'aiqual_01K0GROQGPTOSS20B0001', exactModelId: 'openai/gpt-oss-20b', latencyMsP95: 257.58 },
  { routeId: 'ai.route.gpt_oss_120b', qualificationId: 'aiqual_01K0GROQGPTOSS120B001', exactModelId: 'openai/gpt-oss-120b', latencyMsP95: 274.16 },
  { routeId: 'ai.route.qwen3_6_27b', qualificationId: 'aiqual_01K0GROQQWEN3627B0001', exactModelId: 'qwen/qwen3.6-27b', latencyMsP95: 847.17 },
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
  const checks = [...aiQualificationCheckNames, 'streaming', 'structured_output'].map((name) => ({ name, status: 'passed', code: codes[name], evidenceHash }));
  const qualification = createAiRouteQualification({
    qualificationId: spec.qualificationId,
    routeId: spec.routeId,
    providerId: 'provider.groq',
    supplyFamilyId: 'supply.groq',
    exactModelId: spec.exactModelId,
    productIds: ['ai.chat'],
    checkedAt,
    expiresAt,
    termsStatus: 'restricted',
    resaleAllowed: true,
    checks,
    observed: { modelIdentity: spec.exactModelId, latencyMsP95: spec.latencyMsP95, maximumSupplierCost: { asset: 'USD', amountAtomic: '10000', decimals: 6 } },
  }, capabilities);
  return { routeId: spec.routeId, providerId: 'provider.groq', supplyFamilyId: 'supply.groq', exactModelId: spec.exactModelId, productIds: ['ai.chat'], capabilities, requiredSecretNames: ['GROQ_API_KEY'], quickAiPremium: false, qualification };
});

const retained = catalog.routes.filter(({ supplyFamilyId }) => supplyFamilyId !== 'supply.groq');
const merged = createAiModelCatalog({ catalogId: 'aicat_01K0CLERVOFREETIER01', evaluatedAt: checkedAt, routes: [...retained, ...definitions] });
process.stdout.write(`${JSON.stringify(merged, null, 2)}\n`);
