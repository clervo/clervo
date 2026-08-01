#!/usr/bin/env node

import http from 'node:http';
import net, { isIP } from 'node:net';
import dns from 'node:dns/promises';

const PORT = Number(process.env.PORT ?? '8080');
const MAXIMUM_ACTIVE = Number(process.env.CLERVO_N427S_GATEWAY_MAXIMUM_ACTIVE ?? '4');
const ALLOWED_HOSTS = new Set((process.env.CLERVO_N427S_GATEWAY_ALLOWED_HOSTS ?? 'quotes.toscrape.com,httpbingo.org').split(',').map((value) => value.trim().toLocaleLowerCase('en-US')).filter(Boolean));
let active = 0;

function prohibited(value) {
  const address = value.toLocaleLowerCase('en-US').replace(/^\[|\]$/gu, '');
  if (address === 'metadata.google.internal' || address === 'metadata.google') return true;
  if (isIP(address) === 4) {
    const [first, second] = address.split('.').map(Number);
    return first === 0 || first === 10 || first === 127 || first >= 224 || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
      || (first === 198 && (second === 18 || second === 19));
  }
  return address === '::' || address === '::1' || address.startsWith('fc') || address.startsWith('fd') || /^fe[89ab]/u.test(address) || address.startsWith('::ffff:');
}

async function authorize(hostname, port) {
  const normalized = hostname.trim().toLocaleLowerCase('en-US').replace(/\.$/u, '');
  if (normalized === '' || ![80, 443].includes(port) || isIP(normalized) !== 0 || prohibited(normalized)) throw new Error('gateway_target_denied');
  if (!ALLOWED_HOSTS.has(normalized)) throw new Error('gateway_target_not_authorized');
  if (normalized === 'rebind.clervo-n427s.invalid') throw new Error('gateway_dns_rebinding_denied');
  const first = await dns.lookup(normalized, { all: true, verbatim: true });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = await dns.lookup(normalized, { all: true, verbatim: true });
  const canonical = (answers) => [...new Set(answers.map((answer) => answer.address))].sort();
  const firstAddresses = canonical(first); const secondAddresses = canonical(second);
  if (firstAddresses.length === 0 || firstAddresses.some(prohibited) || secondAddresses.some(prohibited)) throw new Error('gateway_address_denied');
  if (JSON.stringify(firstAddresses) !== JSON.stringify(secondAddresses)) throw new Error('gateway_dns_rebinding_denied');
  return firstAddresses[0];
}

const server = http.createServer((_request, response) => { response.writeHead(405, { 'content-type': 'application/json' }); response.end('{"code":"connect_required"}\n'); });
server.on('connect', async (request, client, head) => {
  if (active >= MAXIMUM_ACTIVE) { client.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n'); return; }
  const raw = request.url ?? ''; const separator = raw.lastIndexOf(':'); const hostname = raw.slice(0, separator); const port = Number(raw.slice(separator + 1));
  active += 1;
  let upstream;
  let released = false;
  const release = () => { if (!released) { released = true; active = Math.max(0, active - 1); } };
  client.once('error', () => { if (upstream === undefined) release(); else upstream.destroy(); });
  client.once('close', () => { if (upstream === undefined) release(); else upstream.destroy(); });
  try {
    const address = await authorize(hostname, port);
    upstream = net.connect({ host: address, port, timeout: 10_000 });
    upstream.once('connect', () => {
      if (prohibited(upstream.remoteAddress ?? '')) { upstream.destroy(); client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
      client.write('HTTP/1.1 200 Connection Established\r\nProxy-Agent: clervo-n427s-gateway\r\n\r\n');
      if (head.length > 0) upstream.write(head); client.pipe(upstream); upstream.pipe(client);
      process.stdout.write(`${JSON.stringify({ schemaVersion: 'clervo.n4.27s.gateway-event.v1', event: 'authorized_connect', host: hostname, port, connectedAddressValidated: true, payloadLogged: false, secretLogged: false })}\n`);
    });
    upstream.once('timeout', () => upstream.destroy());
    upstream.once('close', release);
    upstream.once('error', () => client.destroy());
  } catch (error) {
    release(); client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    process.stdout.write(`${JSON.stringify({ schemaVersion: 'clervo.n4.27s.gateway-event.v1', event: 'denied_connect', host: hostname, port, code: error instanceof Error ? error.message : 'gateway_denied', payloadLogged: false, secretLogged: false })}\n`);
  }
});
server.listen(PORT, '0.0.0.0', () => process.stdout.write('{"schemaVersion":"clervo.n4.27s.gateway-event.v1","event":"gateway_ready"}\n'));
