import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dockerfile = await readFile(new URL('../../infra/sandbox/runner/Dockerfile', import.meta.url), 'utf8');
const runner = await readFile(new URL('../../infra/sandbox/runner/runner.mjs', import.meta.url), 'utf8');
const launcher = await readFile(new URL('../../infra/sandbox/runner/sandbox-init.c', import.meta.url), 'utf8');
const cloudbuild = await readFile(new URL('../../infra/sandbox/runner/cloudbuild.yaml', import.meta.url), 'utf8');

test('sandbox runner uses immutable bases, non-root identity, no shell execution, and layered resource limits', () => {
  assert.equal((dockerfile.match(/FROM [^\n]+@sha256:[a-f0-9]{64}/gu) ?? []).length, 2); assert.match(dockerfile, /USER 65532:65532/u);
  assert.match(runner, /spawn\('\/opt\/clervo\/sandbox-init', request\.command/u); assert.doesNotMatch(runner, /shell:\s*true/u); assert.match(runner, /process\.kill\(-child\.pid, 'SIGKILL'\)/u);
  for (const control of ['RLIMIT_NPROC', 'RLIMIT_CPU', 'RLIMIT_FSIZE', 'RLIMIT_CORE', 'RLIMIT_NOFILE', 'PR_SET_NO_NEW_PRIVS']) assert.match(launcher, new RegExp(control, 'u'));
  assert.match(cloudbuild, /requestedVerifyOption: VERIFIED/u); assert.match(cloudbuild, /images:\n\s+- us-central1-docker\.pkg\.dev\/\$PROJECT_ID\/clervo-sandbox\/runner/u); assert.match(dockerfile, /node@sha256:c2cc26d8/u);
});
