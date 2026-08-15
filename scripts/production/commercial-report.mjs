#!/usr/bin/env node

import { Pool } from 'pg';
import { calculateCommercialEconomics, classifyPaidUse } from '../../dist/packages/contracts/src/index.js';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

function iso(value, fallback) {
  const parsed = value === undefined ? new Date(fallback ?? Date.now() - 30 * 86_400_000) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`invalid --${value === undefined ? 'from' : 'to'}`);
  return parsed.toISOString();
}

export async function buildCommercialReport(client, { environmentNamespace, from, to }) {
  const [operations, accounting, events] = await Promise.all([
    client.query(`SELECT operation_id, state, created_at, completed_at, customer_ref, traffic_class, quote_json, execution_json
      FROM clervo_x402_operations
      WHERE environment_namespace = $1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz`, [environmentNamespace, from, to]),
    client.query(`SELECT operation_id, occurred_at, entry_json
      FROM clervo_receiver_accounting_entries
      WHERE environment_namespace = $1 AND occurred_at >= $2::timestamptz AND occurred_at < $3::timestamptz
      ORDER BY occurred_at, entry_id`, [environmentNamespace, from, to]),
    client.query(`SELECT event_name, COALESCE(source, 'unknown') AS source, COALESCE(channel, 'unknown') AS channel, traffic_class, COUNT(*)::int AS count
      FROM clervo_commercial_events
      WHERE environment_namespace = $1 AND occurred_at >= $2::timestamptz AND occurred_at < $3::timestamptz
      GROUP BY event_name, source, channel, traffic_class ORDER BY event_name, source, channel`, [environmentNamespace, from, to]),
  ]);
  const paidEntries = accounting.rows.map((row) => {
    const postings = row.entry_json?.postings ?? [];
    const operation = operations.rows.find((candidate) => candidate.operation_id === row.operation_id);
    return {
      occurredAt: row.occurred_at,
      operationId: row.operation_id,
      customerRef: operation?.customer_ref ?? undefined,
      trafficClass: operation?.traffic_class ?? 'unknown',
      customerChargeAtomic: postings[0]?.amount?.amountAtomic ?? '0',
      supplierCostAtomic: postings[2]?.amount?.amountAtomic ?? '0',
    };
  });
  const economics = calculateCommercialEconomics(paidEntries);
  const operationCounts = {};
  for (const row of operations.rows) operationCounts[row.state] = (operationCounts[row.state] ?? 0) + 1;
  const uniqueQuotedWallets = new Set(operations.rows.map((row) => row.customer_ref).filter((value) => typeof value === 'string')).size;
  const customerOperations = new Map();
  for (const row of paidEntries) if (row.customerRef !== undefined && row.trafficClass !== 'internal') customerOperations.set(row.customerRef, [...(customerOperations.get(row.customerRef) ?? []), row.occurredAt]);
  const retention = [...customerOperations.values()].map((timestamps) => classifyPaidUse(timestamps, to));
  const modelMix = {};
  for (const row of paidEntries) {
    const operation = operations.rows.find((candidate) => candidate.operation_id === row.operationId);
    const product = operation?.quote_json?.productId ?? 'unknown';
    modelMix[product] = (modelMix[product] ?? 0) + 1;
  }
  return {
    schemaVersion: 'clervo.commercial-report.v1',
    environmentNamespace,
    window: { from, to },
    acquisition: { events: events.rows.map((row) => ({ event: row.event_name, source: row.source, channel: row.channel, trafficClass: row.traffic_class, count: Number(row.count) })) },
    activation: { siteVisits: events.rows.filter((row) => row.event_name === 'site_visit').reduce((sum, row) => sum + Number(row.count), 0), setupStarts: events.rows.filter((row) => row.event_name === 'setup_start').reduce((sum, row) => sum + Number(row.count), 0), freeResults: events.rows.filter((row) => row.event_name === 'free_result').reduce((sum, row) => sum + Number(row.count), 0), catalogViews: events.rows.filter((row) => row.event_name === 'catalog_view').reduce((sum, row) => sum + Number(row.count), 0) },
    commercialBoundary: { quotes: operations.rows.filter((row) => row.state === 'challenged' || row.quote_json !== null).length, uniqueQuotedWallets, walletIdentityAvailability: uniqueQuotedWallets === 0 ? 'not_observed' : 'pseudonymous_paid_authorizations', payments: { successful: accounting.rows.length, failures: (operationCounts.execution_unknown ?? 0) + (operationCounts.settlement_unknown ?? 0), unknownSettlement: operationCounts.settlement_unknown ?? 0 }, paidOperations: economics.paidOperationCount, operationStates: operationCounts },
    retention: { repeatPayingWallets: retention.filter((row) => row.repeat).length, sevenDayRepeat: retention.filter((row) => row.retained7d).length, thirtyDayRepeat: retention.filter((row) => row.retained30d).length, timeToPaymentSeconds: null, timeToSecondOperationSeconds: retention.filter((row) => row.timeToSecondSeconds !== null).map((row) => row.timeToSecondSeconds) },
    economics: { revenueAtomic: economics.revenueAtomic, supplierCostAtomic: economics.supplierCostAtomic, contributionAtomic: economics.contributionAtomic, facilitatorCostAtomic: null, facilitatorCostStatus: 'not_attributed', modelOrCapabilityMix: modelMix, exactArithmetic: true },
    traffic: { externalOrUnknownPaidOperations: economics.paidOperationCount, internalExcludedPaidOperations: paidEntries.filter((row) => row.trafficClass === 'internal').length, unknownTrafficPaidOperations: paidEntries.filter((row) => row.trafficClass === 'unknown').length },
  };
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: npm run commercial:report -- --from ISO --to ISO');
    return;
  }
  const connectionString = process.env.CLERVO_DATABASE_URL;
  const environmentNamespace = process.env.CLERVO_STATE_NAMESPACE;
  if (!connectionString || !environmentNamespace) throw new Error('CLERVO_DATABASE_URL and CLERVO_STATE_NAMESPACE are required');
  const from = iso(arg('from'));
  const to = iso(arg('to'), new Date().toISOString());
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000, allowExitOnIdle: true });
  try {
    console.log(JSON.stringify(await buildCommercialReport(pool, { environmentNamespace, from, to }), null, 2));
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
