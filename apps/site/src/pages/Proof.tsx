import { useEffect } from 'react';

import { observedTruth, publicStatus, type ExperiencePhase } from '../product';
import { Link } from '../router';

/*
 * /proof — public payment and replay verification.
 *
 * The page renders only objective fields projected into generated public
 * status: operation, amount, network, settlement, useful-result and replay
 * checks, plus the inspectable transaction link.
 */

const liveFamilies = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'live');
const paidProofFamilies = observedTruth.products.filter(({ proofLevel }) =>
  proofLevel === 'paid_outcome_verified' || proofLevel === 'externally_repeated');

const proof = publicStatus.paymentProof;

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
      ? 'No public family was observed serving.'
      : `${liveFamilies.map(({ label }) => label).join(', ')} were observed serving at the latest probe.`,
  },
  {
    value: proof.settlementConfirmed ? '1' : '0',
    label: 'Recorded settlement verification',
    detail: `${proof.productId} on ${proof.network}.`,
  },
  {
    value: String(paidProofFamilies.length),
    label: 'Families with paid-outcome proof',
    detail: paidProofFamilies.length === 0
      ? 'No current product family carries paid-outcome proof.'
      : `${paidProofFamilies.map(({ label }) => label).join(', ')} currently carry generated paid-outcome proof.`,
  },
  {
    value: proof.replaySameReceipt ? '1' : '0',
    label: 'Replay verification',
    detail: proof.replaySameReceipt
      ? 'The recorded replay returned the same receipt without another charge.'
      : 'Replay verification is not recorded.',
  },
  {
    value: '1',
    label: 'Inspectable settlement transaction',
    detail: 'The public payment proof links to its recorded chain transaction.',
  },
];

export function Proof({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('receipt'), [onPhase]);

  return (
    <>
      <section className="page-lead">
        <p className="eyebrow">Proof / request to receipt</p>
        <h1>The payment settled.<br />The replay stayed bounded.</h1>
        <p className="lede">
          {proof.productId} settled on {proof.network} and returned a useful
          result. Replaying the recorded request returned its existing receipt
          without another authorization, execution, or charge.
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
            * This historical Search amount was settled, replayed and
            * reconciled. Aggregate current proof is generated above from the
            * observed product registry rather than inferred from this record.
            */}
          <div className="proof-record__amount">
            <p className="eyebrow">Verified settled charge</p>
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
          <p className="eyebrow">Verification boundary</p>
          <h2 id="boundary-heading">What the payment record establishes.</h2>
        </div>
        <div className="proof-claims">
          <div className="panel">
            <div className="panel__body stack stack--tight">
              <p className="eyebrow">Verified</p>
              <h3>Settlement and replay</h3>
              <ul className="claim-list">
                {proves.map((claim) => <li key={claim}>{claim}</li>)}
              </ul>
            </div>
          </div>
          <div className="panel">
            <div className="panel__body stack stack--tight">
              <p className="eyebrow">Separate questions</p>
              <h3>Broader guarantees require their own evidence.</h3>
              <ul className="claim-list claim-list--refused">
                <li>No uptime or SLA follows from one settlement record.</li>
                <li>No comparative benchmark follows from one payment verification.</li>
                <li>No unrelated operation inherits this operation-specific transaction.</li>
                <li>Current availability remains defined by the generated status and catalog.</li>
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
            outcome, and one settled outcome does not imply broader guarantees.
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
            Verified at {publicStatus.packages.verifiedAt.slice(0, 10)} with
            registry provenance or trusted-publisher attestations. Package
            availability and API availability stay separate facts.
          </p>
        </div>
        <ul className="proof-packages">
          {publicStatus.packages.items.map((item) => (
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
            href={proof.transactionUrl}
            rel="noreferrer"
            target="_blank"
          >
            Inspect the settlement transaction
          </a>
          <Link className="button button--quiet" to="/docs/replay">Read replay semantics</Link>
        </div>
      </section>
    </>
  );
}
