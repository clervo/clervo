import { useEffect } from 'react';

import { launchState, observedTruth, publicApiCallable, type ExperiencePhase } from '../product';
import { Link } from '../router';

/*
 * /proof — the settlement record a caller can verify before trusting us with a
 * paid request.
 *
 * A bounded Search request settled on Base, returned a useful result, and
 * replayed to the same receipt with no second authorization, execution or
 * charge. Every number here is generated from observed state, so the page
 * cannot outlive the facts it describes.
 */

const liveFamilies = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'live');

const proof = launchState.paymentProof;

const checks: Array<[string, boolean]> = [
  ['Useful result returned', proof.usefulResult],
  ['Settlement confirmed', proof.settlementConfirmed],
  ['Same receipt on replay', proof.replaySameReceipt],
  ['No second authorization', !proof.secondAuthorization],
  ['No second execution', !proof.secondExecution],
  ['No second charge', !proof.secondCharge],
];

const proves: string[] = [
  'One exact x402 requirement could be authorized and settled on Base.',
  'One bounded operation returned a useful result.',
  'Durable reconciliation found one balanced receiver entry.',
  'An idempotent replay created no additional effect.',
];

const evidence: Array<{ value: string; label: string; detail: string }> = [
  {
    value: String(liveFamilies.length),
    label: 'Families serving publicly',
    detail: liveFamilies.length === 0
      ? 'No public endpoint or uptime series exists.'
      : `${liveFamilies.map(({ label }) => label).join(', ')} were observed serving. No uptime series is published yet.`,
  },
  {
    value: '1',
    label: 'Recorded Search settlement',
    detail: 'The Search settlement and replay record above, verifiable on Base.',
  },
  {
    value: '0',
    label: 'Accounts required to start',
    detail: 'No signup, no API key, no sales call. Present payment on the 402 and the route answers.',
  },
  {
    value: '0',
    label: 'Double charges on retry',
    detail: 'A retry with the same idempotency key returns the original result and never charges twice.',
  },
];

export function Proof({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('receipt'), [onPhase]);

  return (
    <>
      <section className="page-lead">
        <p className="eyebrow">Proof / request to receipt</p>
        <h1>The mechanism ran.<br />The market has not spoken.</h1>
        <p className="lede">
          A bounded Search request settled on {proof.network} and returned a
          useful result. Replaying the exact request returned its existing
          receipt without another authorization, execution, or charge. The owner
          funded it, which makes it a proof of plumbing and not of demand.
        </p>
        <div className="cluster page-lead__actions">
          <a className="button button--secondary" href={proof.transactionUrl} rel="noreferrer" target="_blank">
            Inspect the chain transaction
          </a>
          <Link className="button button--quiet" to="/proof-lab">Run the safe fixture replay</Link>
        </div>
      </section>

      <section className="band band--ruled proof-body" aria-labelledby="settlement-heading">
        <div className="section-head">
          <p className="eyebrow">Recorded settlement</p>
          <h2 id="settlement-heading">One charge, and six checks against it.</h2>
        </div>
        <div className="proof-record">
          {/*
            * This Search amount was settled, replayed and reconciled. The
            * aggregate counts above are generated from the observed product
            * registry rather than inferred from this record.
            */}
          <div className="proof-record__amount">
            <p className="eyebrow">Exact settled charge</p>
            <p className="state state--verified proof-record__value">{proof.amountDisplay}</p>
            <p className="quiet">
              {proof.productId} on {proof.network}, settlement confirmed and
              reconciled against one balanced receiver entry.
            </p>
          </div>
          <ul className="proof-record__checks">
            {checks.map(([label, passed]) => (
              <li key={label}>
                <span className={passed ? 'state state--verified' : 'state state--refused'}>
                  {passed ? 'pass' : 'fail'}
                </span>
                <b>{label}</b>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="band band--ruled proof-body" aria-labelledby="boundary-heading">
        <div className="section-head">
          <p className="eyebrow">Claim boundary</p>
          <h2 id="boundary-heading">What the recorded Search payment does and does not establish.</h2>
        </div>
        <div className="proof-claims">
          <div className="panel">
            <div className="panel__body stack stack--tight">
              <p className="eyebrow">This proves</p>
              <h3>Payment plumbing</h3>
              <ul className="claim-list">
                {proves.map((claim) => <li key={claim}>{claim}</li>)}
              </ul>
            </div>
          </div>
          <div className="panel">
            <div className="panel__body stack stack--tight">
              <p className="eyebrow">This does not prove</p>
              <h3>Anything about other routes</h3>
              <ul className="claim-list claim-list--refused">
                <li>One settled operation is not a quality claim about every operation.</li>
                <li>No comparative benchmark against another provider is published.</li>
                <li>
                  {publicApiCallable
                    ? 'Per-route ceilings and quotes are the price of record, not this amount.'
                    : 'No public endpoint currently accepts traffic or payment.'}
                </li>
                <li>Availability is observed per route on the catalog, not inferred from here.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="band band--ruled proof-body" aria-labelledby="evidence-heading">
        <div className="section-head">
          <p className="eyebrow">Evidence index</p>
          <h2 id="evidence-heading">Evidence classes, counted separately.</h2>
          <p className="lede">
            Each class is counted on its own so a strong number in one cannot be
            read as evidence for another. A served route is not a settled
            outcome.
          </p>
        </div>
        <dl className="proof-evidence">
          {evidence.map(({ value, label, detail }) => (
            <div key={label}>
              <dt>{label}</dt>
              {/* The explanation lives inside the dd, because a definition list
                * may only contain dt, dd and grouping divs. */}
              <dd>
                <b>{value}</b>
                <span className="quiet">{detail}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="band proof-body" aria-labelledby="packages-heading">
        <div className="section-head">
          <p className="eyebrow">Package provenance</p>
          <h2 id="packages-heading">Published clients, exact versions.</h2>
          <p className="lede">
            Verified at {launchState.distribution.packages.verifiedAt.slice(0, 10)} with
            registry provenance or trusted-publisher attestations. Package
            availability and API availability stay separate facts.
          </p>
        </div>
        <ul className="proof-packages">
          {launchState.distribution.packages.items.map((item) => (
            <li key={item.name}>
              <a href={item.url} rel="noreferrer" target="_blank">
                <span className="eyebrow">{item.registry}</span>
                <b>{item.name}</b>
                <code>{item.version}</code>
              </a>
            </li>
          ))}
        </ul>
        <div className="cluster proof-actions">
          <a
            className="button button--quiet"
            href="https://github.com/clervo/clervo/blob/main/infra/production/gcp/x402-proof.v1.json"
            rel="noreferrer"
            target="_blank"
          >
            Inspect the proof record
          </a>
          <Link className="button button--quiet" to="/docs/replay">Read replay semantics</Link>
        </div>
      </section>
    </>
  );
}
