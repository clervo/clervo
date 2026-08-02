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
const multimodalEvidenceHash = 'sha256:8bd5db628199e7d62fa207f27fddce050e24b8c1687ae5fcd572f5f8e6a98daf';
const embeddingEvidenceHash = 'sha256:d0e4963d40f077929e93a2f1401a80d11994976ccfb238627714305e969e2b18';
const checkedAt = '2026-08-02T02:54:31.000Z';
const expiresAt = '2026-08-09T02:54:31.000Z';

const specs = [
  { routeId: 'ai.route.gemini_3_5_flash_lite', qualificationId: 'aiqual_01K0VERTEXGEMINI35LITE1', exactModelId: 'gemini-3.5-flash-lite', productId: 'ai.chat', capabilities: ['text_input', 'text_output', 'structured_output', 'reasoning'], latencyMsP95: 852.01, maximumSupplierCostAtomic: '1000000', evidenceHash: multimodalEvidenceHash },
  { routeId: 'ai.route.gemini_3_6_flash', qualificationId: 'aiqual_01K0VERTEXGEMINI36FLASH1', exactModelId: 'gemini-3.6-flash', productId: 'ai.chat', capabilities: ['text_input', 'text_output', 'structured_output', 'reasoning'], latencyMsP95: 2265.68, maximumSupplierCostAtomic: '1000000', evidenceHash: multimodalEvidenceHash },
  { routeId: 'ai.route.gemini_3_5_flash', qualificationId: 'aiqual_01K0VERTEXGEMINI35FLASH1', exactModelId: 'gemini-3.5-flash', productId: 'ai.chat', capabilities: ['text_input', 'text_output', 'structured_output', 'reasoning'], latencyMsP95: 3151.89, maximumSupplierCostAtomic: '1000000', evidenceHash: multimodalEvidenceHash },
  { routeId: 'ai.route.gemini_3_1_flash_lite_image', qualificationId: 'aiqual_01K0VERTEXGEMINI31LIMAGE', exactModelId: 'gemini-3.1-flash-lite-image', productId: 'ai.image', capabilities: ['text_input', 'image_output'], latencyMsP95: 2751.83, maximumSupplierCostAtomic: '200000', evidenceHash: multimodalEvidenceHash },
  { routeId: 'ai.route.gemini_3_1_flash_image', qualificationId: 'aiqual_01K0VERTEXGEMINI31IMAGE1', exactModelId: 'gemini-3.1-flash-image', productId: 'ai.image', capabilities: ['text_input', 'image_output'], latencyMsP95: 9245.2, maximumSupplierCostAtomic: '400000', evidenceHash: multimodalEvidenceHash },
  { routeId: 'ai.route.gemini_3_pro_image', qualificationId: 'aiqual_01K0VERTEXGEMINI3PROIMAGE', exactModelId: 'gemini-3-pro-image', productId: 'ai.image', capabilities: ['text_input', 'image_output'], latencyMsP95: 17615.65, maximumSupplierCostAtomic: '800000', evidenceHash: multimodalEvidenceHash },
  { routeId: 'ai.route.gemini_embedding_001', qualificationId: 'aiqual_01K0VERTEXGEMINIEMBED01', exactModelId: 'gemini-embedding-001', productId: 'ai.embed', capabilities: ['text_input', 'embedding_output'], latencyMsP95: 1089.9, maximumSupplierCostAtomic: '100000', evidenceHash: embeddingEvidenceHash, checkedAt: '2026-08-02T03:18:00.000Z', expiresAt: '2026-08-09T03:18:00.000Z' },
];

function checks(spec) {
  const codes = {
    authentication: 'credential_accepted',
    exact_identity: 'exact_identity_observed',
    input_dependence: 'input_dependence_observed',
    output_shape: spec.productId === 'ai.image' ? 'bounded_image_valid' : spec.productId === 'ai.embed' ? 'bounded_embedding_valid' : 'bounded_text_valid',
    usage_reporting: 'usage_reported',
    latency: 'latency_within_ceiling',
    failure_handling: 'invalid_model_failed_safely',
    cost_ceiling: 'cost_within_ceiling',
    terms: 'resale_terms_confirmed',
    structured_output: 'structured_output_valid',
  };
  return [...aiQualificationCheckNames, ...(spec.capabilities.includes('structured_output') ? ['structured_output'] : [])].map((name) => ({ name, status: 'passed', code: codes[name], evidenceHash: spec.evidenceHash }));
}

const definitions = specs.map((spec) => {
  const qualification = createAiRouteQualification({
    qualificationId: spec.qualificationId,
    routeId: spec.routeId,
    providerId: 'provider.google_vertex',
    supplyFamilyId: 'supply.google_vertex',
    exactModelId: spec.exactModelId,
    productIds: [spec.productId],
    checkedAt: spec.checkedAt ?? checkedAt,
    expiresAt: spec.expiresAt ?? expiresAt,
    termsStatus: 'restricted',
    resaleAllowed: true,
    checks: checks(spec),
    observed: { modelIdentity: spec.exactModelId, latencyMsP95: spec.latencyMsP95, maximumSupplierCost: { asset: 'USD', amountAtomic: spec.maximumSupplierCostAtomic, decimals: 6 } },
  }, spec.capabilities);
  return { routeId: spec.routeId, providerId: 'provider.google_vertex', supplyFamilyId: 'supply.google_vertex', exactModelId: spec.exactModelId, productIds: [spec.productId], capabilities: spec.capabilities, requiredSecretNames: [], quickAiPremium: false, qualification };
});

const retained = catalog.routes.filter(({ supplyFamilyId }) => supplyFamilyId !== 'supply.google_vertex');
const merged = createAiModelCatalog({ catalogId: 'aicat_01K0CLERVOMULTIMODAL01', evaluatedAt: '2026-08-02T03:19:00.000Z', routes: [...retained, ...definitions] });
process.stdout.write(`${JSON.stringify(merged, null, 2)}\n`);
