import type { PredictionMarketStatus, VenueMarketSnapshot, VenueOutcomeSnapshot } from '../../../services/prediction/src/normalization.js';

export interface PredictionHttpResponse {
  status: number;
  contentType: string;
  body: Uint8Array;
}

export interface PredictionHttpTransport {
  request(input: Readonly<{ url: string; signal: AbortSignal; maximumResponseBytes: number }>): Promise<Readonly<PredictionHttpResponse>>;
}

export interface PredictionSourceConfig {
  sourceId: 'polymarket_gamma' | 'kalshi_market_data';
  origin: string;
  allowedPathPrefix: string;
  maximumResponseBytes: number;
  timeoutMs: number;
  staleAfterMs: number;
}

export function createBoundedPredictionHttpTransport(fetcher: typeof globalThis.fetch = globalThis.fetch): PredictionHttpTransport {
  return Object.freeze({
    async request(input: Parameters<PredictionHttpTransport['request']>[0]): Promise<Readonly<PredictionHttpResponse>> {
      const response = await fetcher(input.url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: input.signal,
      });
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^(?:0|[1-9][0-9]{0,15})$/u.test(declared) || Number(declared) > input.maximumResponseBytes)) throw new Error('prediction_response_too_large');
      if (response.body === null) throw new Error('prediction_response_empty');
      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = response.body.getReader();
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          total += next.value.byteLength;
          if (total > input.maximumResponseBytes) {
            await reader.cancel();
            throw new Error('prediction_response_too_large');
          }
          chunks.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
      const body = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return Object.freeze({ status: response.status, contentType: response.headers.get('content-type') ?? '', body });
    },
  });
}

function object(value: unknown, failure = 'prediction_source_response_invalid'): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(failure);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, maximum = 50_000): string {
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) throw new Error('prediction_source_response_invalid');
  return value.trim();
}

function optionalString(value: unknown, maximum = 50_000): string | null {
  return value === null || value === undefined || value === '' ? null : requiredString(value, maximum);
}

function isoTimestamp(value: unknown, required = true): string | null {
  if (!required && (value === null || value === undefined || value === '')) return null;
  const text = requiredString(value, 64);
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) throw new Error('prediction_source_response_invalid');
  return new Date(parsed).toISOString();
}

function publicUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('prediction_source_endpoint_invalid');
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hash !== ''
    || /^(?:localhost|127(?:\.|$)|10(?:\.|$)|169\.254(?:\.|$)|192\.168(?:\.|$)|172\.(?:1[6-9]|2[0-9]|3[01])(?:\.|$)|0\.0\.0\.0$|\[?::1\]?$)/u.test(url.hostname)) throw new Error('prediction_source_endpoint_invalid');
  return url.href;
}

function sourceConfig(input: Readonly<PredictionSourceConfig>): Readonly<PredictionSourceConfig> {
  const origin = new URL(publicUrl(input.origin));
  if (origin.pathname !== '/' || origin.search !== '') throw new TypeError('prediction_source_config_invalid');
  if (!/^\/[A-Za-z0-9/_-]{1,200}$/u.test(input.allowedPathPrefix)
    || !Number.isSafeInteger(input.maximumResponseBytes) || input.maximumResponseBytes < 1_024 || input.maximumResponseBytes > 10_485_760
    || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 100 || input.timeoutMs > 30_000
    || !Number.isSafeInteger(input.staleAfterMs) || input.staleAfterMs < 1_000 || input.staleAfterMs > 86_400_000) throw new TypeError('prediction_source_config_invalid');
  return Object.freeze({ ...input, origin: origin.origin });
}

function boundedEndpoint(config: Readonly<PredictionSourceConfig>, path: string, query: Readonly<Record<string, string>>): string {
  if (!(path === config.allowedPathPrefix || path.startsWith(`${config.allowedPathPrefix}/`)) || path.includes('..') || !/^\/[A-Za-z0-9/_.:-]{1,500}$/u.test(path)) throw new Error('prediction_source_endpoint_invalid');
  const url = new URL(path, config.origin);
  if (url.origin !== config.origin) throw new Error('prediction_source_endpoint_invalid');
  for (const [name, value] of Object.entries(query)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/u.test(name) || value.length > 512 || /[\u0000-\u001F\u007F]/u.test(value)) throw new TypeError('prediction_source_query_invalid');
    url.searchParams.set(name, value);
  }
  return url.href;
}

function decimalMicrousd(value: unknown, maximum: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  let decimal: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) throw new Error('prediction_source_response_invalid');
    decimal = value.toFixed(6);
  } else if (typeof value === 'string') {
    decimal = value;
  } else {
    throw new Error('prediction_source_response_invalid');
  }
  if (!/^(?:0|[1-9][0-9]{0,12})(?:\.[0-9]{1,6})?$/u.test(decimal)) throw new Error('prediction_source_response_invalid');
  const [whole, fraction = ''] = decimal.split('.');
  const result = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'));
  if (!Number.isSafeInteger(result) || result > maximum) throw new Error('prediction_source_response_invalid');
  return result;
}

function probabilityText(microusd: number): string {
  const whole = Math.floor(microusd / 1_000_000);
  const fraction = String(microusd % 1_000_000).padStart(6, '0').replace(/0+$/u, '');
  return fraction.length === 0 ? String(whole) : `${whole}.${fraction}`;
}

function jsonStringArray(value: unknown): readonly string[] {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('prediction_source_response_invalid');
    }
  }
  if (!Array.isArray(parsed) || parsed.length < 2 || parsed.length > 100 || parsed.some((item) => typeof item !== 'string')) throw new Error('prediction_source_response_invalid');
  return parsed.map((item) => requiredString(item, 200));
}

function polymarketStatus(value: Record<string, unknown>): PredictionMarketStatus {
  if (value.archived === true || value.closed === true && value.active === false) return 'closed';
  if (value.closed === true) return 'closed';
  if (value.active === true) return 'open';
  throw new Error('prediction_source_response_invalid');
}

function polymarketResolution(value: Record<string, unknown>, outcomes: readonly VenueOutcomeSnapshot[]): Readonly<{ status: PredictionMarketStatus; resolvedAt: string | null; resolvedOutcomeId: string | null }> {
  const resolutionStatus = optionalString(value.umaResolutionStatus, 100)?.toLowerCase();
  if (!['resolved', 'settled'].includes(resolutionStatus ?? '')) return Object.freeze({ status: polymarketStatus(value), resolvedAt: null, resolvedOutcomeId: null });
  const winnerIndex = outcomes.findIndex(({ price }) => price === '1');
  if (winnerIndex < 0 || outcomes.some(({ price }, index) => index !== winnerIndex && price !== '0')) throw new Error('prediction_source_response_invalid');
  return Object.freeze({ status: 'resolved', resolvedAt: isoTimestamp(value.closedTime), resolvedOutcomeId: outcomes[winnerIndex]!.venueOutcomeId });
}

export function parsePolymarketGammaMarket(raw: unknown, context: Readonly<{ sourceUrl: string; observedAt: string; staleAfterMs: number }>): Readonly<VenueMarketSnapshot> {
  const value = object(raw);
  const sourceUrl = publicUrl(context.sourceUrl);
  const labels = jsonStringArray(value.outcomes);
  const prices = jsonStringArray(value.outcomePrices);
  if (labels.length !== prices.length) throw new Error('prediction_source_response_invalid');
  const outcomes = Object.freeze(labels.map((label, index) => Object.freeze({
    venueOutcomeId: String(index),
    label,
    price: probabilityText(decimalMicrousd(prices[index], 1_000_000)!),
  })));
  const resolution = polymarketResolution(value, outcomes);
  const id = requiredString(value.id, 160);
  const event = Array.isArray(value.events) && value.events.length > 0 ? object(value.events[0]) : null;
  const slug = optionalString(event?.slug, 300) ?? requiredString(value.slug, 300);
  const resolutionSource = optionalString(value.resolutionSource, 2_048) ?? optionalString(event?.resolutionSource, 2_048);
  let resolutionSourceUrl = sourceUrl;
  if (resolutionSource !== null) {
    try {
      resolutionSourceUrl = publicUrl(resolutionSource);
    } catch {
      // Gamma often publishes the resolution authority as text rather than a URL.
      // The exact API resource remains the source link and the text is retained in rules.
    }
  }
  const description = requiredString(value.description, 20_000);
  const resolutionRules = resolutionSource !== null && resolutionSourceUrl === sourceUrl ? `${description} Resolution source: ${resolutionSource}` : description;
  return Object.freeze({
    venueId: 'polymarket',
    venueMarketId: id,
    question: requiredString(value.question, 500),
    description,
    category: optionalString(value.category, 100) ?? 'Uncategorized',
    status: resolution.status,
    openedAt: isoTimestamp(value.startDate, false),
    closesAt: isoTimestamp(value.endDate)!,
    resolvedAt: resolution.resolvedAt,
    resolvedOutcomeId: resolution.resolvedOutcomeId,
    resolutionRules,
    resolutionSourceUrl,
    marketUrl: publicUrl(`https://polymarket.com/event/${encodeURIComponent(slug)}`),
    outcomes,
    liquidityMicrousd: decimalMicrousd(value.liquidityNum, Number.MAX_SAFE_INTEGER),
    volumeMicrousd: decimalMicrousd(value.volumeNum, Number.MAX_SAFE_INTEGER),
    feeBps: decimalMicrousd(value.fee, 1_000_000) === null ? null : Math.round(decimalMicrousd(value.fee, 1_000_000)! / 100),
    observedAt: isoTimestamp(context.observedAt)!,
    staleAfterMs: context.staleAfterMs,
  });
}

function kalshiPrice(value: Record<string, unknown>): number | null {
  const bid = decimalMicrousd(value.yes_bid_dollars, 1_000_000);
  const ask = decimalMicrousd(value.yes_ask_dollars, 1_000_000);
  if (bid !== null && ask !== null) {
    if (bid > ask) throw new Error('prediction_source_response_invalid');
    return Math.round((bid + ask) / 2);
  }
  return decimalMicrousd(value.last_price_dollars, 1_000_000);
}

function kalshiState(value: Record<string, unknown>): Readonly<{ status: PredictionMarketStatus; resolvedAt: string | null; resolvedOutcomeId: string | null }> {
  const status = requiredString(value.status, 50).toLowerCase();
  if (['open', 'active'].includes(status)) return Object.freeze({ status: 'open', resolvedAt: null, resolvedOutcomeId: null });
  if (['cancelled', 'canceled'].includes(status)) return Object.freeze({ status: 'cancelled', resolvedAt: null, resolvedOutcomeId: null });
  if (['settled', 'resolved', 'finalized'].includes(status)) {
    const result = requiredString(value.result, 10).toLowerCase();
    if (!['yes', 'no'].includes(result)) throw new Error('prediction_source_response_invalid');
    return Object.freeze({ status: 'resolved', resolvedAt: isoTimestamp(value.settlement_ts), resolvedOutcomeId: result });
  }
  if (['closed', 'inactive'].includes(status)) return Object.freeze({ status: 'closed', resolvedAt: null, resolvedOutcomeId: null });
  throw new Error('prediction_source_response_invalid');
}

export function parseKalshiMarket(raw: unknown, context: Readonly<{ sourceUrl: string; observedAt: string; staleAfterMs: number }>): Readonly<VenueMarketSnapshot> {
  const value = object(raw);
  const id = requiredString(value.ticker, 160);
  const sourceUrl = publicUrl(context.sourceUrl);
  const yes = kalshiPrice(value);
  const state = kalshiState(value);
  const rules = [optionalString(value.rules_primary, 50_000), optionalString(value.rules_secondary, 50_000)].filter((item): item is string => item !== null);
  if (rules.length === 0) throw new Error('prediction_source_response_invalid');
  return Object.freeze({
    venueId: 'kalshi',
    venueMarketId: id,
    question: requiredString(value.title, 500),
    description: optionalString(value.subtitle, 20_000) ?? optionalString(value.rules_primary, 20_000) ?? requiredString(value.rules_secondary, 20_000),
    category: optionalString(value.category, 100) ?? 'Uncategorized',
    status: state.status,
    openedAt: isoTimestamp(value.open_time, false),
    closesAt: isoTimestamp(value.close_time)!,
    resolvedAt: state.resolvedAt,
    resolvedOutcomeId: state.resolvedOutcomeId,
    resolutionRules: rules.join(' '),
    resolutionSourceUrl: sourceUrl,
    marketUrl: sourceUrl,
    outcomes: Object.freeze([
      Object.freeze({ venueOutcomeId: 'yes', label: 'Yes', price: yes === null ? null : probabilityText(yes) }),
      Object.freeze({ venueOutcomeId: 'no', label: 'No', price: yes === null ? null : probabilityText(1_000_000 - yes) }),
    ]),
    // Current Kalshi liquidity_dollars is deprecated and volume_fp is a contract
    // count. Neither is represented as USD liquidity or volume.
    liquidityMicrousd: null,
    volumeMicrousd: null,
    feeBps: null,
    observedAt: isoTimestamp(context.observedAt)!,
    staleAfterMs: context.staleAfterMs,
  });
}

export class PredictionPublicMarketClient {
  readonly #config: Readonly<PredictionSourceConfig>;
  readonly #transport: PredictionHttpTransport;

  constructor(input: Readonly<{ config: PredictionSourceConfig; transport: PredictionHttpTransport }>) {
    this.#config = sourceConfig(input.config);
    this.#transport = input.transport;
  }

  async get(path: string, query: Readonly<Record<string, string>> = {}, signal?: AbortSignal): Promise<unknown> {
    const url = boundedEndpoint(this.#config, path, query);
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), this.#config.timeoutMs);
    let response: Readonly<PredictionHttpResponse>;
    try {
      response = await this.#transport.request({ url, signal: controller.signal, maximumResponseBytes: this.#config.maximumResponseBytes });
    } catch {
      throw new Error('prediction_source_transport_failed');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
    if (response.status !== 200 || response.body.byteLength < 1 || response.body.byteLength > this.#config.maximumResponseBytes
      || response.contentType.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new Error('prediction_source_http_failed');
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.body));
    } catch {
      throw new Error('prediction_source_response_invalid');
    }
  }
}
