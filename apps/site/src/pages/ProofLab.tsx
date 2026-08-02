import { useEffect, useMemo, useRef, useState } from 'react';

import { ModeBadge } from '../components/Navigation';
import type { ActivationState } from '../experience';
import type { ExperiencePhase } from '../product';
import { Link, useRouter } from '../router';

type ProductId = 'search.web' | 'search.answer';
type LabState =
  | 'request'
  | 'route'
  | 'quote'
  | 'approval'
  | 'evidence'
  | 'verified'
  | 'result'
  | 'receipt'
  | 'recovery';

interface FixtureReceipt {
  receiptId: string;
  operationId: string;
  productId: ProductId;
  requestHash: string;
  price: {
    asset: 'mock:usdc';
    amountAtomic: '6000' | '12000';
    decimals: 6;
    payable: false;
  };
  evidence: string[];
}

interface SavedLab {
  query: string;
  productId: ProductId;
  state: LabState;
  receipt: FixtureReceipt | null;
}

const storageKey = 'clervo.proof-lab.v1';
const initialLab: SavedLab = {
  query: 'How does Clervo fail closed before public distribution?',
  productId: 'search.web',
  state: 'request',
  receipt: null,
};

const labStates: LabState[] = [
  'request',
  'route',
  'quote',
  'approval',
  'evidence',
  'verified',
  'result',
  'receipt',
  'recovery',
];

function readLab(search: string): SavedLab {
  if (typeof localStorage === 'undefined') return initialLab;
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<SavedLab> | null;
    const params = new URLSearchParams(search);
    const stored: SavedLab = value === null ? initialLab : {
      query: typeof value.query === 'string' ? value.query : initialLab.query,
      productId: value.productId === 'search.answer' ? 'search.answer' : 'search.web',
      state: labStates.includes(value.state as LabState)
        ? value.state as LabState
        : 'request',
      receipt: value.receipt ?? null,
    };
    const productId = params.get('operation');
    const requestedState = params.get('step');
    const state = labStates.includes(requestedState as LabState)
      ? requestedState as LabState
      : stored.state;
    return {
      ...stored,
      productId: productId === 'search.answer' ? 'search.answer' : productId === 'search.web' ? 'search.web' : stored.productId,
      state: ['verified', 'result', 'receipt', 'recovery'].includes(state) && stored.receipt === null
        ? 'evidence'
        : state,
    };
  } catch {
    return initialLab;
  }
}

async function hash(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function phaseForState(state: LabState): ExperiencePhase {
  if (state === 'request') return 'risk';
  if (state === 'route' || state === 'quote') return 'qualified';
  if (state === 'approval') return 'approval';
  if (state === 'evidence' || state === 'verified' || state === 'result') return 'verified';
  return 'receipt';
}

export function ProofLab({
  activation,
  updateActivation,
  onPhase,
}: {
  activation: ActivationState;
  updateActivation(next: Partial<ActivationState>): void;
  onPhase(phase: ExperiencePhase): void;
}) {
  const { location, navigate } = useRouter();
  const [lab, setLab] = useState<SavedLab>(initialLab);
  const restored = useRef(false);
  const [error, setError] = useState('');
  const [shared, setShared] = useState(false);
  const phase = phaseForState(lab.state);
  const price = lab.productId === 'search.web' ? '6000' : '12000';
  const step = labStates.indexOf(lab.state) + 1;
  const canContinue = lab.query.trim().length > 0 && lab.query.trim().length <= 2_000;

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    setLab(readLab(location.search));
  }, [location.search]);

  useEffect(() => {
    if (!restored.current) return;
    onPhase(phase);
    localStorage.setItem(storageKey, JSON.stringify(lab));
    const params = new URLSearchParams({
      scenario: 'contract-inspection',
      operation: lab.productId,
      step: lab.state,
    });
    const search = `?${params.toString()}`;
    if (location.search !== search) navigate(`/proof-lab${search}`, { replace: true });
  }, [lab, location.search, navigate, onPhase, phase]);

  const result = useMemo(() => ({
    title: 'Distribution contract inspection',
    summary: 'The frozen projection exposes two Search operation identities while public calling, real payment, and production deployment remain false.',
    observations: [
      'All six product cores are privately qualified and compatibility-frozen.',
      'Search is preview; five public product lifecycles remain unavailable.',
      'The challenge amount is a non-payable mock fixture, not a customer charge.',
    ],
  }), []);

  const update = (next: Partial<SavedLab>) => setLab((current) => ({ ...current, ...next }));
  const advance = async () => {
    setError('');
    if (!canContinue) {
      setError('Enter a request between 1 and 2,000 characters.');
      return;
    }
    if (lab.state === 'request') update({ state: 'route', receipt: null });
    else if (lab.state === 'route') update({ state: 'quote' });
    else if (lab.state === 'quote') update({ state: 'approval' });
    else if (lab.state === 'approval') update({ state: 'evidence' });
    else if (lab.state === 'evidence') {
      const requestHash = await hash(JSON.stringify({
        operation: lab.productId,
        query: lab.query.trim(),
        fixture: true,
      }));
      const receipt: FixtureReceipt = {
        receiptId: `fixture_${requestHash.slice(7, 23)}`,
        operationId: 'fixture_contract_inspection',
        productId: lab.productId,
        requestHash,
        price: {
          asset: 'mock:usdc',
          amountAtomic: price,
          decimals: 6,
          payable: false,
        },
        evidence: ['/openapi.json', '/catalog.json', '/.well-known/clervo.json'],
      };
      update({ state: 'verified', receipt });
      updateActivation({ proofCompleted: true });
    } else if (lab.state === 'verified') update({ state: 'result' });
    else if (lab.state === 'result') update({ state: 'receipt' });
    else if (lab.state === 'receipt') update({ state: 'recovery' });
  };
  const reset = () => {
    setLab(initialLab);
    setError('');
  };
  const share = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setShared(true);
    window.setTimeout(() => setShared(false), 1_800);
  };

  return (
    <section className="proof-lab">
      <header className="page-intro">
        <ModeBadge>Deterministic local fixture · no network · no payment</ModeBadge>
        <p className="eyebrow">Proof Lab / request to receipt</p>
        <h1>Inspect the mechanism.<br />Not a staged success.</h1>
        <p>
          This fixture exercises Clervo’s lifecycle and contract disclosures.
          It never contacts a provider, signs a wallet message, or settles funds.
        </p>
      </header>

      <div
        className="lab-progress"
        role="region"
        tabIndex={0}
        aria-label={`Proof Lab step ${step} of ${labStates.length}`}
      >
        {['Request', 'Route', 'Quote', 'Approve', 'Evidence', 'Verify', 'Result', 'Receipt', 'Recover'].map((label, index) => (
          <div key={label} className={index + 1 === step ? 'is-active' : index + 1 < step ? 'is-complete' : ''}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <b>{label}</b>
          </div>
        ))}
      </div>

      <div className="lab-console">
        <div className="lab-input">
          <div className="field-label">
            <label htmlFor="proof-query">Bounded request</label>
            <span>{lab.query.length}/2000</span>
          </div>
          <textarea
            id="proof-query"
            value={lab.query}
            disabled={lab.state !== 'request'}
            onChange={(event) => update({ query: event.target.value })}
          />
          <fieldset disabled={lab.state !== 'request'}>
            <legend>Operation</legend>
            <label className={lab.productId === 'search.web' ? 'is-selected' : ''}>
              <input
                type="radio"
                name="product"
                value="search.web"
                checked={lab.productId === 'search.web'}
                onChange={() => update({ productId: 'search.web' })}
              />
              <span>search.web</span>
              <small>ranked evidence</small>
            </label>
            <label className={lab.productId === 'search.answer' ? 'is-selected' : ''}>
              <input
                type="radio"
                name="product"
                value="search.answer"
                checked={lab.productId === 'search.answer'}
                onChange={() => update({ productId: 'search.answer' })}
              />
              <span>search.answer</span>
              <small>cited synthesis</small>
            </label>
          </fieldset>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>

        <div className={`lab-evidence lab-evidence--${phase}`} aria-live="polite">
          <header>
            <span>{lab.state.toUpperCase()}</span>
            <b>{lab.productId}</b>
          </header>
          {lab.state === 'request' ? (
            <div className="lab-empty">
              <p>Nothing executes until the request is bounded.</p>
              <dl>
                <div><dt>Network calls</dt><dd>0</dd></div>
                <div><dt>Wallet actions</dt><dd>0</dd></div>
              </dl>
            </div>
          ) : null}
          {lab.state === 'route' ? (
            <div className="route-decision">
              <p className="eyebrow">Deterministic fixture route</p>
              <h2>{lab.productId}</h2>
              <dl>
                <div><dt>Contract match</dt><dd>exact</dd></div>
                <div><dt>External provider</dt><dd>none</dd></div>
                <div><dt>Network route</dt><dd>disabled</dd></div>
                <div><dt>Fixture route</dt><dd>qualified</dd></div>
              </dl>
            </div>
          ) : null}
          {lab.state === 'quote' || lab.state === 'approval' ? (
            <div className="quote">
              <p>Non-payable fixture maximum</p>
              <strong>{price}<small> atomic mock:usdc</small></strong>
              <dl>
                <div><dt>Payable</dt><dd>false</dd></div>
                <div><dt>Settlement</dt><dd>disabled</dd></div>
                <div><dt>Mode</dt><dd>fixture</dd></div>
              </dl>
            </div>
          ) : null}
          {lab.state === 'evidence' ? (
            <div className="evidence-inspection">
              <p className="eyebrow">Evidence before result</p>
              <h2>Three local contract projections.</h2>
              <ul>
                <li><a href="/openapi.json">OpenAPI operation and wire schema</a></li>
                <li><a href="/catalog.json">Catalog lifecycle and fixture price</a></li>
                <li><a href="/.well-known/clervo.json">Release candidate and distribution state</a></li>
              </ul>
              <p>No generated media or provider output is used as evidence.</p>
            </div>
          ) : null}
          {['verified', 'result', 'receipt', 'recovery'].includes(lab.state) ? (
            <div className="fixture-result">
              <p className="eyebrow">{lab.state === 'verified' ? 'Contract verification passed' : 'Verified fixture result'}</p>
              <h2>{result.title}</h2>
              <p>{result.summary}</p>
              <ul>{result.observations.map((item) => <li key={item}>{item}</li>)}</ul>
              {(lab.state === 'receipt' || lab.state === 'recovery') && lab.receipt ? (
                <details
                  className="receipt"
                  open={lab.state === 'recovery'}
                  onToggle={(event) => {
                    if (event.currentTarget.open) updateActivation({ receiptInspected: true });
                  }}
                >
                  <summary>Inspect fixture receipt</summary>
                  <dl>
                    <div><dt>Receipt</dt><dd>{lab.receipt.receiptId}</dd></div>
                    <div><dt>Product</dt><dd>{lab.receipt.productId}</dd></div>
                    <div><dt>Request hash</dt><dd>{lab.receipt.requestHash}</dd></div>
                    <div><dt>Charge</dt><dd>{lab.receipt.price.amountAtomic} atomic {lab.receipt.price.asset}</dd></div>
                    <div><dt>Payable</dt><dd>false</dd></div>
                  </dl>
                  <div className="receipt-links">
                    {lab.receipt.evidence.map((path) => <a key={path} href={path}>{path}</a>)}
                  </div>
                </details>
              ) : null}
              {lab.state === 'recovery' && lab.receipt ? (
                <div className="recovery-proof">
                  <b>SAFE REPLAY / FIXTURE</b>
                  <dl>
                    <div><dt>Request hash</dt><dd>{lab.receipt.requestHash}</dd></div>
                    <div><dt>Receipt returned</dt><dd>{lab.receipt.receiptId}</dd></div>
                    <div><dt>Additional execution</dt><dd>false</dd></div>
                    <div><dt>Additional charge</dt><dd>0</dd></div>
                  </dl>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="lab-actions">
        {lab.state !== 'recovery' ? (
          <button className="button button--primary" type="button" onClick={advance}>
            {lab.state === 'request' ? 'Qualify fixture route'
              : lab.state === 'route' ? 'Generate fixture quote'
                : lab.state === 'quote' ? 'Review approval boundary'
                  : lab.state === 'approval' ? 'Approve fixture only'
                    : lab.state === 'evidence' ? 'Verify contract evidence'
                      : lab.state === 'verified' ? 'Reveal fixture result'
                        : lab.state === 'result' ? 'Seal fixture receipt'
                          : 'Test safe fixture replay'}
          </button>
        ) : (
          <Link className="button button--primary" to="/docs">Continue to integration</Link>
        )}
        <button className="button button--quiet" type="button" onClick={reset}>Reset fixture</button>
        <button className="button button--quiet" type="button" onClick={share}>{shared ? 'State URL copied' : 'Share state'}</button>
        <span className="activation-note">
          {activation.receiptInspected ? 'Receipt inspection recorded locally.' : 'Open the receipt to complete this proof.'}
        </span>
      </div>
    </section>
  );
}
