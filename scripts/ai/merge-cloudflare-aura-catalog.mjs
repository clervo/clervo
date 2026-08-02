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
const evidence = JSON.parse(await readFile(path.join(root, 'docs/evidence/supply-foundation/cloudflare-aura-quality.v1.json'), 'utf8'));
if (evidence.summary.passed !== 5 || evidence.summary.total !== 5 || evidence.summary.qualityGrade !== 'good' || evidence.ownerCashSpentUsd !== 0) throw new TypeError('cloudflare_aura_evidence_not_qualified');

const routeId = 'ai.route.cloudflare_aura_2_en';
const capabilities = ['text_input', 'audio_output'];
const evidenceHash = 'sha256:ca16f156f22cb453400b644cd588d03f022867431c020f1b7aa725b8936701a5';
const checkedAt = evidence.evaluatedAt;
const expiresAt = new Date(Date.parse(checkedAt) + 7 * 24 * 60 * 60 * 1_000).toISOString();
const codes = {
  authentication: 'credential_accepted',
  exact_identity: 'immutable_exact_model_endpoint_response_unlabeled',
  input_dependence: 'independent_synthetic_roundtrip_passed',
  output_shape: 'bounded_mp3_valid',
  usage_reporting: 'deterministic_character_accounting',
  latency: 'latency_within_ceiling',
  failure_handling: 'adapter_fail_closed_contract_passed',
  cost_ceiling: 'free_allocation_hard_stop_and_shadow_cost_ceiling',
  terms: 'value_added_use_restricted',
};
const qualification = createAiRouteQualification({
  qualificationId: 'aiqual_01K0CFAURA2EN00000000001',
  routeId,
  providerId: 'provider.cloudflare_workers_ai',
  supplyFamilyId: 'supply.cloudflare_workers_ai',
  exactModelId: evidence.exactModelId,
  productIds: ['ai.speech'],
  checkedAt,
  expiresAt,
  termsStatus: 'restricted',
  resaleAllowed: true,
  checks: aiQualificationCheckNames.map((name) => ({ name, status: 'passed', code: codes[name], evidenceHash })),
  observed: {
    modelIdentity: evidence.exactModelId,
    latencyMsP95: evidence.summary.speechLatencyMsP95,
    maximumSupplierCost: { asset: 'USD', amountAtomic: '60000', decimals: 6 },
  },
}, capabilities);
const definition = {
  routeId,
  providerId: 'provider.cloudflare_workers_ai',
  supplyFamilyId: 'supply.cloudflare_workers_ai',
  exactModelId: evidence.exactModelId,
  productIds: ['ai.speech'],
  capabilities,
  requiredSecretNames: ['CLOUDFLARE_API_TOKEN'],
  quickAiPremium: false,
  qualification,
};
const retained = catalog.routes.filter((route) => route.routeId !== routeId);
const merged = createAiModelCatalog({
  catalogId: 'aicat_01K0CLERVOAURAFALLBACK1',
  evaluatedAt: checkedAt,
  routes: [...retained, definition],
});
process.stdout.write(`${JSON.stringify(merged, null, 2)}\n`);
