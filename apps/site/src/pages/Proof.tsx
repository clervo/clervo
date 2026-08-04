import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import { launchState, type ExperiencePhase } from '../product';
import { Link } from '../router';

export function Proof({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('receipt'), [onPhase]);
  const proof = launchState.paymentProof;
  const checks = [
    ['Useful result', proof.usefulResult],
    ['Settlement confirmed', proof.settlementConfirmed],
    ['Same receipt on replay', proof.replaySameReceipt],
    ['No second authorization', !proof.secondAuthorization],
    ['No second execution', !proof.secondExecution],
    ['No second charge', !proof.secondCharge],
  ] as const;
  return (
    <section className="proof-page">
      <header className="page-intro">
        <ModeBadge>Recorded evidence · owner-funded · private route</ModeBadge>
        <p className="eyebrow">Proof / request to receipt</p>
        <h1>The mechanism ran.<br />The market has not spoken.</h1>
        <p>
          A bounded private Search request settled on Base and returned a
          useful result. Replaying the exact request returned its existing
          receipt without another authorization, execution, or charge.
        </p>
      </header>

      <section className="proof-ledger">
        <div className="proof-ledger__amount">
          <span>EXACT OWNER-FUNDED CHARGE</span>
          <strong>{proof.amountDisplay}</strong>
          <small>{proof.productId} · {proof.network} · settlement confirmed</small>
        </div>
        <div className="proof-ledger__checks">
          {checks.map(([label, passed]) => (
            <div key={label}><span aria-hidden="true" /><b>{label}</b><strong>{passed ? 'PASS' : 'FAIL'}</strong></div>
          ))}
        </div>
      </section>

      <section className="claim-boundary">
        <article>
          <span>THIS PROVES</span>
          <h2>Private payment plumbing</h2>
          <ul>
            <li>One exact x402 requirement could be authorized and settled.</li>
            <li>One bounded operation returned a useful result.</li>
            <li>Durable reconciliation found one balanced receiver entry.</li>
            <li>Idempotent replay created no additional effect.</li>
          </ul>
        </article>
        <article>
          <span>THIS DOES NOT PROVE</span>
          <h2>Public or commercial traction</h2>
          <ul>
            <li>No customer bought this result.</li>
            <li>No revenue or market demand is claimed.</li>
            <li>No public endpoint currently accepts traffic or payment.</li>
            <li>No broad capability or quality comparison follows from it.</li>
          </ul>
        </article>
      </section>

      <section className="proof-index">
        <header><p className="eyebrow">Evidence index / current release</p><h2>One record. Five explicit classes.</h2></header>
        <div>
          <article><span>LIVE PUBLIC</span><strong>0</strong><p>No public endpoint or uptime series exists.</p></article>
          <article><span>PRIVATE QUALIFICATION</span><strong>1</strong><p>The bounded owner-funded settlement and replay record above.</p></article>
          <article><span>RECORDED DEMO</span><strong>1</strong><p>Proof Lab’s deterministic non-payable fixture.</p></article>
          <article><span>BENCHMARK</span><strong>0 public</strong><p>No comparative superiority result is approved.</p></article>
          <article><span>EXTERNAL CUSTOMER</span><strong>0</strong><p>No customer revenue or permissioned testimonial.</p></article>
        </div>
      </section>

      <section className="package-provenance">
        <header><p className="eyebrow">Package provenance</p><h2>Published clients, exact versions.</h2></header>
        <div>{launchState.distribution.packages.items.map((item) => <a key={item.name} href={item.url} target="_blank" rel="noreferrer"><span>{item.registry}</span><b>{item.name}</b><code>{item.version}</code></a>)}</div>
      </section>

      <div className="proof-actions">
        <a className="button button--quiet" href={proof.transactionUrl} rel="noreferrer" target="_blank">Inspect chain transaction</a>
        <a className="button button--quiet" href="https://github.com/clervo/clervo/blob/main/infra/production/gcp/x402-proof.v1.json" rel="noreferrer" target="_blank">Inspect proof record</a>
        <Link className="button button--primary" to="/proof-lab">Run safe fixture replay</Link>
        <Link className="button button--quiet" to="/docs/replay">Read replay semantics</Link>
      </div>
    </section>
  );
}
