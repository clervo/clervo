#!/usr/bin/env node

/*
 * Deterministic visual regression harness.
 *
 * Captures every tracked route at every supported width and compares each
 * capture against a committed baseline. Screenshots are only useful as a
 * regression signal if they are reproducible, so this script freezes every
 * source of frame-to-frame variation before it shoots:
 *
 *   - animations and transitions are disabled, and caret blink is stopped;
 *   - `prefers-reduced-motion` is forced, which also parks the 3D instrument
 *     on its poster instead of a live frame;
 *   - the device scale factor is pinned to 1 so a host with a different DPI
 *     produces the same bytes.
 *
 * Usage:
 *   node scripts/site/visual-regression.mjs --update   write baselines
 *   node scripts/site/visual-regression.mjs            compare, exit 1 on drift
 *
 * The server under test defaults to a local preview of apps/site/dist; pass
 * --base=<url> to point it at a preview deployment instead.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '../..');
const baselineDir = path.join(root, 'apps/site/visual-baseline');
const outputDir = path.join(root, 'apps/site/visual-output');

const update = process.argv.includes('--update');
const baseArgument = process.argv.find((value) => value.startsWith('--base='));
const base = baseArgument?.slice('--base='.length) ?? 'http://127.0.0.1:4173';

// The six widths the locked responsive foundation is defined at. 320 is a
// supported width, not a degradation width, so it is checked like the others.
const widths = [320, 390, 768, 1024, 1280, 1600];

const routes = [
  ['home', '/'],
  ['start', '/start/'],
  ['catalog', '/catalog/'],
  ['product', '/product/'],
  ['pricing', '/pricing/'],
  ['docs', '/docs/'],
  ['status', '/status/'],
  ['proof', '/proof/'],
];

// A pixel is "different" only if a channel moves by more than this. Text
// antialiasing moves by one or two levels between otherwise identical runs;
// a real regression moves far more.
const CHANNEL_TOLERANCE = 8;
// Fraction of differing pixels tolerated before a route is reported as drifted.
const PIXEL_BUDGET = 0.001;

const freeze = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
`;

/*
 * Compare two PNG buffers inside the browser and return only the verdict.
 *
 * The comparison runs in the page rather than in Node so the harness needs no
 * image-decoding dependency of its own — and, just as importantly, so the pixel
 * data never crosses the bridge. A full-page capture at 1600px is tens of
 * millions of channel values; serialising two of those as JavaScript arrays
 * exhausted the heap before the first route finished. Only the dimensions and a
 * count come back.
 */
async function comparePixels(page, baseline, shot, tolerance) {
  return page.evaluate(async ([baselineBase64, shotBase64, channelTolerance]) => {
    const load = async (base64) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${base64}`)).blob(),
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('canvas_context_unavailable');
      context.drawImage(bitmap, 0, 0);
      return {
        width: bitmap.width,
        height: bitmap.height,
        data: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
      };
    };
    const a = await load(baselineBase64);
    const b = await load(shotBase64);
    if (a.width !== b.width || a.height !== b.height) {
      return { a: { width: a.width, height: a.height }, b: { width: b.width, height: b.height } };
    }
    let differing = 0;
    for (let index = 0; index < a.data.length; index += 4) {
      if (
        Math.abs(a.data[index] - b.data[index]) > channelTolerance
        || Math.abs(a.data[index + 1] - b.data[index + 1]) > channelTolerance
        || Math.abs(a.data[index + 2] - b.data[index + 2]) > channelTolerance
      ) differing += 1;
    }
    return {
      a: { width: a.width, height: a.height },
      b: { width: b.width, height: b.height },
      fraction: differing / (a.data.length / 4),
    };
  }, [baseline.toString('base64'), shot.toString('base64'), tolerance]);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  colorScheme: 'dark',
});
const page = await context.newPage();
await page.addStyleTag({ content: freeze }).catch(() => {});

const failures = [];
const consoleErrors = [];
let captured = 0;

await mkdir(update ? baselineDir : outputDir, { recursive: true });

for (const [name, route] of routes) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    const onConsole = (message) => {
      if (message.type() === 'error') errors.push(message.text());
    };
    page.on('console', onConsole);
    const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
    page.off('console', onConsole);
    if (response === null || !response.ok()) {
      failures.push(`${name}@${width}: HTTP ${response?.status() ?? 'no response'}`);
      continue;
    }
    if (errors.length > 0) consoleErrors.push(`${name}@${width}: ${errors.join(' | ')}`);
    await page.addStyleTag({ content: freeze });
    // Fonts must be resolved before the shot, or the baseline records a
    // fallback face on a cold cache and the real face on a warm one.
    await page.evaluate(() => document.fonts.ready);

    const shot = await page.screenshot({ fullPage: true, animations: 'disabled' });
    const file = `${name}-${width}.png`;

    if (update) {
      await writeFile(path.join(baselineDir, file), shot);
      captured += 1;
      continue;
    }

    let baseline;
    try {
      baseline = await readFile(path.join(baselineDir, file));
    } catch {
      failures.push(`${name}@${width}: no baseline (run with --update)`);
      continue;
    }

    if (baseline.equals(shot)) {
      captured += 1;
      continue;
    }

    const { a, b, fraction } = await comparePixels(page, baseline, shot, CHANNEL_TOLERANCE);
    if (fraction === undefined) {
      failures.push(`${name}@${width}: size ${a.width}x${a.height} became ${b.width}x${b.height}`);
      await mkdir(outputDir, { recursive: true });
      await writeFile(path.join(outputDir, file), shot);
      continue;
    }

    if (fraction > PIXEL_BUDGET) {
      await mkdir(outputDir, { recursive: true });
      await writeFile(path.join(outputDir, file), shot);
      failures.push(`${name}@${width}: ${(fraction * 100).toFixed(3)}% of pixels changed`);
    } else {
      captured += 1;
    }
  }
}

await browser.close();

for (const error of consoleErrors) console.error(`console error ${error}`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`visual regression ${failure}`);
  console.error(`site visual regression: FAIL (${failures.length} of ${routes.length * widths.length})`);
  process.exitCode = 1;
} else {
  const baselineCount = update
    ? captured
    : (await readdir(baselineDir).catch(() => [])).length;
  console.log(
    update
      ? `site visual baseline: WROTE ${captured} captures (${routes.length} routes x ${widths.length} widths)`
      : `site visual regression: PASS (${captured} captures matched ${baselineCount} baselines)`,
  );
}

// A console error is a defect even when the pixels match: the deployed site
// logs one on every page today because the Content-Security-Policy blocks an
// injected analytics beacon, and that must not be allowed to become normal.
if (consoleErrors.length > 0) process.exitCode = 1;
