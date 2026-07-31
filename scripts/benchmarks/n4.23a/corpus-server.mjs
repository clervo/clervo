import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export async function startCorpusServer() {
  const corpus = JSON.parse(await readFile(path.join(root, 'tests/fixtures/n4.23a-bounded-corpus.json'), 'utf8'));
  const routes = new Map(corpus.routes.map((route) => [route.path, route]));
  const server = http.createServer((request, response) => {
    if (request.method !== 'GET') {
      response.writeHead(405, { 'content-type': 'text/plain', 'content-length': '18' });
      response.end('method not allowed');
      return;
    }
    const route = routes.get(new URL(request.url ?? '/', 'http://fixture.invalid').pathname);
    if (!route) {
      response.writeHead(404, { 'content-type': 'text/plain', 'content-length': '9' });
      response.end('not found');
      return;
    }
    const body = route.generatedBytes === undefined ? Buffer.from(route.body, 'utf8') : Buffer.alloc(route.generatedBytes, 88);
    const headers = { 'content-type': route.contentType, 'content-length': String(body.length), 'cache-control': 'no-store' };
    if (route.location !== undefined) headers.location = route.location;
    response.writeHead(route.status ?? 200, headers);
    response.end(body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('corpus server did not bind a TCP port');
  return {
    corpus,
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error))),
  };
}
