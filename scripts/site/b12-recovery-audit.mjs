#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

import { siteRouteInventory } from './site-route-inventory.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const value = (flag, fallback) => {
  const exact = process.argv.find((item) => item.startsWith(`${flag}=`));
  return exact === undefined ? fallback : exact.slice(flag.length + 1);
};
const base = value('--base', 'http://127.0.0.1:4173').replace(/\/$/u, '');
const out = path.resolve(value('--out', path.join(root, 'apps/site/qa-artifacts/b12-recovery-phase-0')));
const inventory = await siteRouteInventory(root);
const canonicalRoutes = new Set(inventory.map(({ route }) => route));
const terms = [
  'prototype',
  'fixture',
  'design prototype',
  'design target',
  'illustrative',
  'demonstration',
  'no payment',
  'no execution',
  'no account action',
  'no live setup',
  'disconnected',
];

function normalizePath(href) {
  const url = new URL(href, base);
  if (url.origin !== new URL(base).origin) return null;
  const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/u, '');
  return pathname;
}

function isMachineSurface(pathname) {
  return pathname.startsWith('/.well-known/')
    || pathname.startsWith('/assets/')
    || pathname.startsWith('/schemas/')
    || /\.(?:json|ya?ml|xml|txt|md|webmanifest|zip|svg|png|webp|woff2)$/u.test(pathname);
}

function countTerms(text) {
  const lower = text.toLowerCase();
  return terms.flatMap((term) => {
    let start = 0;
    const excerpts = [];
    while (true) {
      const index = lower.indexOf(term, start);
      if (index === -1) break;
      const from = Math.max(0, index - 90);
      const to = Math.min(text.length, index + term.length + 130);
      excerpts.push(text.slice(from, to).replace(/\s+/gu, ' ').trim());
      start = index + term.length;
    }
    return excerpts.length === 0 ? [] : [{ term, count: excerpts.length, excerpts: [...new Set(excerpts)] }];
  });
}

async function captureRoute(page, route, viewport) {
  const errors = [];
  const pageErrors = [];
  const failedRequests = [];
  const onConsole = (message) => {
    if (message.type() === 'error') errors.push(message.text());
  };
  const onPageError = (error) => pageErrors.push(error.message);
  const onRequestFailed = (request) => failedRequests.push({
    url: request.url(),
    failure: request.failure()?.errorText ?? 'unknown',
  });
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);

  let response;
  try {
    response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (error) {
    pageErrors.push(error instanceof Error ? error.message : String(error));
  }
  const result = await page.evaluate(({ terms: auditTerms, width }) => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01
        && rect.width > 0
        && rect.height > 0;
    };
    const label = (element) => {
      const associatedLabels = 'labels' in element && element.labels !== null
        ? [...element.labels].map((item) => item.textContent ?? '').join(' ')
        : '';
      return (
        element.getAttribute('aria-label')
        || element.getAttribute('title')
        || element.textContent
        || associatedLabels
        || element.getAttribute('placeholder')
        || ''
      ).replace(/\s+/gu, ' ').trim();
    };
    const bodyText = document.body.innerText.replace(/\s+/gu, ' ').trim();
    const lower = bodyText.toLowerCase();
    const residue = auditTerms.flatMap((term) => lower.includes(term) ? [term] : []);
    const controls = [...document.querySelectorAll('a[href],button,input,select,textarea,[role="button"],[role="tab"],[role="searchbox"]')]
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        const href = element instanceof HTMLAnchorElement ? element.href : null;
        return {
          index,
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute('role'),
          label: label(element),
          href,
          visible: visible(element),
          disabled: element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement
            ? element.disabled
            : element.getAttribute('aria-disabled') === 'true',
          current: element.getAttribute('aria-current'),
          expanded: element.getAttribute('aria-expanded'),
          pressed: element.getAttribute('aria-pressed'),
          selected: element.getAttribute('aria-selected'),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
    const dataStates = [...document.querySelectorAll('*')].flatMap((element) => {
      const entries = Object.entries(element.dataset).filter(([key]) => /state|phase|tone|mode|stage|family|proof|control|scenario/u.test(key));
      return entries.length === 0 ? [] : [{
        element: element.id === '' ? element.className || element.tagName.toLowerCase() : `#${element.id}`,
        values: Object.fromEntries(entries),
      }];
    });
    const landmarks = [...document.querySelectorAll('header,nav,main,aside,footer,[role="navigation"],[role="dialog"],[role="search"]')]
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role'),
        label: label(element).slice(0, 160),
        className: typeof element.className === 'string' ? element.className : '',
        visible: visible(element),
      }));
    return {
      url: location.href,
      viewport: { width, height: innerHeight },
      title: document.title,
      canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
      robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
      headings: [...document.querySelectorAll('h1,h2,h3')].map((heading) => ({ level: heading.tagName.toLowerCase(), text: label(heading) })),
      sections: [...document.querySelectorAll('main section')].map((section, index) => ({
        index,
        id: section.id || null,
        className: typeof section.className === 'string' ? section.className : '',
        heading: label(section.querySelector('h1,h2,h3') ?? section).slice(0, 180),
      })),
      landmarks,
      controls,
      dataStates,
      bodyText,
      residue,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
    };
  }, { terms, width: viewport.width });

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('requestfailed', onRequestFailed);
  return {
    route,
    responseStatus: response?.status() ?? null,
    ...result,
    residue: countTerms(result.bodyText),
    bodyText: undefined,
    consoleErrors: [...new Set(errors)],
    pageErrors: [...new Set(pageErrors)],
    failedRequests,
    horizontalOverflow: result.scrollWidth > result.clientWidth + 1,
  };
}

const browser = await chromium.launch({ headless: true });
const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' });
const desktopPage = await desktopContext.newPage();
const mobilePage = await mobileContext.newPage();
const desktop = [];
const mobile = [];

for (const item of inventory) {
  desktop.push(await captureRoute(desktopPage, item.route, { width: 1280, height: 900 }));
  mobile.push(await captureRoute(mobilePage, item.route, { width: 390, height: 844 }));
}

const missingRoute = await captureRoute(desktopPage, '/b12-recovery-audit-missing-route', { width: 1280, height: 900 });
await desktopContext.close();
await mobileContext.close();
await browser.close();

const routeByPath = new Map(desktop.map((item) => [item.route, item]));
const links = desktop.flatMap((page) => page.controls.flatMap((control) => {
  if (control.tag !== 'a' || control.href === null) return [];
  const parsed = new URL(control.href);
  const internal = parsed.origin === new URL(base).origin;
  const destination = internal ? normalizePath(control.href) : control.href;
  return [{
    source: page.route,
    label: control.label,
    destination,
    internal,
    visibleDesktop: control.visible,
    visibleMobile: mobile.find(({ route }) => route === page.route)?.controls.some((candidate) => (
      candidate.tag === 'a'
      && candidate.label === control.label
      && candidate.href !== null
      && normalizePath(candidate.href) === destination
      && candidate.visible
    )) ?? false,
    current: control.current,
  }];
}));

const graphEdges = links.filter(({ internal, destination }) => internal && destination !== null && canonicalRoutes.has(destination));
const inbound = new Map([...canonicalRoutes].map((route) => [route, 0]));
for (const { destination } of graphEdges) inbound.set(destination, (inbound.get(destination) ?? 0) + 1);
const orphanRoutes = [...inbound.entries()].filter(([route, count]) => route !== '/' && count === 0).map(([route]) => route);
const invalidInternalDestinations = [...new Set(links.flatMap(({ internal, destination }) => {
  if (!internal || destination === null || destination === '/' || canonicalRoutes.has(destination) || isMachineSurface(destination)) return [];
  return [destination];
}))].sort();
const noOnwardAction = desktop.filter((page) => !links.some(({ source, internal, destination }) => (
  source === page.route && internal && destination !== null && canonicalRoutes.has(destination) && destination !== source
))).map(({ route }) => route);
const labelDestinations = Object.entries(Object.groupBy(links.filter(({ label }) => label !== ''), ({ label }) => label.toLowerCase()))
  .map(([label, items]) => ({ label, destinations: [...new Set(items.map(({ destination }) => destination))] }))
  .filter(({ destinations }) => destinations.length > 1)
  .sort((left, right) => left.label.localeCompare(right.label));
const generatedContext = desktop.filter(({ route }) => route.startsWith('/models/') || route.startsWith('/operations/')).map((page) => ({
  route: page.route,
  internalCanonicalLinks: links.filter(({ source, internal, destination }) => source === page.route && internal && destination !== null && canonicalRoutes.has(destination)).length,
  onwardDestinations: [...new Set(links.filter(({ source, internal, destination }) => source === page.route && internal && destination !== null && canonicalRoutes.has(destination) && destination !== page.route).map(({ destination }) => destination))],
}));

const report = {
  schemaVersion: 'clervo.b12-recovery.forensic-audit.v1',
  generatedAt: new Date().toISOString(),
  base,
  inventory: {
    total: inventory.length,
    counts: Object.fromEntries(Object.entries(Object.groupBy(inventory, ({ kind }) => kind)).map(([kind, items]) => [kind, items.length])),
    routes: inventory,
  },
  desktop,
  mobile,
  missingRoute,
  // Keyword matching finds candidates, not semantic validity. The authoritative
  // inventory classifies the rendered system and its purpose so a labelled
  // demonstration is not confused with a fake customer journey—or vice versa.
  semanticFixtureAuthority: 'docs/evidence/site/B12-RECOVERY/phase-0/PROTOTYPE-FIXTURE-INVENTORY.md',
  residue: desktop.flatMap(({ route, residue }) => residue.map((match) => ({ route, ...match }))),
  linkGraph: {
    linkContracts: links,
    graphEdges,
    orphanRoutes,
    invalidInternalDestinations,
    noOnwardAction,
    conflictingLabelCandidates: labelDestinations,
    generatedContext,
  },
  failures: {
    non200Routes: desktop.filter(({ responseStatus }) => responseStatus !== 200).map(({ route, responseStatus }) => ({ route, responseStatus })),
    console: desktop.flatMap(({ route, consoleErrors }) => consoleErrors.map((error) => ({ route, error }))),
    page: desktop.flatMap(({ route, pageErrors }) => pageErrors.map((error) => ({ route, error }))),
    failedRequests: desktop.flatMap(({ route, failedRequests }) => failedRequests.map((failure) => ({ route, ...failure }))),
    overflowDesktop: desktop.filter(({ horizontalOverflow }) => horizontalOverflow).map(({ route }) => route),
    overflowMobile: mobile.filter(({ horizontalOverflow }) => horizontalOverflow).map(({ route }) => route),
  },
};

await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'forensic-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  base,
  routes: report.inventory.counts,
  residueRoutes: new Set(report.residue.map(({ route }) => route)).size,
  residueOccurrences: report.residue.reduce((sum, { count }) => sum + count, 0),
  links: links.length,
  edges: graphEdges.length,
  orphans: orphanRoutes.length,
  invalidInternalDestinations: invalidInternalDestinations.length,
  noOnwardAction: noOnwardAction.length,
  non200: report.failures.non200Routes.length,
  consoleErrors: report.failures.console.length,
  pageErrors: report.failures.page.length,
  requestFailures: report.failures.failedRequests.length,
  overflowDesktop: report.failures.overflowDesktop.length,
  overflowMobile: report.failures.overflowMobile.length,
  missingRouteStatus: missingRoute.responseStatus,
  report: path.join(out, 'forensic-audit.json'),
}, null, 2));
