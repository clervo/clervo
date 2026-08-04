import assert from 'node:assert/strict';
import test from 'node:test';

import { createSearchServer } from '../../apps/api/src/search-server.mjs';

const edgeAuthorization = 'edge-authorization-at-least-32-characters';
const path = `/v1/artifacts/tenant_${'a'.repeat(32)}/${'b'.repeat(64)}/png/1785819900/${'c'.repeat(43)}`;

async function withServer(aiArtifactAccess, run) {
  const server = createSearchServer({
    executor: { async execute() { throw new Error('search_not_expected'); } },
    environment: 'test',
    releaseId: 'artifact-http-test',
    edgeAuthorization,
    aiArtifactAccess,
  });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('signed AI artifacts are edge-only, byte-exact, no-store, and fail closed', async () => {
  let retrievals = 0;
  const access = {
    matches: (pathname) => pathname.startsWith('/v1/artifacts/'),
    async retrieve(pathname) {
      retrievals += 1;
      if (pathname.endsWith(`/${'d'.repeat(43)}`)) throw Object.assign(new Error('artifact_access_expired'), { status: 410 });
      return { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png', sha256: `sha256:${'b'.repeat(64)}`, expiresAt: '2026-08-04T08:05:00.000Z' };
    },
  };
  await withServer(access, async (origin) => {
    assert.equal((await fetch(`${origin}${path}`)).status, 401);
    const headers = { 'x-clervo-edge-authorization': `Bearer ${edgeAuthorization}` };
    assert.equal((await fetch(`${origin}${path}`, { method: 'POST', headers })).status, 405);
    assert.equal((await fetch(`${origin}${path}?download=1`, { headers })).status, 400);
    const response = await fetch(`${origin}${path}`, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
    const expired = await fetch(`${origin}${path.slice(0, -43)}${'d'.repeat(43)}`, { headers });
    assert.equal(expired.status, 410);
    assert.equal((await expired.json()).code, 'artifact_access_expired');
  });
  assert.equal(retrievals, 2);
});
