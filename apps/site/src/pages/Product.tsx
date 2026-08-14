import { useEffect, useRef, useState } from 'react';

import { B12HeroApex } from '../components/B12HeroApex';
import {
  familyOf,
  lifecycleLabels,
  observedProduct,
  observedRoutes,
  type ExperiencePhase,
} from '../product';
import { Link } from '../router';
import '../styles/b12/product-catalog.css';
import { FAMILY_CODE, FAMILY_DISPLAY, FAMILY_ORDER, FAMILY_ROUTE } from './b12Slice4';

type RouterState = 'idle' | 'request' | 'qualify' | 'verified';

const routerStateLabel: Record<RouterState, string> = {
  idle: 'Ready · no execution',
  request: 'Request received · fixture',
  qualify: 'Qualification active · fixture',
  verified: 'Verified proof · fixture',
};

export function Product({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  const [routerState, setRouterState] = useState<RouterState>('idle');
  const timers = useRef<number[]>([]);
  useEffect(() => onPhase('qualified'), [onPhase]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const runFixture = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRouterState('verified');
      return;
    }
    setRouterState('request');
    timers.current.push(window.setTimeout(() => setRouterState('qualify'), 650));
    timers.current.push(window.setTimeout(() => setRouterState('verified'), 1550));
  };

  return (
    <div className="b12-slice4 b12-product" data-router-state={routerState}>
      <section className="s4-product-hero shell" aria-labelledby="s4-product-title">
        <div className="s4-product-copy">
          <p className="s4-eyebrow">Outcome infrastructure for AI agents</p>
          <h1 id="s4-product-title">One task in.<br />A verified outcome out.</h1>
          <p className="s4-lede">
            Clervo finds the right capability, qualifies route and policy, controls cost,
            executes within the current contract, and keeps result, evidence, and receipt boundaries legible.
          </p>
          <div className="s4-hero-actions">
            <Link className="b12-button b12-button-primary b12-liquid" to="/catalog">Explore the catalog</Link>
            <button className="b12-button b12-button-secondary b12-liquid" type="button" onClick={runFixture}>Run fixture</button>
          </div>
          <div className="s4-micro-truths" aria-label="Product constants">
            <span><i />One platform</span>
            <span><i />Six capability families</span>
            <span><i />Bounded cost and proof</span>
          </div>
        </div>

        <div className="s4-router-visual" aria-label="ClervoRouter transformation fixture">
          <div className="s4-router-field" />
          <div className="s4-apex-wrap"><B12HeroApex /></div>
          <div className="s4-router-label input"><strong>Bounded task</strong><span>request · fixture</span></div>
          <div className="s4-router-label output"><strong>Verified result</strong><span>evidence + receipt</span></div>
          <div className="s4-router-label search"><strong>Search</strong><span>discover</span></div>
          <div className="s4-router-label ai"><strong>AI</strong><span>transform</span></div>
          <div className="s4-router-label sandbox"><strong>Secure Sandbox</strong><span>execute</span></div>
          <div className="s4-router-label rpc"><strong>Multi-chain RPC</strong><span>read / simulate</span></div>
          <div className="s4-router-label prediction"><strong>Prediction</strong><span>resolve</span></div>
          <div className="s4-router-label crypto"><strong>Crypto Intelligence</strong><span>qualify</span></div>
          <div className="s4-router-status" aria-live="polite"><i />{routerStateLabel[routerState]}</div>
        </div>

        <aside className="s4-product-facts" aria-label="Outcome contract">
          <p className="s4-kicker">Outcome contract</p>
          <div><span>01</span><strong>Bounded request</strong><small>Task, policy, and budget enter together.</small></div>
          <div><span>02</span><strong>Qualified route</strong><small>Capability, lifecycle, provider boundary, and cost stay visible.</small></div>
          <div><span>03</span><strong>Verified proof</strong><small>Gold appears only after verification resolves.</small></div>
        </aside>
      </section>

      <section className="s4-section">
        <div className="shell">
          <div className="s4-section-head"><div><p className="s4-kicker">ClervoRouter</p><h2>The operating layer between intent and outcome.</h2></div><p className="s4-section-copy">The locked operating model stays constant while current public availability remains a separate observed fact.</p></div>
          <div className="s4-router-contract">
            <div className="s4-router-copy"><div><span className="s4-fixture-label">Product contract</span><h3>Find. Qualify. Execute. Prove.</h3><p>ClervoRouter routes bounded tasks across six permanent capability families and refuses paths that cannot satisfy the current contract.</p></div><Link className="s4-text-action" to="/catalog">See observed operations →</Link></div>
            <div className="s4-router-list">
              {[
                ['01', 'Read the task', 'Extract the intended outcome, constraints, risk, latency, and evidence requirement.', 'Intent'],
                ['02', 'Find a capability', 'Search by task rather than by vendor or integration trivia.', 'Catalog'],
                ['03', 'Qualify the route', 'Check current lifecycle, policy, price boundary, network/asset context, and proof requirements.', 'Qualify'],
                ['04', 'Execute within bounds', 'Run only an eligible operation; refuse or pause when the contract breaks.', 'Act'],
                ['05', 'Verify and prove', 'Keep normalized result, evidence, receipt, and reconciliation state separate.', 'Proof'],
              ].map(([n, title, copy, state]) => <div className="s4-router-step" key={n}><b>{n}</b><div><strong>{title}</strong><p>{copy}</p></div><span>{state}</span></div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="s4-section">
        <div className="shell">
          <div className="s4-section-head"><div><p className="s4-kicker">Six permanent families</p><h2>Six capability families. One operating contract.</h2></div><p className="s4-section-copy">Family identity is permanent. Availability and routes below come from the generated registry.</p></div>
          <div className="s4-family-ledger">
            {FAMILY_ORDER.map((familyId) => {
              const observed = observedProduct(familyId);
              const currentRoutes = observedRoutes.filter((route) => route.productIds.some((id) => familyOf(id) === familyId));
              return <Link className="s4-family-row" key={familyId} to={`/products/${FAMILY_ROUTE[familyId]}`}>
                <span className="s4-family-mark">{FAMILY_CODE[familyId]}</span>
                <h3>{FAMILY_DISPLAY[familyId]}</h3>
                <p>Permanent family identity · current operation and route state is registry-bound.</p>
                <span className="s4-family-meta"><strong>{lifecycleLabels[observed.lifecycleState]}</strong><span>{observed.observedPrice === null ? 'No public price' : 'Paid route'} · {currentRoutes.length} observed {currentRoutes.length === 1 ? 'route' : 'routes'}</span></span>
              </Link>;
            })}
          </div>
        </div>
      </section>

      <section className="s4-section">
        <div className="shell">
          <div className="s4-section-head"><div><p className="s4-kicker">Qualification and result contract</p><h2>What Clervo checks—and what comes back.</h2></div><p className="s4-section-copy">This structure is the operating contract. Current availability, prices, and settlement readiness remain registry/runtime facts rather than design claims.</p></div>
          <div className="s4-contract-grid">
            <article className="s4-contract-panel"><span className="s4-fixture-label">Before execution</span><h3>Qualification contract</h3><p>The agent should understand why a route is eligible before meaningful action occurs.</p><div className="s4-contract-items">{[['Capability and operation','Exact identity'],['Lifecycle','Current registry state'],['Policy and risk','Allowed / refused'],['Price and approval','Observed or not bound'],['Network and asset','Explicit when observed']].map(([a,b])=><div className="s4-contract-item" key={a}><span>{a}</span><strong>{b}</strong></div>)}</div></article>
            <article className="s4-contract-panel result"><span className="s4-fixture-label">After execution</span><h3>Result contract</h3><p>A useful result stays separate from evidence, payment state, and replay decisions.</p><div className="s4-contract-items">{[['Normalized result','Task-shaped output'],['Evidence','Verification material'],['Receipt','Only when produced'],['Reconciliation','Verified / refused / unresolved'],['Replay safety','Explicitly allowed or blocked']].map(([a,b])=><div className="s4-contract-item" key={a}><span>{a}</span><strong>{b}</strong></div>)}</div></article>
          </div>
        </div>
      </section>

      <section className="s4-section">
        <div className="shell">
          <div className="s4-section-head"><div><p className="s4-kicker">Interfaces</p><h2>One contract, multiple interface surfaces.</h2></div><p className="s4-section-copy">These cards preserve the locked information architecture. They do not assert unsupported client compatibility or package publication.</p></div>
          <div className="s4-interfaces">
            {['/skill.md','MCP','TypeScript','Python','HTTP / OpenAPI'].map((name) => <article className="s4-interface" key={name}><code>{name}</code><h3>Interface surface</h3><p>Availability is bound elsewhere and is not inferred from this design surface.</p></article>)}
          </div>
        </div>
      </section>

      <section className="s4-section">
        <div className="shell">
          <div className="s4-section-head"><div><p className="s4-kicker">Trust boundary</p><h2>Refusal and uncertainty remain visible.</h2></div><p className="s4-section-copy">Gold is earned only after verification. Refused and unresolved states never borrow proof color.</p></div>
          <div className="s4-boundary-grid">
            <article className="s4-boundary-card verified"><i /><h3>Verified</h3><p>The required checks resolved and proof material exists for that outcome.</p></article>
            <article className="s4-boundary-card refused"><i /><h3>Refused</h3><p>Policy, lifecycle, availability, cost, or approval prevents execution. No verified-gold state appears.</p></article>
            <article className="s4-boundary-card unresolved"><i /><h3>Unresolved</h3><p>The result or settlement cannot yet be proven. Retry remains blocked until reconciliation is safe.</p></article>
          </div>
        </div>
      </section>

      <section className="s4-section">
        <div className="shell s4-cta-panel"><div><p className="s4-kicker">Operate from current truth</p><h2>Find the exact operation Clervo currently exposes.</h2><p>Search current routes by task, family, availability, price, and capability.</p></div><Link className="b12-button b12-button-primary b12-liquid" to="/catalog">Explore the catalog</Link></div>
      </section>
    </div>
  );
}
