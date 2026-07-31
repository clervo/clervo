import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()));
  const address = server.address();
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(origin) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${origin}/healthz`);
      if (response.status === 200) return;
    } catch {
      // The child may still be binding its listener.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('staging entry point did not become healthy');
}

async function withStagingProcess(run) {
  const port = await freePort();
  const releaseId = 'n4.18-loopback-release';
  const child = spawn(process.execPath, ['./apps/api/src/staging-search-main.mjs'], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      CLERVO_ENV: 'staging',
      CLERVO_RELEASE_ID: releaseId,
      CLERVO_HTTP_HOST: '127.0.0.1',
      PORT: String(port),
      CLERVO_PUBLIC_ORIGIN: 'https://staging.clervo.invalid',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  try {
    const origin = `http://127.0.0.1:${port}`;
    await waitForHealth(origin);
    await run({ origin, releaseId });
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    assert.equal(stderr, '');
  }
}

test('deployable staging entry point exposes release health and keeps mock-paid execution disabled', async () => {
  await withStagingProcess(async ({ origin, releaseId }) => {
    const healthResponse = await fetch(`${origin}/healthz`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), {
      status: 'ok',
      service: 'clervo-search-api',
      environment: 'staging',
      releaseId,
      paidExecutionEnabled: false,
    });

    const paidResponse = await fetch(`${origin}/v1/search/paid`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'idem_n418_paid_disabled',
      },
      body: JSON.stringify({ query: 'must remain disabled', synthesize: false }),
    });
    assert.equal(paidResponse.status, 402);
    assert.equal((await paidResponse.json()).extensions.clervo.executionAllowed, false);
  });
});

test('live smoke collector proves the recorded free sample and writes bounded evidence', async () => {
  await withStagingProcess(async ({ origin, releaseId }) => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'clervo-n418-'));
    const evidencePath = path.join(temporary, 'live-smoke.json');
    try {
      const result = spawnSync(process.execPath, ['./scripts/staging-live-smoke.mjs'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          CLERVO_STAGING_ORIGIN: origin,
          CLERVO_RELEASE_ID: releaseId,
          CLERVO_STAGING_EVIDENCE_PATH: evidencePath,
        },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /staging live smoke: PASS/u);
      const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
      assert.equal(evidence.freeSample.status, 200);
      assert.equal(evidence.freeSample.resultCount, 2);
      assert.equal(evidence.freeSample.synthesisOutcome, 'synthesized');
      assert.deepEqual(evidence.paidRoute, { status: 402, executionAllowed: false, paymentMode: 'non-payable-challenge' });
      assert.equal(evidence.externalProviderCallsProven, false);
      assert.equal(evidence.realPaymentProven, false);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});

test('GCP operator script is pinned to the authorized target and fails closed without tooling', () => {
  const source = spawnSync('cat', ['./scripts/gcp-staging.sh'], { cwd: repositoryRoot, encoding: 'utf8' }).stdout;
  assert.match(source, /EXPECTED_PROJECT="bloxsniper-prod"/u);
  assert.match(source, /EXPECTED_REGION="us-central1"/u);
  assert.match(source, /SERVICE="clervo-stage4-slice-staging"/u);
  assert.match(source, /--max-instances 1/u);

  const entryPoint = spawnSync('cat', ['./apps/api/src/staging-search-main.mjs'], { cwd: repositoryRoot, encoding: 'utf8' }).stdout;
  assert.match(entryPoint, /allowMockPaidExecution: false/u);

  const result = spawnSync('/bin/bash', ['./scripts/gcp-staging.sh', 'inspect'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { PATH: '/clervo-test-no-tools', GCP_PROJECT: 'bloxsniper-prod', GCP_REGION: 'us-central1' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /required command not found: gcloud/u);
});

test('container artifact pins the runtime, builds before runtime, and drops root', async () => {
  const dockerfile = await readFile(path.join(repositoryRoot, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /^FROM node:24\.18\.1-bookworm-slim AS build$/mu);
  assert.match(dockerfile, /COPY scripts\/verify-runtime\.mjs \.\/scripts\/verify-runtime\.mjs/u);
  assert.match(dockerfile, /RUN npm run build/u);
  assert.match(dockerfile, /^USER node$/mu);
  assert.match(dockerfile, /staging-search-main\.mjs/u);
});