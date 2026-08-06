import discoverySource from '../../../../generated/public/.well-known/clervo.json';

import type { Discovery } from './discovery-types';

export type PublicSiteSourceId = 'repository-fixture' | 'api';
export interface PublicSiteSource {
  readonly id: PublicSiteSourceId;
  snapshot(): Readonly<Discovery>;
  refresh(options?: { signal?: AbortSignal }): Promise<Readonly<Discovery>>;
}

const repositorySnapshot = discoverySource as unknown as Discovery;
function assertRepositoryFixtureTruth(snapshot: Discovery): void {
  if (snapshot.distribution.callable || snapshot.distribution.publicAvailable) throw new Error('repository_fixture_cannot_claim_public_distribution');
  if (snapshot.products.some((product) => product.publicAvailable || product.payment.payable)) throw new Error('repository_fixture_cannot_claim_public_payment_or_operations');
}
assertRepositoryFixtureTruth(repositorySnapshot);

export const repositoryFixtureSource: PublicSiteSource = {
  id: 'repository-fixture',
  snapshot: () => repositorySnapshot,
  async refresh(options = {}) {
    if (options.signal?.aborted) throw new Error('public_site_source_refresh_aborted');
    return repositorySnapshot;
  },
};
export function selectPublicSiteSource(id: PublicSiteSourceId): PublicSiteSource {
  if (id === 'repository-fixture') return repositoryFixtureSource;
  throw new Error('public_api_source_not_implemented');
}
// This is the single binding Codex replaces after the canonical public API source exists.
export const publicSiteSource = selectPublicSiteSource('repository-fixture');
export const publicSiteSnapshot = publicSiteSource.snapshot();
