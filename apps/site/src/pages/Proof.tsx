import { useEffect } from 'react';

import { launchState, observedTruth, publicApiCallable, type ExperiencePhase } from '../product';
import { Link } from '../router';

/*
 * /proof — the one thing on this site that was actually paid for.
 *
 * A bounded owner-funded Search request settled on Base, returned a useful
 * result, and replayed to the same receipt with no second authorization,
 * execution or charge. That is a real, verified, externally inspectable fact,
 * and it is the only place gold is spent on this page.
 *
 * It is also a smaller claim than it looks, which is why the boundary is given
 * equal weight rather than a footnote: the owner funded it, no customer bought
 * it, and no revenue or demand follows from it.
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
    label: 'Settled paid outcome',
    detail: 'The owner-funded settlement and replay record above.',
  },
  {
    value: '1',
    label: 'Recorded demonstration',
    detail: 'Proof Lab runs a deterministic, non-payable fixture.',
  },
  {
    value: '0',
    label: 'Public benchmarks',
    detail: 'No comparative superiority result is approved.',
  },
  {
    value: '0',
    label: 'External customers',
    detail: 'No customer revenue and no permissioned testimonial.',
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
            * Gold appears here and nowhere else on this page. This amount was
            * settled, replayed and reconciled — it is the single fact on the
            * site that has actually been paid for and verified.
            */}
          <div className="proof-record__amount">
            <p className="eyebrow">Exact owner-funded charge</p>
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
          <h2 id="boundary-heading">What one settled payment does and does not establish.</h2>
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
              <h3>Commercial traction</h3>
              <ul className="claim-list claim-list--refused">
                <li>No customer bought this result.</li>
                <li>No revenue and no market demand is claimed.</li>
                <li>
                  {publicApiCallable
                    ? 'A public route answering a request is not the same as a customer paying for one.'
                    : 'No public endpoint currently accepts traffic or payment.'}
                </li>
                <li>No broad capability or quality comparison follows from it.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="band band--ruled proof-body" aria-labelledby="evidence-heading">
        <div className="section-head">
          <p className="eyebrow">Evidence index</p>
          <h2 id="evidence-heading">Five classes, counted separately.</h2>
          <p className="lede">
            Each class is counted on its own so a strong number in one cannot be
            read as evidence for another. A served route is not a settled
            outcome, and a settled outcome is not a customer.
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
