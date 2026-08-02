import { readFile } from 'node:fs/promises';

const evidencePath = new URL('../../docs/evidence/supply-foundation/public-rpc-mesh-qualification.v1.json', import.meta.url);
const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
const passedPerChain = new Map();
for (const observation of evidence.observations) {
  if (observation.passed) passedPerChain.set(observation.chain, (passedPerChain.get(observation.chain) ?? 0) + 1);
}

const publicRoutes = evidence.observations.map((observation) => ({
  serviceId: 'supply.public_rpc_mesh',
  productId: `rpc.${observation.chain}`,
  publicAssetId: `${observation.chain}-mainnet-read-${observation.routeIndex}`,
  network: `${observation.chain}-mainnet`,
  billingUnit: 'request',
  customerPriceMicrousd: 1,
  supplierPriceMicrousd: null,
  supplierPriceBasis: 'public_endpoint_unknown',
  monthlyAllowance: null,
  qualityGrade: observation.passed ? observation.latencyMs <= 2_000 ? 'good' : 'poor' : 'rejected',
  technicalQualificationStatus: observation.passed ? 'passed' : 'failed',
  listingStatus: observation.passed ? 'qualified_not_integrated' : 'blocked',
  termsStatus: 'unreviewed',
  broadcastStatus: 'read_only_route',
  fallbackStatus: (passedPerChain.get(observation.chain) ?? 0) >= 2 ? 'independent_fallback_ready' : 'independent_fallback_missing',
}));

const catalog = {
  schemaVersion: 'clervo.rpc-supply-pricing.v1',
  priceVersion: 'rpc-supply-2026-08-02.2',
  effectiveAt: evidence.evaluatedAt,
  currency: 'USD',
  policy: { customerFreeByDefault: false, automaticPaidTopUpAllowed: false, providerNamesPublic: false, transactionBroadcastRequiresSeparateQualification: true },
  routes: [
    {
      serviceId: 'supply.helius_rpc', productId: 'rpc.solana', publicAssetId: 'solana-mainnet-read', network: 'solana-mainnet', billingUnit: 'request',
      customerPriceMicrousd: 1, supplierPriceMicrousd: 0, supplierPriceBasis: 'included_monthly_allocation', monthlyAllowance: 1_000_000, qualityGrade: 'good', technicalQualificationStatus: 'passed',
      listingStatus: 'priced_terms_blocked', termsStatus: 'blocked', broadcastStatus: 'read_only_route', fallbackStatus: 'independent_fallback_missing',
    },
    ...publicRoutes,
  ],
};

process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
