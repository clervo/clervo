import { useEffect } from 'react';

import {
  discovery,
  formatUsdc,
  launchState,
  observedRoutes,
  observedTruth,
  proofLabels,
  type ExperiencePhase,
} from '../product';
import { Link } from '../router';

export type TrustTopic = 'pricing' | 'benchmarks' | 'security' | 'legal';

/*
 * The four claim-boundary pages: /pricing, /benchmarks, /security, /legal.
 *
 * Each one exists to state what is and is not being claimed. The pricing page
 * in particular has one job that is easy to get wrong: the recorded owner-funded
 * proof amount is not a public price, and the deployed system's quoted ceilings
 * are not a published price list either. Both facts are rendered, separately,
 * from the probe.
 */

// What the deployed system quotes, read from observed truth. This sentence used
// to assert that no public offer existed while the API returned real quotes.
const priced = observedTruth.products.filter(({ observedPrice }) => observedPrice !== null);
const pricedFamilies = priced.length === 0
  ? 'no public route currently quotes a price.'
  : `${priced.map(({ label }) => label).join(', ')} quote their own maximum charge over x402 on the deployed API.`;

// Families the deployed system does not serve, and why.
const withheld = observedTruth.products.filter(({ publiclyReachable }) => !publiclyReachable);

// Routes the probe saw quoting a ceiling, cheapest first. The full list belongs
// on /catalog; this page states the shape of it — how many routes quote, and
// what the cheapest and dearest ceilings actually are.
const quotedRoutes = observedRoutes
  .filter(({ observedPrice }) => observedPrice !== null)
  .sort((left, right) => (
    BigInt(left.observedPrice!.amountAtomic) < BigInt(right.observedPrice!.amountAtomic) ? -1 : 1
  ));

const cheapest = quotedRoutes.at(0) ?? null;
const dearest = quotedRoutes.at(-1) ?? null;

const freeRoute = observedTruth.products.find(({ freeEntry }) => freeEntry !== null) ?? null;

const topicCopy: Record<TrustTopic, { eyebrow: string; title: string; intro: string }> = {
  pricing: {
    eyebrow: 'Pricing / what is actually quoted',
    title: 'Proof amount is not public price.',
    intro: `Clervo publishes no price list. Every paid route quotes its own maximum charge at request time, and you see that exact number before anything runs: ${pricedFamilies}`,
  },
  benchmarks: {
    eyebrow: 'Benchmarks / claim boundary',
    title: 'No superiority claim without proof.',
    intro: 'Private qualification establishes engineering readiness, not public comparative performance. No “best”, “better”, or BlockRun-parity claim is approved.',
  },
  security: {
    eyebrow: 'Security / enforced invariants',
    title: 'Failure closes the boundary.',
    intro: 'The frozen private core preserves request identity, idempotency, secret protection, sandbox isolation, SSRF controls, cleanup, and hard cost ceilings. Unknown settlement state never retries.',
  },
  legal: {
    eyebrow: 'Legal / review boundary',
    title: 'Availability follows rights.',
    intro: 'Provider terms, resale rights, privacy, and customer-facing legal language remain release inputs. This page records current constraints; it is not legal advice.',
  },
};

const securityControls: Array<[string, string]> = [
  ['Payment idempotency', 'A request carries one identity. Replaying it returns the existing receipt rather than executing again, and an unknown settlement is quarantined rather than retried.'],
  ['Secret protection', 'Credentials and wallet material are excluded from chat, source, logs, commits, reports, and fixtures.'],
  ['Execution isolation', 'The sandbox boundary includes gVisor, denied network egress, resource limits, descendant cleanup, and image provenance.'],
  ['Request safety', 'SSRF, redirect, origin, schema, response, and cost ceilings all fail closed rather than degrading.'],
  ['Truth synchronization', 'Contracts, lifecycle, prices, discovery, clients, and claims all derive from the probed release candidate, never from page source.'],
];

export function Trust({ topic, onPhase }: { topic: TrustTopic; onPhase(phase: ExperiencePhase): void }) {
  const copy = topicCopy[topic];
  useEffect(() => onPhase(topic === 'pricing' ? 'approval' : 'verified'), [onPhase, topic]);

  return (
    <>
      <section className="page-lead">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="lede">{copy.intro}</p>
      </section>

      {topic === 'pricing' ? (
        <>
          <section className="band band--ruled trust-body" aria-labelledby="price-ledger">
            <div className="section-head">
              <p className="eyebrow">Observed ceilings</p>
              <h2 id="price-ledger">What the deployed system quoted.</h2>
              <p className="lede">
                {quotedRoutes.length === 0
                  ? 'No route was observed quoting a price at the last probe.'
                  : `${quotedRoutes.length} routes returned a maximum charge when probed at ${observedTruth.provenance.observedAt}. A maximum charge is a ceiling, not a fee: the settled amount can be lower, and never higher.`}
              </p>
            </div>

            {freeRoute?.freeEntry == null ? null : (
              <p className="trust-free">
                {freeRoute.label} has a free entry route that needs no account,
                no key and no wallet: <code>{freeRoute.freeEntry.route}</code>
              </p>
            )}

            <ul className="price-ledger">
              {cheapest === null || dearest === null ? null : (
                <>
                  <li className="panel">
                    <div className="panel__body stack stack--tight">
                      <p className="eyebrow">Lowest quoted ceiling</p>
                      <p className="price-ledger__amount">
                        {formatUsdc(cheapest.observedPrice!.amountAtomic, cheapest.observedPrice!.decimals)}
                      </p>
                      <p className="price-ledger__id">{cheapest.id}</p>
                    </div>
                  </li>
                  <li className="panel">
                    <div className="panel__body stack stack--tight">
                      <p className="eyebrow">Highest quoted ceiling</p>
                      <p className="price-ledger__amount">
                        {formatUsdc(dearest.observedPrice!.amountAtomic, dearest.observedPrice!.decimals)}
                      </p>
                      <p className="price-ledger__id">{dearest.id}</p>
                    </div>
                  </li>
                </>
              )}
              <li className="panel">
                <div className="panel__body stack stack--tight">
                  <p className="eyebrow">Routes quoting a ceiling</p>
                  <p className="price-ledger__amount">{quotedRoutes.length}</p>
                  <p className="quiet">
                    Each one is listed with its own ceiling on the catalog.
                  </p>
                </div>
              </li>
            </ul>
            <p className="quiet trust-note">
              Observed from {observedTruth.provenance.source} at{' '}
              {observedTruth.provenance.observedAt}. A price that changes on the
              deployed system changes here on the next probe, not on an edit.
            </p>
          </section>

          <section className="band band--ruled trust-body" aria-labelledby="proof-amount">
            <div className="section-head">
              <p className="eyebrow">Recorded proof</p>
              <h2 id="proof-amount">One settled payment, and what it is not.</h2>
            </div>
            {/*
              * Gold is spent here and nowhere else on this page. This amount is
              * a settled, replayed, reconciled outcome — the one thing on the
              * site that has actually been paid for and verified.
              */}
            <dl className="facts">
              <div>
                <dt>Settled amount</dt>
                <dd className="state state--verified">{launchState.paymentProof.amountDisplay}</dd>
              </div>
              <div>
                <dt>Operation</dt>
                <dd>{launchState.paymentProof.productId}</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>{launchState.paymentProof.network}</dd>
              </div>
              <div>
                <dt>Funded by</dt>
                <dd>the owner, to verify payment plumbing</dd>
              </div>
              <div>
                <dt>Customer revenue evidence</dt>
                <dd>{String(launchState.paymentProof.revenueEvidence)}</dd>
              </div>
            </dl>
            <p className="quiet trust-note">
              This amount is a recorded proof, not an offer. No customer bought
              this result and no revenue is claimed from it.
            </p>
            <div className="cluster trust-actions">
              <Link className="button button--primary" to="/catalog">See every route and its ceiling</Link>
              <Link className="button button--quiet" to="/proof">Inspect the proof record</Link>
            </div>
          </section>
        </>
      ) : null}

      {topic === 'benchmarks' ? (
        <section className="band band--ruled trust-body" aria-labelledby="benchmark-boundary">
          <div className="section-head">
            <p className="eyebrow">Claim boundary</p>
            <h2 id="benchmark-boundary">What the evidence supports.</h2>
          </div>
          <ul className="trust-panels">
            <li className="panel">
              <div className="panel__body stack stack--tight">
                <p className="eyebrow">Approved</p>
                <h3>Private core qualification</h3>
                <p className="quiet">Six families and their combined workflows passed a bounded internal contract and stabilization gate.</p>
              </div>
            </li>
            <li className="panel">
              <div className="panel__body stack stack--tight">
                <p className="eyebrow">Not approved</p>
                <h3>Public comparative claim</h3>
                <p className="quiet">No external corpus, alternative, environment, sample size, or published metric currently supports a superiority statement.</p>
              </div>
            </li>
            <li className="panel">
              <div className="panel__body stack stack--tight">
                <p className="eyebrow">Proven privately</p>
                <h3>Bounded settlement mechanics</h3>
                <p className="quiet">One owner-funded useful result settled and replayed safely. An external customer outcome remains unproven.</p>
              </div>
            </li>
          </ul>
        </section>
      ) : null}

      {topic === 'security' ? (
        <section className="band band--ruled trust-body" aria-labelledby="controls">
          <div className="section-head">
            <p className="eyebrow">Enforced invariants</p>
            <h2 id="controls">Five controls that fail closed.</h2>
          </div>
          <ol className="control-list">
            {securityControls.map(([name, detail], index) => (
              <li key={name} className="panel">
                <div className="panel__body stack stack--tight">
                  <p className="eyebrow">{String(index + 1).padStart(2, '0')}</p>
                  <h3>{name}</h3>
                  <p className="quiet">{detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="cluster trust-actions">
            <Link className="button button--secondary" to="/docs/failures">Read the failure guide</Link>
            <Link className="button button--quiet" to="/docs/replay">Read replay semantics</Link>
          </div>
        </section>
      ) : null}

      {topic === 'legal' ? (
        <section className="band band--ruled trust-body" aria-labelledby="legal-boundary">
          <div className="section-head">
            <p className="eyebrow">Current constraints</p>
            <h2 id="legal-boundary">Rights decide what is routed.</h2>
          </div>
          <ul className="trust-panels">
            <li className="panel">
              <div className="panel__body stack stack--tight">
                <p className="eyebrow">Current</p>
                <h3>Terms-aware routing</h3>
                <p className="quiet">
                  {withheld.length === 0
                    ? 'Every product family is publicly routed; no family is withheld on rights grounds.'
                    : `${withheld.map(({ label }) => label).join(', ')} remain withheld from public routing: ${[...new Set(withheld.map(({ reason }) => (reason ?? 'unstated').replaceAll('_', ' ')))].join('; ')}.`}
                </p>
              </div>
            </li>
            <li className="panel">
              <div className="panel__body stack stack--tight">
                <p className="eyebrow">Pending</p>
                <h3>Customer documents</h3>
                <p className="quiet">Production privacy, terms, support, retention, and pricing language require reviewed release text before launch.</p>
              </div>
            </li>
            <li className="panel">
              <div className="panel__body stack stack--tight">
                <p className="eyebrow">Boundary</p>
                <h3>Protected infrastructure</h3>
                <p className="quiet">The existing model gateway is protected infrastructure. It is not changed, exposed, or represented as this public candidate.</p>
              </div>
            </li>
          </ul>
        </section>
      ) : null}

      <section className="band trust-body">
        <div className="section-head">
          <p className="eyebrow">Contract</p>
          <h2>The frozen surface behind every claim.</h2>
        </div>
        <dl className="facts">
          <div>
            <dt>Release candidate</dt>
            <dd>{discovery.distribution.releaseCandidateId}</dd>
          </div>
          <div>
            <dt>Interface hash</dt>
            <dd>{discovery.distribution.interfaceHash}</dd>
          </div>
          <div>
            <dt>Strongest observed proof</dt>
            <dd>
              {proofLabels[
                observedTruth.products.reduce(
                  (best, { proofLevel }) => (proofLevel === 'none' ? best : proofLevel),
                  'none' as (typeof observedTruth.products)[number]['proofLevel'],
                )
              ]}
            </dd>
          </div>
        </dl>
        <nav className="cluster trust-links" aria-label="Claim boundary pages">
          {(['pricing', 'benchmarks', 'security', 'legal'] as TrustTopic[]).map((value) => (
            <Link
              key={value}
              className={value === topic ? 'is-active' : ''}
              aria-current={value === topic ? 'page' : undefined}
              to={`/${value}`}
            >
              {value}
            </Link>
          ))}
        </nav>
      </section>
    </>
  );
}
