#!/usr/bin/env node
// Qualification expiry guard.
//
// All 21 route qualifications were written with the same expiry date, so they
// were all due to lapse on the same day, and nothing in the repository would
// have said so until a customer-facing route had already gone stale. This guard
// exists so that date can never arrive unannounced again.
//
// It reads the catalog, reports the soonest expiry, and exits non-zero when any
// qualification is already expired or falls inside the warning window. Run it in
// CI and on a schedule: a red build ahead of the date is the whole point.
//
// It reads and reports only. It never rewrites a qualification, never extends an
// expiry, and never contacts a supplier — extending an expiry without
// re-observing the route is exactly the false claim this is meant to prevent.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const catalogPath = path.join(root, 'packages', 'catalog', 'ai-model-catalog.v1.json');

// Qualifications are written with a 7-day TTL, so this window has to sit well
// inside that: a wider window than the TTL would leave the guard failing the
// moment a route was requalified, and a check that can never pass is a check
// that gets ignored. Two days still gives a full day's notice while letting a
// fresh requalification go green.
const WARN_WITHIN_DAYS = 2;
const MS_PER_DAY = 86_400_000;

const warnWithinDays = (() => {
  const flag = process.argv.find((argument) => argument.startsWith('--warn-days='));
  if (flag === undefined) return WARN_WITHIN_DAYS;
  const value = Number(flag.slice('--warn-days='.length));
  if (!Number.isSafeInteger(value) || value < 0 || value > 365) {
    process.stderr.write('check-qualification-expiry: --warn-days must be an integer between 0 and 365\n');
    process.exit(2);
  }
  return value;
})();

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const now = Date.now();

const rows = catalog.routes.map((route) => {
  const expiresAt = route.qualification?.expiresAt ?? null;
  const parsed = expiresAt === null ? Number.NaN : Date.parse(expiresAt);
  return {
    routeId: route.routeId,
    status: route.qualification?.status ?? 'absent',
    expiresAt,
    daysRemaining: Number.isNaN(parsed) ? null : Math.floor((parsed - now) / MS_PER_DAY),
  };
});

// A qualification with no readable expiry is treated as a failure rather than
// skipped, because an unreadable date is not evidence that a route is current.
const unreadable = rows.filter(({ daysRemaining }) => daysRemaining === null);
const expired = rows.filter(({ daysRemaining }) => daysRemaining !== null && daysRemaining < 0);
const expiring = rows.filter(({ daysRemaining }) => daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= warnWithinDays);
const soonest = rows
  .filter(({ daysRemaining }) => daysRemaining !== null)
  .sort((left, right) => left.daysRemaining - right.daysRemaining)[0] ?? null;

process.stdout.write(`${JSON.stringify({
  checkedAt: new Date(now).toISOString(),
  routes: rows.length,
  warnWithinDays,
  soonestExpiry: soonest === null ? null : { routeId: soonest.routeId, expiresAt: soonest.expiresAt, daysRemaining: soonest.daysRemaining },
  expired: expired.map(({ routeId, expiresAt }) => ({ routeId, expiresAt })),
  expiringSoon: expiring.map(({ routeId, expiresAt, daysRemaining }) => ({ routeId, expiresAt, daysRemaining })),
  unreadableExpiry: unreadable.map(({ routeId }) => routeId),
}, null, 2)}\n`);

if (expired.length > 0 || unreadable.length > 0) {
  process.stderr.write(`check-qualification-expiry: FAIL ${expired.length} expired, ${unreadable.length} unreadable; requalify with scripts/ai/requalify-ai-routes.mjs\n`);
  process.exit(1);
}

if (expiring.length > 0) {
  process.stderr.write(`check-qualification-expiry: FAIL ${expiring.length} qualification(s) expire within ${warnWithinDays} days (soonest ${soonest?.expiresAt}); requalify before they lapse\n`);
  process.exit(1);
}

process.stderr.write(`check-qualification-expiry: PASS ${rows.length} routes, soonest expiry ${soonest?.expiresAt} in ${soonest?.daysRemaining} days\n`);
