import { useEffect, useState } from 'react';

import { launchState, observedProduct, observedTruth } from '../product';
import { Link } from '../router';

const search = observedProduct('search');

function OutcomeMachine({ verified }: { verified: boolean }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setActive(true);
      return;
    }
    const frame = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className={`b12-machine${active ? ' is-active' : ''}${verified ? ' is-verified' : ''}`}>
      <svg
        className="b12-machine__scene"
        viewBox="-760 -450 1520 900"
        role="img"
        aria-labelledby="b12-machine-title b12-machine-desc"
      >
        <title id="b12-machine-title">Clervo outcome machine</title>
        <desc id="b12-machine-desc">
          A red request enters a dimensional Apex machine, qualified routes become visible in cyan,
          verification converges in white, and a verified proof exits in gold.
        </desc>
        <defs>
          <linearGradient id="b12-shell-left" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#899297" stopOpacity=".34" />
            <stop offset=".18" stopColor="#161a1d" />
            <stop offset=".72" stopColor="#050607" />
            <stop offset="1" stopColor="#2a3033" />
          </linearGradient>
          <linearGradient id="b12-shell-right" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#f4f7f5" stopOpacity=".76" />
            <stop offset=".09" stopColor="#303638" />
            <stop offset=".48" stopColor="#070809" />
            <stop offset="1" stopColor="#1b2023" />
          </linearGradient>
          <linearGradient id="b12-glass" x1="0" x2="1">
            <stop stopColor="#071315" stopOpacity=".9" />
            <stop offset=".55" stopColor="#061012" stopOpacity=".38" />
            <stop offset="1" stopColor="#d9ffff" stopOpacity=".1" />
          </linearGradient>
          <linearGradient id="b12-request-beam" x1="0" x2="1">
            <stop stopColor="var(--request)" stopOpacity="0" />
            <stop offset=".5" stopColor="var(--request)" stopOpacity=".58" />
            <stop offset="1" stopColor="var(--request)" />
          </linearGradient>
          <linearGradient id="b12-route" x1="0" x2="1">
            <stop stopColor="var(--qualify)" stopOpacity=".08" />
            <stop offset=".48" stopColor="var(--qualify)" stopOpacity=".72" />
            <stop offset="1" stopColor="#edffff" />
          </linearGradient>
          <linearGradient id="b12-proof-beam" x1="0" x2="1">
            <stop stopColor="#fff" />
            <stop offset=".25" stopColor="var(--verified)" />
            <stop offset="1" stopColor="var(--verified)" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="b12-core-glow">
            <stop stopColor="#fff" />
            <stop offset=".16" stopColor="#dfffff" />
            <stop offset=".42" stopColor="var(--qualify)" stopOpacity=".34" />
            <stop offset="1" stopColor="#061012" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="b12-request-impact">
            <stop stopColor="#fff" />
            <stop offset=".14" stopColor="var(--request)" />
            <stop offset=".54" stopColor="var(--request)" stopOpacity=".38" />
            <stop offset="1" stopColor="var(--request)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="b12-proof-impact">
            <stop stopColor="#fff" />
            <stop offset=".16" stopColor="var(--verified)" />
            <stop offset=".5" stopColor="var(--verified)" stopOpacity=".34" />
            <stop offset="1" stopColor="var(--verified)" stopOpacity="0" />
          </radialGradient>
          <filter id="b12-blur-10" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="10" /></filter>
          <filter id="b12-blur-24" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="24" /></filter>
          <filter id="b12-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <clipPath id="b12-inner-clip"><path d="M-220 275 0-320 220 275Z" /></clipPath>
        </defs>

        <g className="b12-machine__camera">
          <ellipse className="b12-machine__floor-haze" cx="10" cy="326" rx="330" ry="54" />
          <ellipse className="b12-machine__floor-shadow" cx="10" cy="319" rx="270" ry="22" />
          <path className="b12-machine__floor-line" d="M-510 320H510" />

          <g className="b12-machine__request">
            <path className="b12-machine__request-glow" d="M-730 8C-566 7-386 2-224 0" />
            <path className="b12-machine__request-line" d="M-730 8C-566 7-386 2-224 0" />
            <circle className="b12-machine__request-impact" cx="-224" cy="0" r="48" />
            <circle className="b12-machine__contact" cx="-224" cy="0" r="6" />
          </g>

          <g className="b12-machine__proof-beam">
            <path className="b12-machine__proof-glow" d="M224 0C390 1 558 16 735 40" />
            <path className="b12-machine__proof-line" d="M224 0C390 1 558 16 735 40" />
            <circle className="b12-machine__proof-impact" cx="224" cy="0" r="54" />
            <circle className="b12-machine__contact" cx="224" cy="0" r="6" />
          </g>

          <g className="b12-machine__body">
            <path className="b12-machine__shadow" d="M-244 294 0-350 244 294Z" />
            <g className="b12-machine__shell b12-machine__shell--left">
              <path d="M-238 288 0-345 0 288Z" fill="url(#b12-shell-left)" />
              <path className="b12-machine__face-line" d="M-238 288 0-345" />
              <path className="b12-machine__request-edge" d="M-220 255-14-300" />
            </g>
            <g className="b12-machine__shell b12-machine__shell--right">
              <path d="M0-345 238 288H0Z" fill="url(#b12-shell-right)" />
              <path className="b12-machine__face-line b12-machine__face-line--bright" d="M0-345 238 288" />
            </g>
            <path className="b12-machine__inner" d="M-204 262 0-284 204 262Z" fill="url(#b12-glass)" />
            <path className="b12-machine__spine" d="M-10-294H10L18 280H-18Z" />

            <g className="b12-machine__routes" clipPath="url(#b12-inner-clip)">
              <g className="b12-machine__lattice">
                <path d="M-200-185H200M-200-125H200M-200-65H200M-200-5H200M-200 55H200M-200 115H200M-200 175H200" />
                <path d="M-160-246V256M-100-246V256M-40-246V256M20-246V256M80-246V256M140-246V256" />
              </g>
              <g className="b12-machine__route-lines" fill="none">
                <path d="M-224 0C-148-124-64-116 0-76S118-20 224 0" />
                <path d="M-224 0C-150-80-70-74 0-46S120-9 224 0" />
                <path d="M-224 0C-149-39-72-29 0-17S121-2 224 0" />
                <path d="M-224 0C-148 18-69 14 0 10S118 5 224 0" />
                <path d="M-224 0C-146 64-68 57 0 38S117 13 224 0" />
                <path d="M-224 0C-144 112-58 104 2 69S121 23 224 0" />
              </g>
              <g className="b12-machine__route-nodes">
                <circle cx="-111" cy="-88" r="3" /><circle cx="-70" cy="-54" r="2.5" />
                <circle cx="-34" cy="-24" r="2.5" /><circle cx="-101" cy="45" r="2.5" />
                <circle cx="-47" cy="62" r="3" /><circle cx="53" cy="31" r="2.5" />
                <circle cx="112" cy="-16" r="3" /><circle cx="145" cy="16" r="2.5" />
              </g>
              <ellipse className="b12-machine__route-haze" cx="22" cy="0" rx="220" ry="164" />
            </g>

            <g className="b12-machine__verification">
              <ellipse className="b12-machine__verification-haze" cx="108" cy="0" rx="116" ry="82" />
              <path d="M42-84C101-64 133-45 160-2 133 43 102 64 42 84" />
              <path d="M69-63C115-48 137-31 158 0 137 31 115 48 69 63" />
              <path d="M103-41C134-31 150-18 162 0 150 18 134 31 103 41" />
            </g>
            <g className="b12-machine__ribs">
              <path d="M-198 232H192M-174 168H170M-150 104H147M-128 40H126M-104-24H103M-80-89H80" />
              <path d="M-181 258-6-273M181 258 6-273" />
            </g>
            <rect className="b12-machine__lock" x="-18" y="-49" width="36" height="98" rx="5" />
            <path className="b12-machine__seam" d="M0-334V280" />
          </g>

          <g className="b12-machine__receipt" transform="translate(326 48)">
            <path d="M0 0H126L150 24V182H0Z" />
            <path className="b12-machine__receipt-fold" d="M126 0V24H150" />
            <path className="b12-machine__receipt-white" d="M18 34H88M18 51H127M18 68H104" />
            <path className="b12-machine__receipt-cyan" d="M18 108H129M18 126H91" />
            <path className="b12-machine__receipt-gold" d="M18 153H67" />
            <circle className="b12-machine__receipt-seal" cx="122" cy="154" r="10" />
            <path className="b12-machine__receipt-check" d="m117 154 4 4 7-9" />
          </g>
        </g>
      </svg>
      <div className="b12-machine__label b12-machine__label--request"><span />Request</div>
      <div className="b12-machine__label b12-machine__label--qualify"><span />Qualify / execute</div>
      <div className="b12-machine__label b12-machine__label--proof"><span />Verified proof</div>
    </div>
  );
}

export function B12Hero() {
  const proof = launchState.paymentProof;
  const verified = proof.settlementConfirmed
    && proof.usefulResult
    && proof.replaySameReceipt
    && proof.secondCharge === false;
  const proofScope = proof.state === 'owner_funded_private_proof'
    ? 'Owner-funded proof'
    : proof.state.replaceAll('_', ' ');
  const observedDate = observedTruth.provenance.observedAt.slice(0, 10);

  return (
    <section className="b12-hero" aria-labelledby="b12-hero-title">
      <div className="b12-hero__atmosphere" aria-hidden="true" />
      <div className="b12-hero__grid">
        <div className="b12-hero__copy">
          <p className="b12-hero__eyebrow"><span />{launchState.identity.category}</p>
          <h1 id="b12-hero-title">Give your agent a task.<br /><span>Get a verified result.</span></h1>
          <p className="b12-hero__commercial">{launchState.identity.commercialPromise}</p>
          <p className="b12-hero__deck">
            One request enters. Clervo qualifies what can run, bounds the spend,
            executes the selected route, and returns the result with evidence,
            cost, and a replay-safe receipt.
          </p>
          <div className="b12-hero__actions">
            <Link className="button button--primary" to="/start">Set up Clervo</Link>
            <Link className="button button--secondary" to="/catalog">Open live catalog</Link>
          </div>
          <p className="b12-hero__free">
            {search.freeEntry === null
              ? 'Free entry is not observed serving right now.'
              : 'First call: no account · no API key · no wallet'}
          </p>
        </div>

        <div className="b12-hero__machine-wrap"><OutcomeMachine verified={verified} /></div>

        <aside className={`b12-proof${verified ? ' is-verified' : ''}`} aria-label="Observed payment proof">
          <div className="b12-proof__head">
            <p>{proofScope}</p>
            <span className="b12-proof__state"><i aria-hidden="true" />{verified ? 'verified' : 'unverified'}</span>
          </div>
          <div className="b12-proof__title"><span>Proof / receipt</span><strong>{proof.productId}</strong></div>
          <dl>
            <div><dt>Settlement</dt><dd>{proof.amountDisplay}<small>{proof.network}</small></dd></div>
            <div><dt>Result</dt><dd>{proof.usefulResult ? 'Useful result' : 'Not verified'}<small>evidence bound</small></dd></div>
            <div><dt>Replay</dt><dd>{proof.replaySameReceipt ? 'Same receipt' : 'Not verified'}<small>{proof.secondCharge ? 'charge observed' : 'no second charge'}</small></dd></div>
          </dl>
          <div className="b12-proof__foot"><span>Observed {observedDate}</span><Link to="/proof">Inspect proof →</Link></div>
          <p className="b12-proof__boundary">
            {proof.revenueEvidence ? 'Revenue evidence recorded.' : 'No customer revenue or demand claimed.'}
          </p>
        </aside>
      </div>
    </section>
  );
}
