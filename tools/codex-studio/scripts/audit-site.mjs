#!/usr/bin/env node

import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../../..');
const output = path.join(root, 'docs/evidence/site/v6-browser-baseline');
const origin = process.env.CLERVO_SITE_ORIGIN ?? 'http://127.0.0.1:4173';
const routes = [
  '/',
  '/research',
  '/platform',
  '/product',
  '/products/search',
  '/products/ai',
  '/products/sandbox',
  '/products/rpc',
  '/products/prediction',
  '/products/crypto',
  '/build',
  '/proof',
  '/proof-lab',
  '/docs/quickstart',
  '/docs/http',
  '/docs/typescript',
  '/docs/python',
  '/docs/mcp',
  '/docs/receipts',
  '/docs/replay',
  '/docs/failures',
  '/docs/x402',
  '/docs/catalog',
  '/pricing',
  '/benchmarks',
  '/security',
  '/legal',
  '/status',
  '/changelog',
  '/compare/blockrun',
  '/trust',
];
const browser = await chromium.launch({ headless: true });
const report = {
  origin,
  routes: [],
  navigation: {},
  responsive: [],
  runtimeDelivery: {},
  staticHtml: {},
  violations: [],
  consoleErrors: [],
  pageErrors: [],
};

for (const route of routes) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push({ route, text: message.text() });
  });
  page.on('pageerror', (error) => report.pageErrors.push({ route, text: error.message }));
  await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' });
  const results = await new AxeBuilder({ page }).analyze();
  report.routes.push({ route, title: await page.title(), violations: results.violations.length });
  report.violations.push(...results.violations.map((violation) => ({
    route,
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    nodes: violation.nodes.map((node) => node.target),
  })));
  await context.close();
}

const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});
const mobile = await mobileContext.newPage();
await mobile.goto(`${origin}/proof-lab`, { waitUntil: 'networkidle' });
const mobileResults = await new AxeBuilder({ page: mobile }).analyze();
report.violations.push(...mobileResults.violations.map((violation) => ({
  route: '/proof-lab?mobile-reduced',
  id: violation.id,
  impact: violation.impact,
  description: violation.description,
  nodes: violation.nodes.map((node) => node.target),
})));
await mobileContext.close();

for (const route of ['/proof-lab', '/build']) {
  for (const viewport of [
    { width: 320, height: 700 },
    { width: 360, height: 780 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 844, height: 390 },
  ]) {
    const responsiveContext = await browser.newContext({ viewport });
    const responsivePage = await responsiveContext.newPage();
    await responsivePage.goto(`${origin}${route}`, { waitUntil: 'networkidle' });
    const dimensions = await responsivePage.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    report.responsive.push({ route, viewport, ...dimensions, overflow: dimensions.scrollWidth > dimensions.clientWidth });
    await responsiveContext.close();
  }
}

const zoomContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const zoomPage = await zoomContext.newPage();
await zoomPage.goto(`${origin}/docs/typescript`, { waitUntil: 'networkidle' });
await zoomPage.evaluate(() => {
  document.documentElement.style.fontSize = '200%';
});
const zoomDimensions = await zoomPage.evaluate(() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
}));
report.responsive.push({
  viewport: { width: 390, height: 844 },
  textZoom: '200%',
  ...zoomDimensions,
  overflow: zoomDimensions.scrollWidth > zoomDimensions.clientWidth,
});
await zoomContext.close();

const deliveryContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});
const deliveryPage = await deliveryContext.newPage();
const mobileRequests = [];
deliveryPage.on('request', (request) => mobileRequests.push(request.url()));
await deliveryPage.goto(origin, { waitUntil: 'networkidle' });
report.runtimeDelivery.mobileLoadedWebGL = mobileRequests.some((url) => (
  url.includes('WebGLInstrument') || url.includes('WebGLWorlds')
  || url.endsWith('clervo-prism.glb') || url.endsWith('clervo-worlds.glb')
));
report.runtimeDelivery.mobileLoadedCanonicalStill = mobileRequests.some((url) => (
  url.endsWith('clervo-prism-portrait-risk.webp')
));
await deliveryContext.close();

const desktopDeliveryContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const desktopDeliveryPage = await desktopDeliveryContext.newPage();
const desktopRequests = [];
desktopDeliveryPage.on('request', (request) => desktopRequests.push(request.url()));
await desktopDeliveryPage.goto(origin, { waitUntil: 'networkidle' });
report.runtimeDelivery.desktopLoadedWebGLBeforeInteraction = desktopRequests.some((url) => (
  url.includes('WebGLInstrument') || url.includes('WebGLWorlds')
  || url.endsWith('clervo-prism.glb') || url.endsWith('clervo-worlds.glb')
));
await desktopDeliveryPage.mouse.move(720, 500);
await desktopDeliveryPage.waitForFunction(() => (
  [...performance.getEntriesByType('resource')].some(({ name }) => name.includes('clervo-prism.glb'))
));
report.runtimeDelivery.desktopLoadedWebGLAfterInteraction = desktopRequests.some((url) => (
  url.includes('WebGLInstrument') || url.endsWith('clervo-prism.glb')
));
await desktopDeliveryPage.locator('.worlds-stage').scrollIntoViewIfNeeded();
await desktopDeliveryPage.waitForFunction(() => (
  [...performance.getEntriesByType('resource')].some(({ name }) => name.includes('clervo-worlds.glb'))
));
report.runtimeDelivery.desktopLoadedWorldsAfterScroll = desktopRequests.some((url) => (
  url.includes('WebGLWorlds') || url.endsWith('clervo-worlds.glb')
));
report.runtimeDelivery.contextLossFallbacksVisible = await desktopDeliveryPage.evaluate(async () => {
  for (const canvas of document.querySelectorAll('canvas')) {
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  }
  await new Promise((resolve) => window.setTimeout(resolve, 50));
  const prism = document.querySelector('.instrument-still img');
  const worlds = document.querySelector('.worlds-still img');
  return prism instanceof HTMLImageElement && prism.complete && prism.naturalWidth > 0
    && worlds instanceof HTMLImageElement && worlds.complete && worlds.naturalWidth > 0;
});
await desktopDeliveryContext.close();

const noScriptContext = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  javaScriptEnabled: false,
});
const noScriptPage = await noScriptContext.newPage();
await noScriptPage.goto(`${origin}/docs/typescript/`, { waitUntil: 'networkidle' });
report.staticHtml.docsTitle = await noScriptPage.title();
report.staticHtml.docsHeading = await noScriptPage.locator('h2').filter({ hasText: 'TypeScript' }).first().textContent();
report.staticHtml.hasCanonical = await noScriptPage.locator('link[rel="canonical"]').count() === 1;
await noScriptContext.close();

const navigationContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const navigationPage = await navigationContext.newPage();
await navigationPage.goto(origin, { waitUntil: 'networkidle' });
await navigationPage.getByRole('link', { name: 'See the first outcome' }).click();
report.navigation.forward = new URL(navigationPage.url()).pathname;
await navigationPage.goBack();
report.navigation.back = new URL(navigationPage.url()).pathname;
await navigationPage.goForward();
report.navigation.forwardAgain = new URL(navigationPage.url()).pathname;
await navigationPage.keyboard.press('Control+K');
report.navigation.commandOpened = await navigationPage.getByRole('dialog', { name: 'Search Clervo' }).isVisible();
await navigationPage.getByRole('searchbox').fill('security');
await navigationPage.keyboard.press('Enter');
report.navigation.commandDestination = new URL(navigationPage.url()).pathname;
await navigationPage.keyboard.press('Tab');
report.navigation.firstTabTarget = await navigationPage.evaluate(() => {
  const active = document.activeElement;
  return active instanceof HTMLElement ? active.innerText || active.getAttribute('aria-label') : null;
});
await navigationContext.close();
await browser.close();

await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'audit.json'), `${JSON.stringify(report, null, 2)}\n`);

const severe = report.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical');
const responsivePassed = report.responsive.every(({ overflow }) => overflow === false);
const deliveryPassed = report.runtimeDelivery.mobileLoadedWebGL === false
  && report.runtimeDelivery.mobileLoadedCanonicalStill === true
  && report.runtimeDelivery.desktopLoadedWebGLBeforeInteraction === false
  && report.runtimeDelivery.desktopLoadedWebGLAfterInteraction === true
  && report.runtimeDelivery.desktopLoadedWorldsAfterScroll === true
  && report.runtimeDelivery.contextLossFallbacksVisible === true;
const staticHtmlPassed = report.staticHtml.docsHeading?.includes('TypeScript') === true
  && report.staticHtml.hasCanonical === true;
const navigationPassed = report.navigation.forward === '/research'
  && report.navigation.back === '/'
  && report.navigation.forwardAgain === '/research'
  && report.navigation.commandOpened === true
  && report.navigation.commandDestination === '/security';
if (severe.length > 0 || report.consoleErrors.length > 0 || report.pageErrors.length > 0 || !navigationPassed || !responsivePassed || !deliveryPassed || !staticHtmlPassed) {
  console.error(JSON.stringify({
    severe,
    navigation: report.navigation,
    responsive: report.responsive,
    runtimeDelivery: report.runtimeDelivery,
    staticHtml: report.staticHtml,
    consoleErrors: report.consoleErrors,
    pageErrors: report.pageErrors,
  }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`site audit: PASS (${routes.length} routes, ${report.responsive.length} responsive modes, static HTML, 0 axe findings)`);
}
