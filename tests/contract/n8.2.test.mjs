import assert from 'node:assert/strict';
import test from 'node:test';

import { JsonRpcAdapter } from '../../dist/adapters/rpc/src/json-rpc.js';

const config = { routeId: 'rpc.route.recorded_primary', chainId: 'eip155:1', allowedHosts: ['rpc.example.test'], maximumRequestBytes: 65536, maximumResponseBytes: 1048576, timeoutMs: 1000 };
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));

function adapter(handler, endpoint = 'https://rpc.example.test/v1/credential-redacted') {
  const calls = [];
  const transport = { async request(input) { calls.push(input); return handler(input); } };
  return { calls, value: new JsonRpcAdapter({ config, transport, async resolveEndpoint() { return endpoint; } }) };
}

test('JSON-RPC adapter binds ordered single and batch responses without exposing endpoint details', async () => {
  const recorded = adapter(async ({ body }) => {
    const request = JSON.parse(new TextDecoder().decode(body));
    const list = Array.isArray(request) ? request : [request];
    const response = list.map(({ id, method }) => ({ jsonrpc: '2.0', id, result: method === 'eth_chainId' ? '0x1' : '0x10' })).reverse();
    return { status: 200, contentType: 'application/json; charset=utf-8', body: encode(Array.isArray(request) ? response : response[0]) };
  });
  const single = await recorded.value.execute([{ method: 'eth_chainId', params: [] }]);
  assert.deepEqual(single, [{ id: 1, ok: true, result: '0x1' }]);
  const batch = await recorded.value.execute([{ method: 'eth_chainId', params: [] }, { method: 'eth_blockNumber', params: [] }]);
  assert.deepEqual(batch, [{ id: 1, ok: true, result: '0x1' }, { id: 2, ok: true, result: '0x10' }]);
  assert.equal(recorded.calls[0].maximumResponseBytes, config.maximumResponseBytes);
});

test('JSON-RPC adapter preserves bounded protocol errors and rejects response substitution', async () => {
  const protocolError = adapter(async () => ({ status: 200, contentType: 'application/json', body: encode({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } }) }));
  assert.deepEqual(await protocolError.value.execute([{ method: 'eth_chainId', params: [] }]), [{ id: 1, ok: false, error: { code: -32601, message: 'Method not found' } }]);
  for (const response of [
    { jsonrpc: '2.0', id: 2, result: '0x1' },
    { jsonrpc: '1.0', id: 1, result: '0x1' },
    { jsonrpc: '2.0', id: 1, result: '0x1', error: { code: -1, message: 'bad' } },
  ]) {
    const substituted = adapter(async () => ({ status: 200, contentType: 'application/json', body: encode(response) }));
    await assert.rejects(substituted.value.execute([{ method: 'eth_chainId', params: [] }]), /response_/u);
  }
  const duplicate = adapter(async () => ({ status: 200, contentType: 'application/json', body: encode([{ jsonrpc: '2.0', id: 1, result: '0x1' }, { jsonrpc: '2.0', id: 1, result: '0x2' }]) }));
  await assert.rejects(duplicate.value.execute([{ method: 'eth_chainId', params: [] }, { method: 'eth_blockNumber', params: [] }]), /response_binding/u);
});

test('JSON-RPC adapter rejects SSRF endpoints, redirects, oversized bodies, and malformed calls', async () => {
  for (const unsafe of ['http://rpc.example.test', 'https://127.0.0.1/rpc', 'https://metadata.google.internal/rpc', 'https://unlisted.example/rpc']) {
    const value = adapter(async () => { throw new Error('must not execute'); }, unsafe).value;
    await assert.rejects(value.execute([{ method: 'eth_chainId', params: [] }]), /endpoint_unavailable/u);
  }
  const redirected = adapter(async () => ({ status: 302, contentType: 'text/html', body: encode({}) }));
  await assert.rejects(redirected.value.execute([{ method: 'eth_chainId', params: [] }]), /http_failed/u);
  const oversized = adapter(async () => ({ status: 200, contentType: 'application/json', body: new Uint8Array(config.maximumResponseBytes + 1) }));
  await assert.rejects(oversized.value.execute([{ method: 'eth_chainId', params: [] }]), /http_failed/u);
  await assert.rejects(redirected.value.execute([{ method: 'personal-unlock', params: [] }]), /calls_invalid/u);
});
