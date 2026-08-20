export const SCHEMA_VISIBILITY_POLICY_VERSION = '2026-08-01.1' as const;

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
