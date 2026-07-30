import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTRACT_VERSION,
  assertCatalogActivatable,
  auditEventHash,
  catalogActivationFailures,
  createAuditEvent,
  qualificationFailures,
  sealReceipt,
  verifyAuditEvent,
  verifyReceipt,
} from '../../dist/packages/contracts/src/index.js';

const activeCatalog = {
  contractVersion: CONTRACT_VERSION,
  catalogVersion: '2026-07-29.1',
  productId: 'search.web',
  title: 'Web search',
  summary: 'Qualified search',
  status: 'active',
  identity: { kind: 'alias', name: 'clervo/search-web', substitutionPolicy: 'qualified_equivalent' },
  capabilities: ['web.search'],
  deliveryModes: ['sync'],
  inputSchema: 'https://api.clervo.dev/search/input.json',
  outputSchema: 'https://api.clervo.dev/search/output.json',
  pricing: { model: 'quoted', maximumChargeRequired: true, priceVersion: '1' },
  qualifiedAdapterIds: ['adapter_mock.search'],
  terms: { status: 'approved', reference: 'https://example.invalid/review' },
  dataPolicy: { classification: 'customer_confidential', payloadRetention: 'none', maximumRetentionSeconds: 0 },
  updatedAt: '2026-07-29T18:00:00.000Z',
};

test('active catalog entries require qualified supply, terms, and charge ceilings', () => {
  assert.deepEqual(catalogActivationFailures(activeCatalog), []);
  assert.doesNotThrow(() => assertCatalogActivatable(activeCatalog));
  const unsafe = { ...activeCatalog, qualifiedAdapterIds: [], terms: { ...activeCatalog.terms, status: 'unreviewed' }, pricing: { ...activeCatalog.pricing, maximumChargeRequired: false } };
  assert.deepEqual(catalogActivationFailures(unsafe), ['terms_not_approved', 'no_qualified_adapter', 'paid_product_requires_maximum_charge']);
  assert.throws(() => assertCatalogActivatable(unsafe), /not activatable/);
});

test('exact identities never silently substitute', () => {
  const exact = { ...activeCatalog, identity: { kind: 'exact', name: 'provider/model', substitutionPolicy: 'qualified_equivalent' } };
  assert.deepEqual(catalogActivationFailures(exact), ['exact_identity_may_not_substitute']);
});

test('qualification fails closed on blocked terms or incomplete checks', () => {
  assert.deepEqual(qualificationFailures({
    contractVersion: CONTRACT_VERSION,
    qualificationId: 'qual_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
    adapterId: 'adapter_mock.search',
    productId: 'search.web',
    status: 'passed',
    checkedAt: '2026-07-29T18:00:00.000Z',
    expiresAt: '2026-08-05T18:00:00.000Z',
    termsStatus: 'blocked',
    checks: [{ name: 'fixture_conformance', status: 'not_run' }],
    observed: {},
  }), ['terms_not_approved', 'checks_incomplete']);
});

const unsignedReceipt = {
  contractVersion: CONTRACT_VERSION,
  receiptId: 'rcpt_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  operationId: 'op_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  productId: 'search.web',
  requestHash: `sha256:${'1'.repeat(64)}`,
  quoteId: 'quote_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  quoteHash: `sha256:${'2'.repeat(64)}`,
  fundingMode: 'paid',
  customerCharge: { asset: 'USDC', amountAtomic: '1000', decimals: 6 },
  supplierCost: { asset: 'USD', amountAtomic: '500', decimals: 6 },
  settlement: { status: 'settled', referenceHash: `sha256:${'3'.repeat(64)}` },
  resultHash: `sha256:${'4'.repeat(64)}`,
  provenance: [{ adapterId: 'adapter_mock.search', qualificationId: 'qual_01JZ8Q5Y4QFD48Q24H6M5F4K9P', providerReferenceHash: `sha256:${'5'.repeat(64)}` }],
  completedAt: '2026-07-29T18:00:01.000Z',
};

test('receipt hashes are deterministic and expose revenue and supplier cost separately', () => {
  const receipt = sealReceipt(unsignedReceipt);
  assert.equal(verifyReceipt(receipt), true);
  assert.equal(receipt.customerCharge.amountAtomic, '1000');
  assert.equal(receipt.supplierCost.amountAtomic, '500');
  assert.equal(sealReceipt({ ...unsignedReceipt, provenance: [...unsignedReceipt.provenance] }).receiptHash, receipt.receiptHash);
});

test('receipt verification detects tampering', () => {
  const receipt = sealReceipt(unsignedReceipt);
  assert.equal(verifyReceipt({ ...receipt, resultHash: `sha256:${'9'.repeat(64)}` }), false);
});

const unsignedAudit = {
  contractVersion: CONTRACT_VERSION,
  eventId: 'evt_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  sequence: 1,
  occurredAt: '2026-07-29T18:00:01.000Z',
  eventType: 'adapter.execution_completed',
  outcome: 'success',
  actor: { type: 'worker', id: 'worker.local.1' },
  operationId: 'op_01JZ8Q5Y4QFD48Q24H6M5F4K9P',
  operationState: 'EXECUTED',
  facts: [{ name: 'adapter_id', value: 'adapter_mock.search' }, { name: 'duration_ms', value: 12 }],
};

test('audit events are allowlisted, hash-bound, and tamper evident', () => {
  const event = createAuditEvent(unsignedAudit);
  assert.equal(event.eventHash, auditEventHash(unsignedAudit));
  assert.equal(verifyAuditEvent(event), true);
  assert.equal(verifyAuditEvent({ ...event, outcome: 'failure' }), false);
});

test('audit construction rejects secret-bearing or arbitrary fact names', () => {
  assert.throws(() => createAuditEvent({ ...unsignedAudit, facts: [{ name: 'authorization', value: 'Bearer secret' }] }), /not allowlisted/);
  assert.throws(() => createAuditEvent({ ...unsignedAudit, facts: [{ name: 'error_code', value: 'x'.repeat(257) }] }), /too long/);
});