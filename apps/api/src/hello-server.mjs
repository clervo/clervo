#!/usr/bin/env node

import http from 'node:http';

export function createHelloServer({ environment, releaseId }) {
  if (!environment || !releaseId) {
    throw new Error('environment and releaseId are required');
  }

  return http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');

    if (request.method === 'GET' && request.url === '/healthz') {
      response.writeHead(200);
      response.end(JSON.stringify({ status: 'ok', environment, releaseId }));
      return;
    }

    if (request.method === 'GET' && request.url === '/hello') {
      response.writeHead(200);
      response.end(JSON.stringify({ service: 'clervo-api-hello', environment, releaseId }));
      return;
    }

    response.writeHead(404);
    response.end(JSON.stringify({ error: 'not_found' }));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const environment = process.env.CLERVO_ENV;
  const releaseId = process.env.CLERVO_RELEASE_ID;
  const host = process.env.CLERVO_HTTP_HOST ?? '127.0.0.1';
  const port = Number(process.env.CLERVO_HTTP_PORT ?? '3200');
  const server = createHelloServer({ environment, releaseId });

  server.listen(port, host, () => {
    const address = server.address();
    const boundPort = typeof address === 'object' && address ? address.port : port;
    console.log(`clervo hello listening on http://${host}:${boundPort}`);
  });
}