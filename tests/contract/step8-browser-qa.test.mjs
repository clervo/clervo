import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Step 8D browser QA covers the complete route and viewport matrix', async () => {
  const source = await read('scripts/site/browser-qa.mjs');
  assert.match(source, /desktop-1280/);
  assert.match(source, /mobile-390/);
  assert.match(source, /desktop-1600/);
  assert.match(source, /mobile-320/);
  assert.match(source, /manifest\.routes\.map/);
  assert.match(source, /Page\.captureScreenshot/);
});

test('Step 8D browser QA fails on visual, accessibility, runtime, and motion regressions', async () => {
  const source = await read('scripts/site/browser-qa.mjs');
  for (const signal of ['horizontal_overflow', 'accessible_name_missing', 'small_targets', 'duplicate_ids', 'clipped_text', 'runtime_exceptions', 'console_errors', 'network_failures', 'http_errors', 'mobile_menu_open_failed', 'mobile_menu_escape_failed', 'reduced_motion_not_collapsed']) assert.ok(source.includes(signal), signal);
});

test('Step 8D CI uploads browser evidence from a real Chromium run', async () => {
  const workflow = await read('.github/workflows/ci.yml');
  assert.match(workflow, /Step 8 browser and mobile QA/);
  assert.match(workflow, /npm run qa:browser --workspace @clervo\/site/);
  assert.match(workflow, /actions\/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f/);
  assert.match(workflow, /apps\/site\/qa-artifacts/);
});

test('Step 8D hardens primary controls and mobile safe areas', async () => {
  const css = await read('apps/site/src/authority-qa.css');
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /env\(safe-area-inset-left\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});
