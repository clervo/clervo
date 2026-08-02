import { createHash } from 'node:crypto';

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
