#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHelloServer } from '../apps/api/src/hello-server.mjs';

const environment = process.env.CLERVO_ENV ?? 'staging';
const releaseId = process.env.CLERVO_RELEASE_ID ?? 'local-staging-smoke';
const server = createHelloServer({ environment, releaseId });

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  assert.equal(typeof address, 'object');
  assert.ok(address);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const healthResponse = await fetch(`${baseUrl}/healthz`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { status: 'ok', environment, releaseId });

  const helloResponse = await fetch(`${baseUrl}/hello`);
  assert.equal(helloResponse.status, 200);
  assert.deepEqual(await helloResponse.json(), {
    service: 'clervo-api-hello',
    environment,
    releaseId,
  });

  const missingResponse = await fetch(`${baseUrl}/missing`);
  assert.equal(missingResponse.status, 404);

  console.log('staging smoke: PASS');
  console.log(`environment: ${environment}`);
  console.log(`release: ${releaseId}`);
  console.log('network calls made: 0 external; loopback HTTP only');
  console.log('USDC spent: 0');
} catch (error) {
  console.error(`staging smoke: FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  await new Promise((resolve) => server.close(resolve));
}