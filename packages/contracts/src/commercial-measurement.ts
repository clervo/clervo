import type { JsonValue } from './types.js';

export const COMMERCIAL_EVENT_NAMES = Object.freeze([
  'site_visit',
  'activation_surface',
  'setup_start',
  'catalog_view',
  'free_result',
  'payment_failure',
] as const);

export type CommercialEventName = typeof COMMERCIAL_EVENT_NAMES[number];
export type CommercialTrafficClass = 'external' | 'internal' | 'unknown';

const prohibitedKeys = /(?:prompt|payload|response|body|secret|private[_-]?key|authorization|credential|payment[_-]?signature|cookie)/iu;

export interface CommercialEventInput {
  eventId: string;
  eventName: CommercialEventName;
  occurredAt: string;
  visitorRef?: string;
  source?: string;
  channel?: string;
  referrerHost?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  operationId?: string;
  productId?: string;
  modelId?: string;
  outcome?: string;
  trafficClass?: CommercialTrafficClass;
  metadata?: JsonValue;
}

function bounded(value: unknown, maximum: number, code: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) throw new TypeError(code);
  return value;
}

function assertMetadata(value: JsonValue | undefined): void {
  if (value === undefined) return;
  const encoded = JSON.stringify(value);
  if (encoded.length > 2_048 || prohibitedKeys.test(encoded)) throw new TypeError('commercial_event_metadata_prohibited');
}

export function assertCommercialEvent(input: CommercialEventInput): Readonly<CommercialEventInput> {
  if (!/^evt_[a-f0-9]{32}$/u.test(input.eventId)) throw new TypeError('commercial_event_id_invalid');
  if (!COMMERCIAL_EVENT_NAMES.includes(input.eventName)) throw new TypeError('commercial_event_name_invalid');
  if (!Number.isFinite(Date.parse(input.occurredAt))) throw new TypeError('commercial_event_time_invalid');
  const checked = {
    eventId: input.eventId,
    eventName: input.eventName,
    occurredAt: new Date(input.occurredAt).toISOString(),
    ...(bounded(input.visitorRef, 128, 'commercial_event_visitor_invalid') ? { visitorRef: bounded(input.visitorRef, 128, 'commercial_event_visitor_invalid') } : {}),
    ...(bounded(input.source, 64, 'commercial_event_source_invalid') ? { source: bounded(input.source, 64, 'commercial_event_source_invalid') } : {}),
    ...(bounded(input.channel, 64, 'commercial_event_channel_invalid') ? { channel: bounded(input.channel, 64, 'commercial_event_channel_invalid') } : {}),
    ...(bounded(input.referrerHost, 255, 'commercial_event_referrer_invalid') ? { referrerHost: bounded(input.referrerHost, 255, 'commercial_event_referrer_invalid') } : {}),
    ...(bounded(input.utmSource, 128, 'commercial_event_utm_source_invalid') ? { utmSource: bounded(input.utmSource, 128, 'commercial_event_utm_source_invalid') } : {}),
    ...(bounded(input.utmMedium, 128, 'commercial_event_utm_medium_invalid') ? { utmMedium: bounded(input.utmMedium, 128, 'commercial_event_utm_medium_invalid') } : {}),
    ...(bounded(input.utmCampaign, 128, 'commercial_event_utm_campaign_invalid') ? { utmCampaign: bounded(input.utmCampaign, 128, 'commercial_event_utm_campaign_invalid') } : {}),
    ...(bounded(input.operationId, 128, 'commercial_event_operation_invalid') ? { operationId: bounded(input.operationId, 128, 'commercial_event_operation_invalid') } : {}),
    ...(bounded(input.productId, 128, 'commercial_event_product_invalid') ? { productId: bounded(input.productId, 128, 'commercial_event_product_invalid') } : {}),
    ...(bounded(input.modelId, 128, 'commercial_event_model_invalid') ? { modelId: bounded(input.modelId, 128, 'commercial_event_model_invalid') } : {}),
    ...(bounded(input.outcome, 64, 'commercial_event_outcome_invalid') ? { outcome: bounded(input.outcome, 64, 'commercial_event_outcome_invalid') } : {}),
    ...(input.trafficClass === undefined ? {} : { trafficClass: input.trafficClass }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  } as CommercialEventInput;
  if (checked.trafficClass !== undefined && !['external', 'internal', 'unknown'].includes(checked.trafficClass)) throw new TypeError('commercial_event_traffic_class_invalid');
  assertMetadata(checked.metadata);
  return Object.freeze(checked);
}

export interface CommercialAccountingEntry {
  occurredAt: string;
  operationId: string;
  customerRef?: string;
  trafficClass?: CommercialTrafficClass;
  customerChargeAtomic: string;
  supplierCostAtomic: string;
}

export function calculateCommercialEconomics(entries: readonly CommercialAccountingEntry[]) {
  let revenue = 0n;
  let supplierCost = 0n;
  const byCustomer = new Map<string, CommercialAccountingEntry[]>();
  for (const entry of entries) {
    if (entry.trafficClass === 'internal') continue;
    if (!/^(0|[1-9][0-9]*)$/u.test(entry.customerChargeAtomic) || !/^(0|[1-9][0-9]*)$/u.test(entry.supplierCostAtomic)) throw new TypeError('commercial_money_invalid');
    revenue += BigInt(entry.customerChargeAtomic);
    supplierCost += BigInt(entry.supplierCostAtomic);
    if (entry.customerRef !== undefined) byCustomer.set(entry.customerRef, [...(byCustomer.get(entry.customerRef) ?? []), entry]);
  }
  const repeatCustomers = [...byCustomer.values()].filter((operations) => operations.length > 1).length;
  return Object.freeze({
    revenueAtomic: revenue.toString(),
    supplierCostAtomic: supplierCost.toString(),
    contributionAtomic: (revenue - supplierCost).toString(),
    paidOperationCount: entries.filter((entry) => entry.trafficClass !== 'internal').length,
    payingCustomerCount: byCustomer.size,
    repeatCustomerCount: repeatCustomers,
  });
}

export function classifyPaidUse(timestamps: readonly string[], now = new Date().toISOString()) {
  const sorted = timestamps.map((value) => Date.parse(value)).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return Object.freeze({ firstPaidAt: null, secondPaidAt: null, repeat: false, retained7d: false, retained30d: false, timeToPaymentSeconds: null, timeToSecondSeconds: null });
  const first = sorted[0]!;
  const second = sorted[1];
  const evaluated = Date.parse(now);
  return Object.freeze({
    firstPaidAt: new Date(first).toISOString(),
    secondPaidAt: second === undefined ? null : new Date(second).toISOString(),
    repeat: second !== undefined,
    retained7d: sorted.some((value) => value >= first + 7 * 86_400_000 && value <= evaluated),
    retained30d: sorted.some((value) => value >= first + 30 * 86_400_000 && value <= evaluated),
    timeToPaymentSeconds: null,
    timeToSecondSeconds: second === undefined ? null : Math.round((second - first) / 1_000),
  });
}
