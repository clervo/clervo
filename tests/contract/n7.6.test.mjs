import assert from 'node:assert/strict';
import test from 'node:test';

import { SandboxImageRegistry } from '../../dist/services/sandbox/src/image-registry.js';

const digest = `sha256:${'a'.repeat(64)}`; const sbomSha256 = `sha256:${'b'.repeat(64)}`;
const record = { imageId: 'sandbox.nodejs-24', digest, lifecycle: 'qualified', signatureVerified: true, provenanceVerified: true, vulnerabilityScan: 'passed', malwareScan: 'passed', sbomSha256 };

test('sandbox image registry permits only uniquely identified and completely verified images', () => {
  assert.equal(new SandboxImageRegistry([record]).allows(digest), true);
  for (const unsafe of [
    { ...record, signatureVerified: false }, { ...record, provenanceVerified: false }, { ...record, vulnerabilityScan: 'failed' }, { ...record, malwareScan: 'failed' }, { ...record, lifecycle: 'blocked' },
  ]) assert.equal(new SandboxImageRegistry([unsafe]).allows(digest), false);
  assert.throws(() => new SandboxImageRegistry([record, record]), /record_invalid/u);
  assert.throws(() => new SandboxImageRegistry([{ ...record, digest: 'latest' }]), /record_invalid/u);
});
