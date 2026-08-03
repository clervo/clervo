import { createHash } from 'node:crypto';
import * as Sentry from '@sentry/node';

const MAXIMUM_PAYLOAD_BYTES = 262_144;

function deliveryId(payload) {
  return `monitor_${createHash('sha256').update(payload).digest('hex')}`;
}

function assertEndpoint(value, allowInsecureLoopback) {
  const endpoint = new URL(value);
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new TypeError('invalid monitoring endpoint');
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(endpoint.hostname);
  if (endpoint.protocol !== 'https:' && !(allowInsecureLoopback && loopback && endpoint.protocol === 'http:')) {
    throw new TypeError('invalid monitoring endpoint');
  }
  return endpoint;
}

export function createHttpMonitoringExporter({
  endpoint,
  authorization,
  fetchImplementation = fetch,
  timeoutMs = 5_000,
  allowInsecureLoopback = false,
} = {}) {
  if (typeof endpoint !== 'string') throw new TypeError('monitoring endpoint is required');
  const target = assertEndpoint(endpoint, allowInsecureLoopback);
  if (authorization !== undefined && (typeof authorization !== 'string' || authorization.length < 1 || authorization.length > 4_096 || /[\r\n]/u.test(authorization))) {
    throw new TypeError('invalid monitoring authorization');
  }
  if (typeof fetchImplementation !== 'function') throw new TypeError('invalid monitoring fetch implementation');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) throw new TypeError('invalid monitoring timeout');

  return Object.freeze({
    async export(snapshot) {
      const snapshotJson = JSON.stringify(snapshot);
      const id = deliveryId(snapshotJson);
      const payload = JSON.stringify({
        schemaVersion: 'clervo.monitoring-delivery.v1',
        deliveryId: id,
        snapshot,
      });
      if (Buffer.byteLength(payload) > MAXIMUM_PAYLOAD_BYTES) throw new Error('monitoring_payload_too_large');
      const response = await fetchImplementation(target, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'content-type': 'application/json',
          'user-agent': 'clervo-monitoring-exporter/1',
          'idempotency-key': id,
          ...(authorization === undefined ? {} : { authorization }),
        },
        body: payload,
      });
      if (response.status < 200 || response.status >= 300) throw new Error('monitoring_delivery_failed');
    },
  });
}

function assertSentryDsn(value) {
  const dsn = new URL(value);
  if (
    dsn.protocol !== 'https:'
    || !dsn.username
    || dsn.password
    || dsn.search
    || dsn.hash
    || !(dsn.hostname === 'sentry.io' || dsn.hostname.endsWith('.sentry.io'))
    || !/^\/\d+\/?$/u.test(dsn.pathname)
  ) throw new TypeError('invalid Sentry DSN');
  return dsn.toString();
}

export function createSentryMonitoringExporter({
  dsn,
  environment,
  release,
  sentryClient = Sentry,
  timeoutMs = 5_000,
} = {}) {
  if (typeof dsn !== 'string') throw new TypeError('Sentry DSN is required');
  const checkedDsn = assertSentryDsn(dsn);
  if (environment !== 'production') throw new TypeError('invalid Sentry environment');
  if (typeof release !== 'string' || !/^[a-f0-9]{40}$/u.test(release)) throw new TypeError('invalid Sentry release');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) throw new TypeError('invalid monitoring timeout');
  if (!sentryClient || typeof sentryClient.init !== 'function' || typeof sentryClient.captureEvent !== 'function' || typeof sentryClient.flush !== 'function') {
    throw new TypeError('invalid Sentry client');
  }
  sentryClient.init({
    dsn: checkedDsn,
    environment,
    release,
    sendDefaultPii: false,
    defaultIntegrations: false,
    tracesSampleRate: 0,
  });
  return Object.freeze({
    async export(snapshot) {
      const alertCodes = Array.isArray(snapshot?.alerts)
        ? snapshot.alerts.map(({ code }) => code).filter((code) => typeof code === 'string').sort()
        : [];
      if (alertCodes.length === 0) return;
      const monitoring = {
        generatedAt: snapshot?.generatedAt,
        service: snapshot?.service,
        summary: snapshot?.summary,
        alertCodes,
      };
      const monitoringJson = JSON.stringify(monitoring);
      if (Buffer.byteLength(monitoringJson) > MAXIMUM_PAYLOAD_BYTES) throw new Error('monitoring_payload_too_large');
      const eventId = createHash('sha256').update(monitoringJson).digest('hex').slice(0, 32);
      sentryClient.captureEvent({
        event_id: eventId,
        level: 'error',
        message: 'Clervo production monitoring alert',
        fingerprint: ['clervo-monitoring', ...alertCodes],
        tags: {
          service: snapshot?.service ?? 'unknown',
          release,
          alert_count: String(alertCodes.length),
        },
        extra: { monitoring },
      });
      if (await sentryClient.flush(timeoutMs) !== true) throw new Error('monitoring_delivery_failed');
    },
  });
}
