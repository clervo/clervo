import { createHash } from 'node:crypto';

export interface SandboxArtifactStore {
  put(tenantId: string, bytes: Uint8Array, mimeType: string, signal?: AbortSignal): Promise<Readonly<{ artifactUri: string; sha256: string }>>;
  get(tenantId: string, digest: string, signal?: AbortSignal): Promise<Uint8Array>;
  delete(tenantId: string, digest: string, signal?: AbortSignal): Promise<void>;
}

export interface SandboxArtifactScanner {
  scan(input: Readonly<{ bytes: Uint8Array; filename: string; declaredMimeType: string; maximumExpandedBytes: number }>): Promise<Readonly<{
    verdict: 'clean' | 'detected' | 'unscannable';
    detectedMimeType: string;
    findings: readonly ('malware' | 'secret' | 'active_content' | 'archive_bomb' | 'type_mismatch')[];
    scannerVersion: string;
  }>>;
}

export interface SandboxArtifactDescriptor {
  artifactId: string;
  sessionId: string;
  executionId: string;
  filename: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  artifactUri: string;
  scan: Readonly<{ verdict: 'clean'; scannerVersion: string }>;
}

interface StoredDescriptor extends SandboxArtifactDescriptor { tenantId: string }

const safeMimeTypes = new Set(['application/json', 'application/octet-stream', 'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/csv', 'text/markdown', 'text/plain']);

function identity(value: string, prefix: 'tenant' | 'sbx' | 'exec'): void {
  if (!new RegExp(`^${prefix}_[A-Za-z0-9]{20,64}$`, 'u').test(value)) throw new TypeError('sandbox_artifact_identity_invalid');
}

function digest(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

function safeFilename(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/u.test(value) || value === '.' || value === '..' || value.endsWith('.') || value.includes('..')) throw new TypeError('sandbox_artifact_filename_invalid');
}

export class SandboxArtifactService {
  private readonly descriptors = new Map<string, Readonly<StoredDescriptor>>();

  constructor(private readonly store: SandboxArtifactStore, private readonly scanner: SandboxArtifactScanner, private readonly maximumArtifactBytes = 10_485_760, private readonly maximumExpandedBytes = 52_428_800) {
    if (!Number.isSafeInteger(maximumArtifactBytes) || maximumArtifactBytes < 1 || maximumArtifactBytes > 104_857_600 || !Number.isSafeInteger(maximumExpandedBytes) || maximumExpandedBytes < maximumArtifactBytes || maximumExpandedBytes > 524_288_000) throw new TypeError('sandbox_artifact_limits_invalid');
  }

  async publish(input: Readonly<{ tenantId: string; sessionId: string; executionId: string; filename: string; mimeType: string; bytes: Uint8Array; signal?: AbortSignal }>): Promise<Readonly<SandboxArtifactDescriptor>> {
    identity(input.tenantId, 'tenant'); identity(input.sessionId, 'sbx'); identity(input.executionId, 'exec'); safeFilename(input.filename);
    if (!safeMimeTypes.has(input.mimeType) || input.bytes.byteLength < 1 || input.bytes.byteLength > this.maximumArtifactBytes) throw new TypeError('sandbox_artifact_input_invalid');
    const immutableBytes = new Uint8Array(input.bytes); const expectedDigest = digest(immutableBytes);
    const scan = await this.scanner.scan({ bytes: immutableBytes, filename: input.filename, declaredMimeType: input.mimeType, maximumExpandedBytes: this.maximumExpandedBytes });
    if (scan.verdict !== 'clean' || scan.findings.length !== 0 || scan.detectedMimeType !== input.mimeType || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/u.test(scan.scannerVersion)) throw new Error('sandbox_artifact_quarantined');
    const stored = await this.store.put(input.tenantId, immutableBytes, input.mimeType, input.signal);
    const expectedSha256 = `sha256:${expectedDigest}`; const expectedUri = `artifact://generated/${input.tenantId}/${expectedDigest}`;
    if (stored.sha256 !== expectedSha256 || stored.artifactUri !== expectedUri) {
      try { await this.store.delete(input.tenantId, expectedDigest, input.signal); } catch { /* failed integrity cleanup remains unavailable */ }
      throw new Error('sandbox_artifact_storage_integrity_failed');
    }
    const artifactId = `art_${expectedDigest.slice(0, 32)}`;
    const descriptor = Object.freeze({ artifactId, tenantId: input.tenantId, sessionId: input.sessionId, executionId: input.executionId, filename: input.filename, mimeType: input.mimeType, bytes: immutableBytes.byteLength, sha256: expectedSha256, artifactUri: expectedUri, scan: Object.freeze({ verdict: 'clean' as const, scannerVersion: scan.scannerVersion }) });
    this.descriptors.set(`${input.tenantId}:${artifactId}`, descriptor);
    const { tenantId: _tenantId, ...publicDescriptor } = descriptor; void _tenantId;
    return Object.freeze(publicDescriptor);
  }

  async get(tenantId: string, artifactId: string, signal?: AbortSignal): Promise<Readonly<{ descriptor: SandboxArtifactDescriptor; bytes: Uint8Array }>> {
    identity(tenantId, 'tenant');
    if (!/^art_[a-f0-9]{32}$/u.test(artifactId)) throw new TypeError('sandbox_artifact_id_invalid');
    const stored = this.descriptors.get(`${tenantId}:${artifactId}`); if (!stored) throw new Error('sandbox_artifact_not_found');
    const expectedDigest = stored.sha256.slice('sha256:'.length); const bytes = await this.store.get(tenantId, expectedDigest, signal);
    if (bytes.byteLength !== stored.bytes || digest(bytes) !== expectedDigest) throw new Error('sandbox_artifact_storage_integrity_failed');
    const { tenantId: _tenantId, ...descriptor } = stored; void _tenantId;
    return Object.freeze({ descriptor: Object.freeze(descriptor), bytes: new Uint8Array(bytes) });
  }
}
