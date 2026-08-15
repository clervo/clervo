import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertCommercialEvent,
  calculateCommercialEconomics,
  classifyPaidUse,
} from '../../dist/packages/contracts/src/index.js';

const hash = 'evt_0123456789abcdef0123456789abcdef';

test('commercial events accept attribution metadata but reject customer payloads', () => {
  const event = assertCommercialEvent({
    eventId: hash,
    eventName: 'site_visit',
    occurredAt: '2026-08-15T00:00:00.000Z',
    source: 'newsletter',
    channel: 'email',
    metadata: { path: '/start' },
  });
  assert.equal(event.source, 'newsletter');
  assert.throws(() => assertCommercialEvent({ ...event, eventId: hash, metadata: { prompt: 'do not retain' } }), /prohibited/u);
});

test('economics use exact atomic arithmetic and exclude tagged internal activity', () => {
  const result = calculateCommercialEconomics([
    { operationId: 'op_external_1', occurredAt: '2026-08-01T00:00:00Z', customerRef: 'sha256:1', trafficClass: 'external', customerChargeAtomic: '1001', supplierCostAtomic: '333' },
    { operationId: 'op_internal_1', occurredAt: '2026-08-01T00:00:00Z', customerRef: 'sha256:internal', trafficClass: 'internal', customerChargeAtomic: '900000000000000000000', supplierCostAtomic: '1' },
    { operationId: 'op_external_2', occurredAt: '2026-08-02T00:00:00Z', customerRef: 'sha256:1', trafficClass: 'external', customerChargeAtomic: '2', supplierCostAtomic: '1' },
  ]);
  assert.deepEqual(result, { revenueAtomic: '1003', supplierCostAtomic: '334', contributionAtomic: '669', paidOperationCount: 2, payingCustomerCount: 1, repeatCustomerCount: 1 });
});

test('first and repeat paid use exposes seven and thirty day retention without floating point', () => {
  const result = classifyPaidUse([
    '2026-08-01T00:00:00Z',
    '2026-08-02T00:00:00Z',
    '2026-08-08T00:00:00Z',
    '2026-09-01T00:00:00Z',
  ], '2026-09-02T00:00:00Z');
  assert.equal(result.repeat, true);
  assert.equal(result.retained7d, true);
  assert.equal(result.retained30d, true);
  assert.equal(result.timeToSecondSeconds, 86_400);
});

test('measurement migration protects event metadata and adds pseudonymous payer fields', async () => {
  const migration = await readFile('infra/storage/postgres/0009-commercial-measurement.sql', 'utf8');
  assert.match(migration, /clervo_commercial_events/u);
  assert.match(migration, /metadata_json.*prompt/u);
  assert.match(migration, /customer_ref/u);
  assert.match(migration, /traffic_class/u);
});
