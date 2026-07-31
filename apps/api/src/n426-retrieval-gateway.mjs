#!/usr/bin/env node

import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';
import { isIP } from 'node:net';

const PORT = Number(process.env.PORT ?? '8080');
const MAXIMUM_ACTIVE = Number(process.env.CLERVO_N426_GATEWAY_MAXIMUM_ACTIVE ?? '2');
let active = 0;

function prohibited(address) {
  if (address === '169.254.169.254' || address === 'metadata.google.internal') return true;
  if (isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || parts[0] >= 224;
  }
  const lower = address.toLowerCase();
  return lower === '::1' || lower === '::' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('::ffff:');
}

async function authorize(hostname, port) {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/u, '');
  if (normalized === '' || normalized === 'metadata.google.internal' || ![80, 443].includes(port) || isIP(normalized) !== 0) throw new Error('gateway_target_denied');
  const answers = await dns.lookup(normalized, { all: true, verbatim: true });
  if (answers.length === 0 || answers.some((answer) => prohibited(answer.address))) throw new Error('gateway_address_denied');
  return answers[0].address;
}

const server = http.createServer(async (request, response) => {
  response.writeHead(405, { 'content-type': 'application/json' });
  response.end('{"code":"connect_required"}\n');
});

server.on('connect', async (request, client, head) => {
  if (active >= MAXIMUM_ACTIVE) { client.end('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return; }
  const [hostname, rawPort = '443'] = (request.url ?? '').split(':');
  const port = Number(rawPort);
  active += 1;
  try {
    const address = await authorize(hostname, port);
    const upstream = net.connect({ host: address, port, timeout: 15_000 });
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: clervo-n426-gateway\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
      process.stdout.write(`${JSON.stringify({ schemaVersion: 'clervo.n4.26.gateway-event.v1', event: 'authorized_connect', host: hostname, port, payloadLogged: false, secretLogged: false })}\n`);
    });
    upstream.once('timeout', () => upstream.destroy());
    upstream.once('close', () => { active = Math.max(0, active - 1); });
    upstream.once('error', () => { client.destroy(); });
  } catch (error) {
    active = Math.max(0, active - 1);
    client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    process.stdout.write(`${JSON.stringify({ schemaVersion: 'clervo.n4.26.gateway-event.v1', event: 'denied_connect', host: hostname, port, code: error instanceof Error ? error.message : 'gateway_denied', payloadLogged: false, secretLogged: false })}\n`);
  }
});

server.listen(PORT, '0.0.0.0', () => process.stdout.write('{"schemaVersion":"clervo.n4.26.gateway-event.v1","event":"gateway_ready"}\n'));
