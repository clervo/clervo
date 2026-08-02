export interface SandboxImageRecord {
  imageId: string;
  digest: string;
  lifecycle: 'qualified' | 'blocked';
  signatureVerified: boolean;
  provenanceVerified: boolean;
  vulnerabilityScan: 'passed' | 'failed';
  malwareScan: 'passed' | 'failed';
  sbomSha256: string;
}

export interface SandboxImagePolicy { allows(digest: string): boolean }

export class SandboxImageRegistry implements SandboxImagePolicy {
  private readonly allowed = new Set<string>();

  constructor(records: readonly Readonly<SandboxImageRecord>[]) {
    const ids = new Set<string>(); const digests = new Set<string>();
    for (const record of records) {
      if (!/^sandbox\.[a-z0-9][a-z0-9._-]{2,63}$/u.test(record.imageId) || !/^sha256:[a-f0-9]{64}$/u.test(record.digest) || !/^sha256:[a-f0-9]{64}$/u.test(record.sbomSha256) || ids.has(record.imageId) || digests.has(record.digest)) throw new TypeError('sandbox_image_record_invalid');
      ids.add(record.imageId); digests.add(record.digest);
      if (record.lifecycle === 'qualified' && record.signatureVerified && record.provenanceVerified && record.vulnerabilityScan === 'passed' && record.malwareScan === 'passed') this.allowed.add(record.digest);
    }
  }

  allows(digest: string): boolean { return this.allowed.has(digest); }
}

export const denyAllSandboxImages: SandboxImagePolicy = Object.freeze({ allows: () => false });
