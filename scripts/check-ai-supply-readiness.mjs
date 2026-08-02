#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(await readFile(path.join(root, 'packages/catalog/ai-provider-candidates.v1.json'), 'utf8'));
const selected = [...catalog.targets, ...catalog.modalTargets].filter(({ selectedForQualification }) => selectedForQualification);
const configured = (name) => Object.hasOwn(process.env, name) && typeof process.env[name] === 'string' && process.env[name].length > 0;

const targets = selected.map((target) => {
  const missingConfigurationNames = target.requiredConfigurationNames.filter((name) => !configured(name));
  const missingSecretNames = target.requiredSecretNames.filter((name) => !configured(name));
  const termsReady = ['approved', 'restricted'].includes(target.termsStatus) && target.resaleAllowed;
  const ready = missingConfigurationNames.length === 0
    && missingSecretNames.length === 0
    && termsReady
    && target.qualificationStatus === 'passed';
  return {
    providerId: target.providerId,
    exactModelId: target.exactModelId,
    products: target.products,
    missingConfigurationNames,
    missingSecretNames,
    termsReady,
    liveQualificationStatus: target.qualificationStatus,
    ready,
  };
});

const qualifiedChatFamilies = new Set(selected.filter((target, index) => targets[index]?.ready && target.products.includes('ai.chat')).map(({ supplyFamilyId }) => supplyFamilyId));
const productCoverage = Object.fromEntries(['ai.chat', 'ai.embed', 'ai.image', 'ai.speech'].map((productId) => [productId, selected.some((target, index) => targets[index]?.ready && target.products.includes(productId))]));
const ready = qualifiedChatFamilies.size >= 3 && Object.values(productCoverage).every(Boolean) && catalog.quickAi.status === 'disabled';
const result = {
  stage: 6,
  status: ready ? 'passed' : 'blocked',
  qualifiedChatSupplyFamilies: qualifiedChatFamilies.size,
  requiredChatSupplyFamilies: 3,
  productCoverage,
  quickAiContained: catalog.quickAi.status === 'disabled',
  targets,
  ownerBlockers: ready ? [] : [
    'Install the listed provider configuration and credentials through the development environment or a secret manager; do not send secret values in chat or commit them.',
    'Confirm API resale/use terms for the selected routes.',
    'Explicitly approve any non-zero provider spend before live qualification calls.',
  ],
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!ready && !process.argv.includes('--report-only')) process.exitCode = 2;
