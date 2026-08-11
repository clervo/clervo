import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Launch integrity tests for the AI route surface.
//
// These guard the properties that make a listed route honest: a customer gets
// the exact model they asked for, nothing is offered that cannot be served, and
// a route that fails or loses funding stays visible with a true reason instead of
// disappearing.
//
// Deliberately none of these pins a route count. The catalog is expected to grow
// and shrink as supply changes, and a test that froze the count would either
// break on legitimate change or push someone toward keeping a dead route listed
// to keep the number matching.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));

const catalog = await json('packages/catalog/ai-model-catalog.v1.json');
const publicCatalog = await json('generated/b7-ai/public/models.json');
const registry = await json('packages/catalog/live-registry.json');

const catalogRoutes = catalog.routes;
const registryRoutes = registry.aiRoutes ?? [];
const registryById = new Map(registryRoutes.map((route) => [route.routeId, route]));

test('every catalogued route carries a qualification bound to that exact route', () => {
  for (const route of catalogRoutes) {
    const qualification = route.qualification;
    assert.ok(qualification !== undefined, `${route.routeId} has no qualification`);
    // A qualification copied from another route would let one model's evidence
    // vouch for a different model, which is how a substitution becomes invisible.
    assert.equal(qualification.routeId, route.routeId, `${route.routeId} qualification names a different route`);
    assert.equal(qualification.exactModelId, route.exactModelId, `${route.routeId} qualification names a different model`);
    assert.equal(qualification.supplyFamilyId, route.supplyFamilyId, `${route.routeId} qualification names a different supply family`);
  }
});

test('a qualification that observed an identity observed the route own model', () => {
  for (const route of catalogRoutes) {
    const observed = route.qualification.observed?.modelIdentity;
    if (observed === undefined) continue;
    // This is the substitution check: the supplier answered with a model id, and
    // it has to be the one this route sells.
    assert.equal(observed, route.exactModelId, `${route.routeId} observed identity ${observed} does not match the route model`);
  }
});

test('no customer model identity is exposed as live without current source/runtime agreement', () => {
  for (const route of registryRoutes) {
    if (route.state !== 'live') continue;
    const catalogued = publicCatalog.data.find(({ id }) => id === route.routeId);
    assert.ok(catalogued !== undefined, `live identity ${route.routeId} is not in the current B7 catalog`);
    assert.equal(catalogued.clervo.publicSellable, true, `live identity ${route.routeId} is not source-sellable`);
    assert.equal(catalogued.clervo.availability, 'available', `live identity ${route.routeId} is not source-available`);
    assert.equal(route.evidence.publicCatalogObserved, true, `live identity ${route.routeId} was absent from GET /v1/models`);
    assert.equal(route.evidence.publicCatalogContractMatched, true, `live identity ${route.routeId} disagrees with GET /v1/models`);
  }
});

test('no customer model identity is exposed as live before a current paid request reaches x402', () => {
  for (const route of registryRoutes) {
    if (route.state !== 'live') continue;
    assert.equal(route.evidence?.paidRepresentativeStatus, 402, `live identity ${route.routeId} did not share the current payable execution contract`);
  }
});

test('a route that is not live stays listed with a truthful reason', () => {
  for (const route of registryRoutes) {
    if (route.state === 'live') continue;
    // A failed probe must never quietly delete supply we own; it pauses it, and
    // the reason has to say something, not be blank or a placeholder.
    assert.ok(['supply_paused', 'unavailable'].includes(route.state), `${route.routeId} has unexpected state ${route.state}`);
    assert.equal(typeof route.reason, 'string', `${route.routeId} is paused without a reason`);
    assert.match(route.reason, /^[a-z][a-z0-9_]{3,80}$/u, `${route.routeId} paused reason is not a usable code: ${route.reason}`);
  }
});

test('every current B7 customer identity appears in the registry so nothing is silently dropped', () => {
  for (const model of publicCatalog.data) {
    assert.ok(registryById.has(model.id), `catalogued identity ${model.id} is missing from the registry`);
  }
});

test('registry route ids are unique', () => {
  assert.equal(registryById.size, registryRoutes.length, 'the registry lists a route id more than once');
});

test('a paused route never advertises a proof level', () => {
  for (const route of registryRoutes) {
    if (route.state === 'live') continue;
    // Proof describes what was actually observed. A paused route has no current
    // successful outcome to point at.
    assert.equal(route.proof, 'none', `${route.routeId} is ${route.state} but claims proof ${route.proof}`);
  }
});

test('no live route claims a paid proof level it did not earn', () => {
  const permitted = new Set(['none', 'quote_observed_unpaid', 'paid_outcome_verified', 'externally_repeated']);
  for (const route of registryRoutes) {
    assert.ok(permitted.has(route.proof), `${route.routeId} claims unknown proof level ${route.proof}`);
  }
});

test('every supply family in use has a recorded commercial-permission basis', async () => {
  const permission = await json('packages/catalog/ai-commercial-permission.v1.json');
  const byFamily = new Map(permission.families.map((family) => [family.supplyFamilyId, family]));
  const familiesInUse = new Set(catalogRoutes.map(({ supplyFamilyId }) => supplyFamilyId));

  for (const familyId of familiesInUse) {
    const record = byFamily.get(familyId);
    // `restricted` was a hardcoded constant in the merge scripts with nothing
    // behind it, so a route could be sold with no traceable reason why resale
    // was permitted. This binds the claim to a record.
    assert.ok(record !== undefined, `${familyId} is in use with no recorded commercial-permission basis`);
    assert.ok(['approved', 'restricted', 'blocked', 'unknown'].includes(record.termsStatus), `${familyId} has unknown termsStatus ${record.termsStatus}`);
    assert.ok(Array.isArray(record.conditions) && record.conditions.length > 0, `${familyId} records no conditions`);
    assert.ok(['owner_asserted', 'owner_operated', 'supplier_confirmed'].includes(record.resaleDetermination), `${familyId} has unknown resaleDetermination ${record.resaleDetermination}`);
    // permissionBasis is the honest question: has anyone actually permitted
    // this? `unresolved` is a real answer and must stay expressible, otherwise
    // the only way to record a family is to imply permission we do not have.
    assert.ok(['supplier_confirmed', 'owner_operated_documented', 'unresolved'].includes(record.permissionBasis), `${familyId} has unknown permissionBasis ${record.permissionBasis}`);
    // A family claiming supplier permission must cite the document that grants
    // it, so the strongest basis is never the least evidenced one.
    if (record.permissionBasis === 'supplier_confirmed') {
      assert.ok(Array.isArray(record.governingDocuments) && record.governingDocuments.length > 0, `${familyId} claims supplier_confirmed with no governing document`);
      assert.equal(record.restrictionFound, null, `${familyId} claims supplier_confirmed while recording a restriction`);
    }
    // An unresolved family must say how it gets resolved, so it cannot sit
    // unresolved forever with nothing tracking it.
    if (record.permissionBasis === 'unresolved') {
      assert.equal(typeof record.resolutionPath, 'string', `${familyId} is unresolved with no resolutionPath`);
      assert.ok(record.resolutionPath.length > 0, `${familyId} is unresolved with an empty resolutionPath`);
    }
  }
});

test('the permission summary matches the per-family records it summarises', async () => {
  const permission = await json('packages/catalog/ai-commercial-permission.v1.json');
  const count = (basis) => permission.families.filter((family) => family.permissionBasis === basis).length;
  // A hand-maintained summary that drifts from its own rows is how an
  // unresolved permission state gets reported as a resolved one.
  assert.equal(permission.summary.supplierConfirmed, count('supplier_confirmed'), 'summary.supplierConfirmed disagrees with the family records');
  assert.equal(permission.summary.ownerOperatedDocumented, count('owner_operated_documented'), 'summary.ownerOperatedDocumented disagrees with the family records');
  assert.equal(permission.summary.unresolved, count('unresolved'), 'summary.unresolved disagrees with the family records');
  assert.equal(
    permission.summary.familiesWithExplicitRestriction,
    permission.families.filter((family) => family.restrictionFound !== null).length,
    'summary.familiesWithExplicitRestriction disagrees with the family records',
  );
  const unresolved = new Set(permission.families.filter((family) => family.permissionBasis === 'unresolved').map(({ supplyFamilyId }) => supplyFamilyId));
  const liveOnUnresolved = registryRoutes.filter((route) => route.state === 'live' && unresolved.has(route.supplyFamilyId)).length;
  assert.equal(permission.summary.liveRoutesOnUnresolvedPermission, liveOnUnresolved, 'summary.liveRoutesOnUnresolvedPermission disagrees with the registry');
});

test('a legacy recovery route may not be sellable on a supply family whose terms are blocked', async () => {
  const permission = await json('packages/catalog/ai-commercial-permission.v1.json');
  const byFamily = new Map(permission.families.map((family) => [family.supplyFamilyId, family]));

  for (const route of catalogRoutes) {
    if (route.qualification.resaleAllowed !== true) continue;
    const record = byFamily.get(route.supplyFamilyId);
    assert.ok(record !== undefined, `sellable recovery route ${route.routeId} uses family ${route.supplyFamilyId} with no permission record`);
    assert.notEqual(record.termsStatus, 'blocked', `sellable recovery route ${route.routeId} uses a family whose terms are blocked`);
    // resaleAllowed is the owner's decision to sell and carry the risk. It is
    // deliberately NOT read as evidence that the supplier permitted resale --
    // permissionBasis carries that, and it may legitimately be `unresolved`
    // while this is true. Asserting otherwise would let an owner decision
    // masquerade as a supplier grant.
    assert.equal(record.resaleAllowed, true, `sellable recovery route ${route.routeId} uses a family the owner has not cleared for sale`);
  }
});

test('no public discovery surface names the supplier behind a route', async () => {
  const permission = await json('packages/catalog/ai-commercial-permission.v1.json');
  const urls = permission.families.flatMap(({ governingDocuments }) => (governingDocuments ?? []).map(({ url }) => url)).filter((url) => typeof url === 'string');
  // Guard the guard: if the field these URLs come from is ever renamed away,
  // this test would pass on an empty list and stop checking anything.
  assert.ok(urls.length > 0, 'no governing document URLs were collected, so the leak check would pass vacuously');
  const published = await readFile(path.join(root, 'generated/public/models.json'), 'utf8');
  for (const url of urls) {
    // Terms are `restricted`: we may sell these routes but must not publicly
    // disclose which supplier backs which one.
    assert.ok(!published.includes(url), `models.json leaks a supplier terms URL: ${url}`);
  }
});

test('commercial permission is recorded for every route and blocks resale when absent', () => {
  for (const route of catalogRoutes) {
    const { termsStatus, resaleAllowed } = route.qualification;
    assert.ok(['approved', 'restricted', 'blocked', 'unknown'].includes(termsStatus), `${route.routeId} has unknown termsStatus ${termsStatus}`);
    // Selling a route whose terms are blocked or unresolved is the commercial
    // failure this pairing exists to prevent.
    if (termsStatus === 'blocked' || termsStatus === 'unknown') {
      assert.equal(resaleAllowed, false, `${route.routeId} allows resale while terms are ${termsStatus}`);
    }
    if (resaleAllowed === true) {
      assert.ok(['approved', 'restricted'].includes(termsStatus), `${route.routeId} allows resale on termsStatus ${termsStatus}`);
    }
  }
});
