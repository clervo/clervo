#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const value = (flag, fallback) => {
  const exact = process.argv.find((item) => item.startsWith(`${flag}=`));
  return exact === undefined ? fallback : exact.slice(flag.length + 1);
};

const auditPath = path.resolve(value('--audit', 'docs/evidence/site/B12-RECOVERY/phase-0/production/forensic-audit.json'));
const out = path.resolve(value('--out', 'docs/evidence/site/B12-RECOVERY/phase-0'));
const inflate = promisify(gunzip);
let auditSource = auditPath;
let auditBytes;
try {
  auditBytes = await readFile(auditPath);
} catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  auditSource = `${auditPath}.gz`;
  auditBytes = await inflate(await readFile(auditSource));
}
const audit = JSON.parse(auditBytes.toString('utf8'));
const recordedAuditSource = path.relative(process.cwd(), auditSource);
const canonicalRoutes = new Set(audit.inventory.routes.map(({ route }) => route));

function isMachineSurface(destination) {
  return destination.startsWith('/.well-known/')
    || destination.startsWith('/assets/')
    || destination.startsWith('/schemas/')
    || /\.(?:json|ya?ml|xml|txt|md|webmanifest|zip|svg|png|webp|woff2)$/u.test(destination);
}

function archetype(route) {
  if (route === '/') return 'HOME';
  if (route === '/product' || route === '/platform') return 'PRODUCT_OVERVIEW';
  if (route.startsWith('/products/')) return 'PRODUCT_FAMILY';
  if (route === '/catalog') return 'MODELS_CATALOG';
  if (route.startsWith('/models/')) return 'MODEL_DETAIL';
  if (route.startsWith('/operations/')) return 'OPERATION_DETAIL';
  if (route === '/docs' || route.startsWith('/docs/')) return 'DOCS_DEVELOPER_PORTAL';
  if (route === '/start') return 'START_CONNECT';
  if (route === '/build') return 'ACTIVATION_COMPATIBILITY';
  if (route === '/pricing') return 'PRICING';
  if (route === '/status') return 'STATUS';
  if (route === '/proof') return 'PROOF';
  if (route === '/proof-lab') return 'PROOF_LAB_DEMO';
  if (['/trust', '/security', '/legal'].includes(route)) return 'TRUST_SECURITY_LEGAL';
  if (['/research', '/benchmarks'].includes(route)) return 'COMPARE_RESEARCH_BENCHMARK';
  if (route === '/changelog') return 'CHANGELOG';
  return null;
}

function intent(label, destination, tag) {
  const normalized = label.toLowerCase();
  if (/set up|start|quickstart|install/u.test(normalized)) return 'Activate or install Clervo';
  if (/model|catalog/u.test(normalized)) return 'Discover or inspect a model';
  if (/docs|guide|reference|schema|openapi/u.test(normalized)) return 'Read developer documentation or a contract';
  if (/price|quote|cost|charge/u.test(normalized)) return 'Understand price or quote behavior';
  if (/status|state|incident/u.test(normalized)) return 'Inspect current operational state';
  if (/proof|receipt|evidence|replay|reconcile/u.test(normalized)) return 'Inspect verification, proof, or recovery behavior';
  if (/security|trust|privacy|legal|term/u.test(normalized)) return 'Evaluate a product boundary or public policy';
  if (destination?.startsWith('/operations/')) return 'Inspect an operation contract';
  if (destination?.startsWith('/models/')) return 'Inspect a model contract';
  if (destination?.startsWith('/products/')) return 'Understand a product family';
  if (tag === 'input' || tag === 'select') return `Provide or filter by ${label || 'the requested value'}`;
  return label === '' ? 'Unresolved: control has no rendered label' : `Use “${label}” in the current page context`;
}

function destinationState(contract) {
  if (contract.destination === null) return 'Local interaction on the source page';
  if (!contract.internal) return 'External destination; reachability not activated in Phase 0';
  if (canonicalRoutes.has(contract.destination)) return 'Canonical rendered route';
  if (isMachineSurface(contract.destination)) return 'Published machine-readable surface';
  return 'Noncanonical internal destination';
}

function testStatus(contract) {
  if (contract.destination === null) return 'INVENTORIED_NOT_ACTIVATED';
  if (!contract.internal) return 'EXTERNAL_NOT_ACTIVATED';
  if (isMachineSurface(contract.destination)) return 'PASS_MACHINE_SURFACE_DISCOVERED';
  return canonicalRoutes.has(contract.destination) ? 'PASS_ROUTE_REACHABLE' : 'FAIL_NONCANONICAL_DESTINATION';
}

const routeArchetypes = audit.inventory.routes.map((item) => ({
  route: item.route,
  routeKind: item.kind,
  archetype: archetype(item.route),
}));
const unassigned = routeArchetypes.filter(({ archetype: assignment }) => assignment === null);
if (unassigned.length > 0) throw new Error(`Unassigned routes: ${unassigned.map(({ route }) => route).join(', ')}`);

const desktopByRoute = new Map(audit.desktop.map((page) => [page.route, page]));
const mobileByRoute = new Map(audit.mobile.map((page) => [page.route, page]));
const controls = [];
for (const { route } of audit.inventory.routes) {
  const desktop = desktopByRoute.get(route)?.controls ?? [];
  const mobile = mobileByRoute.get(route)?.controls ?? [];
  for (const control of desktop) {
    const link = control.href === null ? null : audit.linkGraph.linkContracts.find((candidate) => (
      candidate.source === route
      && candidate.label === control.label
      && candidate.destination === (control.href.startsWith(audit.base) ? new URL(control.href).pathname.replace(/\/$/u, '') || '/' : control.href)
    ));
    const mobileMatch = mobile.find((candidate) => (
      candidate.tag === control.tag
      && candidate.label === control.label
      && candidate.href === control.href
    ));
    const contract = {
      sourcePage: route,
      sourceArchetype: archetype(route),
      controlType: control.tag,
      visibleLabel: control.label,
      userIntent: intent(control.label, link?.destination ?? null, control.tag),
      destination: link?.destination ?? null,
      scope: link === null ? 'LOCAL_INTERACTION' : link.internal ? 'INTERNAL' : 'EXTERNAL',
      expectedDestinationState: '',
      desktopBehavior: control.visible ? 'VISIBLE' : 'PRESENT_NOT_VISIBLE',
      mobileBehavior: mobileMatch?.visible ? 'VISIBLE' : mobileMatch === undefined ? 'NOT_PRESENT' : 'PRESENT_NOT_VISIBLE',
      analyticsIdentity: 'UNASSIGNED_PHASE_0',
      disabled: control.disabled,
      testStatus: '',
    };
    contract.expectedDestinationState = destinationState({ ...contract, internal: link?.internal ?? false });
    contract.testStatus = testStatus({ ...contract, internal: link?.internal ?? false });
    controls.push(contract);
  }
}

await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'route-archetypes.json'), `${JSON.stringify({
  schemaVersion: 'clervo.b12-recovery.route-archetypes.v1',
  source: recordedAuditSource,
  total: routeArchetypes.length,
  unassigned: unassigned.length,
  routes: routeArchetypes,
}, null, 2)}\n`);
await writeFile(path.join(out, 'interaction-contracts.json'), `${JSON.stringify({
  schemaVersion: 'clervo.b12-recovery.interaction-contracts.v1',
  source: recordedAuditSource,
  total: controls.length,
  note: 'Phase 0 inventory. Archetype review must approve semantics and activate material controls.',
  controls,
}, null, 2)}\n`);

console.log(JSON.stringify({
  routes: routeArchetypes.length,
  unassigned: unassigned.length,
  controls: controls.length,
  failingNavigation: controls.filter(({ testStatus }) => testStatus === 'FAIL_NONCANONICAL_DESTINATION').length,
}, null, 2));
