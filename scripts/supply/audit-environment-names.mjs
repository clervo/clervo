#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePaths = process.argv.slice(2);
if (sourcePaths.length === 0 || sourcePaths.some((value) => value.length === 0)) throw new TypeError('supply_audit_source_path_required');
const inventory = JSON.parse(await readFile(path.join(root, 'packages/catalog/external-supply-inventory.v1.json'), 'utf8'));
const sources = await Promise.all(sourcePaths.map((value) => readFile(value, 'utf8')));
const names = sources.flatMap((source) => source.split(/\r?\n/u).map((line) => /^([A-Z][A-Z0-9_]*)=/u.exec(line)?.[1]).filter(Boolean)).sort();
if (new Set(names).size !== names.length) throw new TypeError('supply_audit_duplicate_name');

const mappings = [
  [/^CLERVO_AI_/u, 'supply.clervo_ai_gateway'],
  [/^R2_/u, 'supply.cloudflare_r2'],
  [/^GITHUB_MODELS_/u, 'supply.github_models'],
  [/^(?:GH_TOKENS|GH_TOKEN_[0-9]+|GITHUB_APP_ID|GITHUB_INSTALLATION_ID)$/u, 'supply.github_source'],
  [/^GITLAB_/u, 'supply.gitlab_source'],
  [/^(?:AI_GATEWAY_|AI_KEY_|AI_MODEL_|DOG_PACK_|ENSEMBLE_|MIN_CONFIDENCE_|MAX_CONCURRENT_DOGS$|REQUESTS_PER_SECOND$|REQUEST_DELAY_MS$)/u, 'supply.hcnsec_gateway'],
  [/^CEREBRAS_/u, 'supply.cerebras'],
  [/^CLOUDFLARE_/u, 'supply.cloudflare_workers_ai'],
  [/^COHERE_/u, 'supply.cohere'],
  [/^DEEPGRAM_/u, 'supply.deepgram'],
  [/^GCP_/u, 'supply.google_vertex'],
  [/^GEMINI_/u, 'supply.google_gemini'],
  [/^GROQ_/u, 'supply.groq'],
  [/^MISTRAL_/u, 'supply.mistral'],
  [/^NVIDIA_/u, 'supply.nvidia'],
  [/^OPENROUTER_/u, 'supply.openrouter'],
  [/^SAMBANOVA_/u, 'supply.sambanova'],
  [/^SERPER_/u, 'supply.serper'],
  [/^SILICONFLOW_/u, 'supply.siliconflow'],
  [/^ZAI_/u, 'supply.zai'],
  [/^(?:HELIUS_|SOLANA_RPC)/u, 'supply.helius_rpc'],
  [/^DRPC_/u, 'supply.drpc'],
  [/^RPC_/u, 'supply.public_rpc_mesh'],
  [/^ZERION_/u, 'supply.zerion'],
  [/^(?:CDP_|X402_)/u, 'supply.cdp_x402'],
  [/^DEVTO_/u, 'supply.devto'],
  [/^HASHNODE_/u, 'supply.hashnode'],
  [/^TELEGRAM_/u, 'supply.telegram'],
  [/^(?:WORKOS_API_KEY|WORKOS_CLIENT_ID|WORKOS_REDIRECT_URI)$/u, 'supply.workos'],
  [/^QUICKAI_/u, 'supply.quickai'],
  [/^ROUTER_/u, 'supply.tongkhokr'],
];
const localPattern = /^(?:AUTO_VERIFY$|CLERVO_|DASH_|DASHBOARD_URL$|GUARDIAN_SECRET$|WORKOS_COOKIE_PASSWORD$)/u;
const services = new Map([...inventory.services, ...inventory.retiredServices].map((service) => [service.serviceId, service]));

function mappingFor(name) {
  for (const [pattern, serviceId] of mappings) if (pattern.test(name)) return serviceId;
  return null;
}

function kind(name) {
  if (/(?:KEY|TOKEN|TOKENS|SECRET|PASSWORD|PASS)(?:_|$)/u.test(name)) return 'credential';
  if (/(?:URL|ENDPOINT|RPC|HOST|ORIGIN)(?:_|$)/u.test(name)) return 'endpoint';
  return 'configuration';
}

const rows = names.map((environmentName) => {
  const serviceId = mappingFor(environmentName);
  if (serviceId !== null) {
    const service = services.get(serviceId);
    if (service === undefined) throw new TypeError(`supply_audit_service_missing:${serviceId}`);
    const retired = service.connectionStatus === 'retired';
    return {
      environmentName,
      mappingKind: kind(environmentName),
      scope: retired ? 'retired_supply' : 'active_supply',
      serviceId,
      category: service.category,
      ownerStatus: 'owner_unverified',
      permittedUse: retired ? 'prohibited_retired' : 'qualification_only_until_route_ready',
      resaleStatus: service.resaleStatus,
      quotaStatus: 'requires_reconciliation',
      expiryStatus: 'requires_reconciliation',
      costStatus: service.fundingClass,
      healthCheckStatus: service.connectionStatus,
      fallbackStatus: 'requires_selection',
      secretStoreLocation: service.credentialDeployment,
      lifecycleState: service.qualificationStatus,
    };
  }
  if (!localPattern.test(environmentName)) return { environmentName, mappingKind: kind(environmentName), scope: 'unmapped', serviceId: null, category: 'unknown', ownerStatus: 'unknown', permittedUse: 'prohibited_until_mapped', resaleStatus: 'unverified', quotaStatus: 'unknown', expiryStatus: 'unknown', costStatus: 'unknown', healthCheckStatus: 'not_observed', fallbackStatus: 'not_assessed', secretStoreLocation: 'legacy_import_read_only', lifecycleState: 'unmapped' };
  return { environmentName, mappingKind: kind(environmentName), scope: 'local_operation', serviceId: null, category: 'local_operation', ownerStatus: 'owner_controlled', permittedUse: 'internal_configuration_only', resaleStatus: 'not_applicable', quotaStatus: 'not_applicable', expiryStatus: 'not_applicable', costStatus: 'not_applicable', healthCheckStatus: 'not_applicable', fallbackStatus: 'not_applicable', secretStoreLocation: 'legacy_import_read_only', lifecycleState: 'recorded_non_supply' };
});

const counts = Object.fromEntries(['active_supply', 'retired_supply', 'local_operation', 'unmapped'].map((scope) => [scope, rows.filter((row) => row.scope === scope).length]));
const output = { schemaVersion: 'clervo.supply-environment-name-audit.v1', auditedAt: new Date().toISOString(), source: { manifestCount: sources.length, lineCount: sources.reduce((total, source) => total + source.split(/\r?\n/u).length, 0), assignmentCount: names.length, uniqueNameCount: new Set(names).size, valuesRecorded: false }, counts, rows };
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
