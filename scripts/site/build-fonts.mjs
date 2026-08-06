#!/usr/bin/env node

// Copies the exact font files the site loads into the served asset directory.
//
// The site had no @font-face rule at all: it named Inter in a CSS font stack
// and fell through to Helvetica on every machine that did not already have
// Inter installed, which is most of them. Space Grotesk and JetBrains Mono,
// both locked in 03-brand-system/step-3a, were never loaded in any form.
//
// They are self-hosted rather than fetched from a CDN because the site's own
// Content-Security-Policy sets `font-src 'self'` — a Google Fonts link would be
// blocked at load, silently, on every page.

import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const target = path.join(root, 'apps/site/public-assets/fonts');
const modules = path.join(root, 'node_modules');

// Latin only. The site's copy is English; shipping Cyrillic, Greek, and
// Vietnamese ranges would roughly triple the font payload for text no page
// renders.
const fonts = [
  // Variable weight axis: one file covers every weight the display scale uses,
  // which is cheaper than the three static cuts it replaces.
  ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'inter-latin-variable.woff2'],
  ['@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2', 'jetbrains-mono-latin-variable.woff2'],
  // Space Grotesk has no variable release on fontsource; display roles use two
  // static cuts, which is what the locked type scale actually calls for.
  ['@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2', 'space-grotesk-latin-500.woff2'],
  ['@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff2', 'space-grotesk-latin-600.woff2'],
];

await mkdir(target, { recursive: true });

let total = 0;
for (const [source, name] of fonts) {
  const from = path.join(modules, source);
  await copyFile(from, path.join(target, name));
  total += (await stat(from)).size;
}

// A budget, not a comment: fonts are render-blocking for the headline, so this
// number is the one that decides whether the first paint carries the brand.
const BUDGET_BYTES = 200_000;
if (total > BUDGET_BYTES) {
  throw new Error(`site_font_budget_exceeded: ${total} > ${BUDGET_BYTES}`);
}

console.log(`site fonts: PASS (${fonts.length} files, ${Math.round(total / 1024)} KB of ${Math.round(BUDGET_BYTES / 1024)} KB)`);
