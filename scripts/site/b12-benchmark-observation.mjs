#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

const out = path.resolve(process.argv.find((item) => item.startsWith('--out='))?.slice(6)
  ?? 'docs/evidence/site/B12-RECOVERY/phase-0/benchmark-browser-observations.json');
const targets = [
  ['Linear home', 'https://linear.app/'],
  ['Vercel home', 'https://vercel.com/'],
  ['OpenRouter models', 'https://openrouter.ai/models/'],
  ['OpenRouter pricing', 'https://openrouter.ai/pricing'],
  ['Stripe Docs', 'https://docs.stripe.com/'],
  ['GitBook Docs', 'https://gitbook.com/docs'],
  ['Vercel Docs', 'https://vercel.com/docs'],
  ['Stripe Quickstarts', 'https://docs.stripe.com/quickstarts'],
  ['Stripe API reference', 'https://docs.stripe.com/api?lang=curl'],
  ['OpenAI Status', 'https://status.openai.com/'],
  ['Cloudflare Trust Hub', 'https://www.cloudflare.com/trust-hub/'],
];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch({ headless: true });
const observations = [];
for (const viewport of viewports) {
  const context = await browser.newContext({ viewport, colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await context.newPage();
  for (const [name, url] of targets) {
    const failures = [];
    page.removeAllListeners();
    page.on('pageerror', (error) => failures.push(`page: ${error.message}`));
    page.on('requestfailed', (request) => {
      if (request.resourceType() === 'document') failures.push(`document: ${request.failure()?.errorText ?? 'failed'}`);
    });
    let response = null;
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(1_500);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
    const observed = await page.evaluate(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const text = (element) => (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/gu, ' ').trim();
      const sticky = [...document.querySelectorAll('header,nav,aside')].filter((element) => {
        const position = getComputedStyle(element).position;
        return visible(element) && (position === 'sticky' || position === 'fixed');
      });
      return {
        title: document.title,
        h1: text(document.querySelector('h1') ?? document.body).slice(0, 240),
        headings: [...document.querySelectorAll('h2')].filter(visible).slice(0, 16).map(text),
        visibleNavigationRegions: [...document.querySelectorAll('nav')].filter(visible).length,
        visibleSearchControls: [...document.querySelectorAll('input[type="search"],[role="searchbox"],[aria-label*="search" i]')]
          .filter(visible).map((element) => text(element) || element.getAttribute('placeholder') || element.tagName),
        visibleButtons: [...document.querySelectorAll('button')].filter(visible).slice(0, 30).map(text),
        selectCount: [...document.querySelectorAll('select')].filter(visible).length,
        tableCount: [...document.querySelectorAll('table,[role="table"]')].filter(visible).length,
        codeBlockCount: [...document.querySelectorAll('pre,code')].filter(visible).length,
        tabCount: [...document.querySelectorAll('[role="tab"]')].filter(visible).length,
        disclosureCount: [...document.querySelectorAll('details,summary,[aria-expanded]')].filter(visible).length,
        stickyRegions: sticky.map((element) => ({ tag: element.tagName.toLowerCase(), label: text(element).slice(0, 160) })),
        activeAnimations: document.getAnimations().filter((animation) => animation.playState === 'running').length,
        videoCount: [...document.querySelectorAll('video')].filter(visible).length,
        canvasCount: [...document.querySelectorAll('canvas')].filter(visible).length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    observations.push({
      name,
      url,
      viewport,
      status: response?.status() ?? null,
      finalUrl: page.url(),
      failures,
      ...observed,
    });
  }
  await context.close();
}
await browser.close();
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify({
  schemaVersion: 'clervo.b12-recovery.benchmark-observation.v1',
  generatedAt: new Date().toISOString(),
  methodology: 'Official public pages observed in Chromium at 1440x900 and 390x844 with reduced motion; DOM behavior inventory only, not a visual-design source.',
  observations,
}, null, 2)}\n`);
console.log(`${observations.length} benchmark viewport observations -> ${out}`);
