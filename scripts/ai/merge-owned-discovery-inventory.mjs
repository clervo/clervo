#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inventory = JSON.parse(await readFile(path.join(root, 'packages/catalog/external-supply-inventory.v1.json'), 'utf8'));
const discovery = JSON.parse(await readFile(path.join(root, 'docs/evidence/supply-foundation/owned-ai-source-discovery.v1.json'), 'utf8'));
const observed = new Map(discovery.sources.map((source) => [source.serviceId, source]));

const services = inventory.services.map((service) => {
  const source = observed.get(service.serviceId);
  if (source === undefined) return service;
  const working = source.status === 'working';
  const origin = service.serviceId === 'supply.siliconflow'
    ? ['https://api.siliconflow.com', ...service.endpointOrigins]
    : service.endpointOrigins;
  return {
    ...service,
    endpointOrigins: [...new Set(origin)],
    connectionStatus: working ? 'observed_working' : 'observed_failed',
    ...(working ? { knownModelNames: source.modelIds } : {}),
    notes: [
      ...service.notes,
      working
        ? `Authenticated model discovery returned ${source.modelCount} exact assets on 2026-08-02; pricing, terms, and representative live qualification remain independent gates.`
        : `Authenticated model discovery returned HTTP ${source.httpStatus ?? 'transport failure'} on 2026-08-02; the failure is preserved and no working claim is made.`,
    ],
  };
});

process.stdout.write(`${JSON.stringify({
  ...inventory,
  inventoryVersion: '2026-08-02.10',
  observedAt: discovery.checkedAt,
  services,
}, null, 2)}\n`);
