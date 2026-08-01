import type { PillarId, ProductLifecycleState } from './product-scope.js';
import { pillarIds } from './product-scope.js';
import type { AssetAmount } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export const PLATFORM_REGISTRY_VERSION = '2026-08-01.1' as const;
export const SCHEMA_VISIBILITY_POLICY_VERSION = '2026-08-01.1' as const;

export const connectorAccessModes = [
  'open_web',
  'official_api',
  'bring_your_own_credentials',
  'user_authorized_session',
  'partner_access',
  'customer_supplied_data',
  'unsupported',
] as const;

export type ConnectorAccessMode = (typeof connectorAccessModes)[number];
export type RegistryVisibility = 'public' | 'internal' | 'hidden';
export type SchemaVisibility = 'public_wire' | 'internal_control' | 'sealed_evidence';

export interface SchemaVisibilityEntry {
  file: string;
  schemaId: string;
  visibility: SchemaVisibility;
  reason: string;
}

export interface SchemaVisibilityManifest {
  policyVersion: typeof SCHEMA_VISIBILITY_POLICY_VERSION;
  defaultVisibility: 'deny';
  schemas: readonly SchemaVisibilityEntry[];
}

export interface PlatformRegistry {
  registryVersion: typeof PLATFORM_REGISTRY_VERSION;
  contractVersion: typeof CONTRACT_VERSION;
  state: 'foundation_unfrozen';
  schemaVisibilityPolicyVersion: typeof SCHEMA_VISIBILITY_POLICY_VERSION;
  pillars: readonly {
    pillarId: PillarId;
    lifecycle: ProductLifecycleState;
    coreQualified: boolean;
  }[];
  capabilities: readonly {
    capabilityId: string;
    pillarId: PillarId;
    lifecycle: ProductLifecycleState;
    qualification: 'stage4_private' | 'unqualified';
  }[];
  operations: readonly {
    operationId: string;
    capabilityId: string;
    productId: string;
    route: { method: 'POST'; path: string } | null;
    deliveryModes: readonly ('sync' | 'async')[];
    accessModes: readonly ConnectorAccessMode[];
    inputSchema: string;
    outputSchema: string;
    lifecycle: ProductLifecycleState;
    visibility: RegistryVisibility;
  }[];
  products: readonly {
    productId: string;
    pillarId: PillarId;
    capabilityIds: readonly string[];
    lifecycle: ProductLifecycleState;
    visibility: RegistryVisibility;
  }[];
  skus: readonly {
    skuId: string;
    productId: string;
    operationId: string;
    deliveryMode: 'sync' | 'async';
    commerceMode: 'free' | 'mock_only' | 'paid';
    priceVersion: string;
    maximumCharge: AssetAmount | null;
    visibility: RegistryVisibility;
  }[];
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => seen.has(value) || !seen.add(value));
}

export function assertSchemaVisibilityManifest(
  manifest: SchemaVisibilityManifest,
  actualSchemaFiles: readonly string[],
): void {
  const failures: string[] = [];
  const files = manifest.schemas.map(({ file }) => file);
  const ids = manifest.schemas.map(({ schemaId }) => schemaId);
  if (manifest.policyVersion !== SCHEMA_VISIBILITY_POLICY_VERSION) failures.push('schema_policy_version_invalid');
  if (manifest.defaultVisibility !== 'deny') failures.push('schema_policy_must_default_deny');
  if (duplicates(files).length > 0) failures.push('schema_files_duplicate');
  if (duplicates(ids).length > 0) failures.push('schema_ids_duplicate');
  const declared = new Set(files);
  const actual = new Set(actualSchemaFiles);
  if (actualSchemaFiles.some((file) => !declared.has(file))) failures.push('schema_file_unclassified');
  if (files.some((file) => !actual.has(file))) failures.push('schema_manifest_file_missing');
  if (manifest.schemas.some(({ file, schemaId, reason }) => !file.endsWith('.schema.json') || !schemaId.startsWith('https://') || reason.length === 0)) failures.push('schema_manifest_entry_invalid');
  if (failures.length > 0) throw new TypeError(`invalid schema visibility manifest: ${failures.join(', ')}`);
}

export function publicSchemaFiles(
  manifest: SchemaVisibilityManifest,
  actualSchemaFiles: readonly string[],
): readonly string[] {
  assertSchemaVisibilityManifest(manifest, actualSchemaFiles);
  return manifest.schemas
    .filter(({ visibility }) => visibility === 'public_wire')
    .map(({ file }) => file)
    .sort();
}

export function assertPlatformRegistry(
  registry: PlatformRegistry,
  schemaManifest: SchemaVisibilityManifest,
): void {
  const failures: string[] = [];
  if (registry.registryVersion !== PLATFORM_REGISTRY_VERSION || registry.contractVersion !== CONTRACT_VERSION) failures.push('registry_version_invalid');
  if (registry.state !== 'foundation_unfrozen') failures.push('registry_must_not_claim_freeze');
  if (registry.schemaVisibilityPolicyVersion !== schemaManifest.policyVersion) failures.push('schema_policy_binding_invalid');

  const registryPillarIds = registry.pillars.map(({ pillarId }) => pillarId);
  if (registryPillarIds.length !== pillarIds.length || pillarIds.some((id) => !registryPillarIds.includes(id)) || duplicates(registryPillarIds).length > 0) failures.push('six_pillars_required_once');
  if (registry.pillars.some(({ lifecycle, coreQualified }) => !coreQualified && (lifecycle === 'available' || lifecycle === 'degraded'))) failures.push('unqualified_pillar_falsely_live');

  const capabilities = new Map(registry.capabilities.map((value) => [value.capabilityId, value]));
  const operations = new Map(registry.operations.map((value) => [value.operationId, value]));
  const products = new Map(registry.products.map((value) => [value.productId, value]));
  const skus = new Map(registry.skus.map((value) => [value.skuId, value]));
  if (capabilities.size !== registry.capabilities.length) failures.push('capability_ids_duplicate');
  if (operations.size !== registry.operations.length) failures.push('operation_ids_duplicate');
  if (products.size !== registry.products.length) failures.push('product_ids_duplicate');
  if (skus.size !== registry.skus.length) failures.push('sku_ids_duplicate');

  const schemaById = new Map(schemaManifest.schemas.map((value) => [value.schemaId, value]));
  for (const capability of registry.capabilities) {
    if (!registryPillarIds.includes(capability.pillarId)) failures.push(`capability_pillar_missing:${capability.capabilityId}`);
    if (capability.qualification === 'unqualified' && (capability.lifecycle === 'available' || capability.lifecycle === 'degraded')) failures.push(`capability_falsely_live:${capability.capabilityId}`);
  }
  for (const product of registry.products) {
    if (!registryPillarIds.includes(product.pillarId)) failures.push(`product_pillar_missing:${product.productId}`);
    if (product.capabilityIds.length === 0 || product.capabilityIds.some((id) => capabilities.get(id)?.pillarId !== product.pillarId)) failures.push(`product_capability_invalid:${product.productId}`);
    if (product.visibility === 'public' && product.lifecycle === 'unavailable') failures.push(`unavailable_product_public:${product.productId}`);
  }
  for (const operation of registry.operations) {
    const capability = capabilities.get(operation.capabilityId);
    const product = products.get(operation.productId);
    if (!capability || !product || capability.pillarId !== product.pillarId || !product.capabilityIds.includes(operation.capabilityId)) failures.push(`operation_reference_invalid:${operation.operationId}`);
    if (operation.deliveryModes.length === 0 || new Set(operation.deliveryModes).size !== operation.deliveryModes.length) failures.push(`operation_delivery_invalid:${operation.operationId}`);
    if (operation.accessModes.length === 0 || new Set(operation.accessModes).size !== operation.accessModes.length) failures.push(`operation_access_invalid:${operation.operationId}`);
    const input = schemaById.get(operation.inputSchema);
    const output = schemaById.get(operation.outputSchema);
    if (!input || !output) failures.push(`operation_schema_missing:${operation.operationId}`);
    if (operation.visibility === 'public' && (input?.visibility !== 'public_wire' || output?.visibility !== 'public_wire')) failures.push(`public_operation_schema_private:${operation.operationId}`);
    if (operation.visibility === 'public' && (operation.lifecycle === 'unavailable' || operation.route === null)) failures.push(`public_operation_unavailable:${operation.operationId}`);
    if (operation.route === null && operation.visibility === 'public') failures.push(`public_operation_route_missing:${operation.operationId}`);
  }
  for (const sku of registry.skus) {
    const product = products.get(sku.productId);
    const operation = operations.get(sku.operationId);
    if (!product || !operation || operation.productId !== product.productId) failures.push(`sku_reference_invalid:${sku.skuId}`);
    if (!operation?.deliveryModes.includes(sku.deliveryMode)) failures.push(`sku_delivery_invalid:${sku.skuId}`);
    if (sku.commerceMode === 'free' && sku.maximumCharge !== null) failures.push(`free_sku_has_charge:${sku.skuId}`);
    if (sku.commerceMode !== 'free' && sku.maximumCharge === null) failures.push(`charged_sku_missing_ceiling:${sku.skuId}`);
    if (sku.commerceMode === 'mock_only' && sku.maximumCharge?.asset !== 'mock:usdc') failures.push(`mock_sku_asset_invalid:${sku.skuId}`);
    if (sku.visibility === 'public' && sku.commerceMode === 'mock_only') failures.push(`mock_sku_public:${sku.skuId}`);
  }
  if (failures.length > 0) throw new TypeError(`invalid platform registry: ${failures.join(', ')}`);
}
