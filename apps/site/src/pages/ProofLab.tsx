import { useEffect, useMemo, useRef, useState } from 'react';

import type { ActivationState } from '../experience';
import { lifecycleLabels, observedTruth, type ExperiencePhase } from '../product';
import { Link, useRouter } from '../router';

type ProductId = 'search.web';

/*
 * /proof-lab — a deterministic local fixture.
 *
 * Nothing here is a claim about the deployed system. No request leaves the
 * browser, no provider is contacted, no wallet message is signed, and the
 * amount shown is a fixture constant rather than a quote the probe observed.
 *
 * That is why the page uses none of the site's proof vocabulary: no gold, and
 * no lifecycle pills on fixture values. The only observed facts it renders are
 * quoted from the probe explicitly and labelled as coming from the deployed
 * system, so a reader can never mistake a fixture step for evidence.
 */

const liveFamilies = observedTruth.products.filter(({ lifecycleState }) => lifecycleState === 'live');

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
    amountAtomic: '6000';
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
      productId: 'search.web',
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
      productId: productId === 'search.web' ? 'search.web' : stored.productId,
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
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(false);
  const phase = phaseForState(lab.state);
  const price = '6000';
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
    summary: `This lab runs a deterministic fixture: no request leaves the browser and nothing is charged. The deployed system separately reports ${liveFamilies.length} of ${observedTruth.products.length} product families as ${lifecycleLabels.live}.`,
    observations: [
      'The fixture uses the same operation identities published in discovery.',
      ...observedTruth.products.map((product) => (
        `${product.label}: ${lifecycleLabels[product.lifecycleState]}, ${product.observedPrice === null ? 'no public price' : 'paid route'}.`
      )),
      'The challenge amount below is a fixture, not a customer charge; the deployed route quotes its own price.',
      'Paid routes return their own binding challenge; this browser fixture never authorizes one.',
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
      // The only genuinely asynchronous step in the fixture: hashing the
      // request through SubtleCrypto. The control reports that it is working
      // rather than looking unresponsive, and it cannot be pressed twice into
      // two receipts for one request.
      setBusy(true);
      try {
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
      } finally {
        setBusy(false);
      }
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

  const stepLabels = ['Request', 'Route', 'Quote', 'Approve', 'Evidence', 'Verify', 'Result', 'Receipt', 'Recover'];

  return (
    <>
      <section className="page-lead">
        <p className="eyebrow">Proof Lab / request to receipt</p>
        <h1>Explore the request lifecycle.</h1>
        <p className="lede">
          A deterministic local fixture. No request leaves this browser, no
          provider is contacted, no wallet message is signed and nothing is
          charged. Paid routes independently return a binding challenge.
        </p>
        <div className="cluster page-lead__actions">
          <Link className="button button--secondary" to="/proof">Read payment and replay behavior</Link>
          <Link className="button button--quiet" to="/docs">Open the quickstart</Link>
        </div>
      </section>

      <section className="band band--tight lab-body" aria-labelledby="lab-heading">
        <h2 id="lab-heading" className="sr-only">Fixture console</h2>
        {/* The rail scrolls horizontally on a narrow screen, so it has to be a
          * real stop in the tab order: a keyboard-only reader cannot otherwise
          * reach the steps past the right edge. */}
        <ol
          className="lab-progress"
          tabIndex={0}
          aria-label={`Proof Lab step ${step} of ${labStates.length}`}
        >
          {stepLabels.map((label, index) => (
            <li
              key={label}
              className={index + 1 === step ? 'is-active' : index + 1 < step ? 'is-complete' : undefined}
              aria-current={index + 1 === step ? 'step' : undefined}
            >
              <span className="data">{String(index + 1).padStart(2, '0')}</span>
              <b>{label}</b>
            </li>
          ))}
        </ol>

        <div className="lab-console">
          <div className="lab-input stack">
            <div className="field-label">
              <label htmlFor="proof-query">Bounded request</label>
              <span className="data">{lab.query.length}/2000</span>
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
            </fieldset>
            {error === '' ? null : <p className="form-error" role="alert">{error}</p>}
          </div>

          <div className="lab-evidence panel" aria-live="polite">
            <div className="panel__body stack">
              <div className="lab-evidence__head">
                <span className="state state--unresolved">{lab.state}</span>
                <b className="data">{lab.productId}</b>
              </div>

              {lab.state === 'request' ? (
                <div className="stack stack--tight">
                  <h3>Nothing executes until the request is bounded.</h3>
                  <dl className="facts">
                    <div><dt>Network calls</dt><dd>0</dd></div>
                    <div><dt>Wallet actions</dt><dd>0</dd></div>
                  </dl>
                </div>
              ) : null}

              {lab.state === 'route' ? (
                <div className="stack stack--tight">
                  <h3>Deterministic fixture route</h3>
                  <dl className="facts">
                    <div><dt>Contract match</dt><dd>exact</dd></div>
                    <div><dt>External provider</dt><dd>none</dd></div>
                    <div><dt>Network route</dt><dd>disabled</dd></div>
                    <div><dt>Fixture route</dt><dd>qualified</dd></div>
                  </dl>
                </div>
              ) : null}

              {lab.state === 'quote' || lab.state === 'approval' ? (
                <div className="stack stack--tight">
                  <h3>Non-payable fixture maximum</h3>
                  {/* The fixture amount is deliberately not gold and not a
                    * state pill: nothing here was quoted by the deployed
                    * system and nothing was settled. */}
                  <p className="lab-quote data">{price}<span> atomic mock:usdc</span></p>
                  <dl className="facts">
                    <div><dt>Payable</dt><dd>false</dd></div>
                    <div><dt>Settlement</dt><dd>disabled</dd></div>
                    <div><dt>Mode</dt><dd>fixture</dd></div>
                  </dl>
                </div>
              ) : null}

              {lab.state === 'evidence' ? (
                <div className="stack stack--tight">
                  <h3>Evidence before result</h3>
                  <ul className="lab-links">
                    <li><a className="text-link" href="/openapi.json">OpenAPI operation and wire schema</a></li>
                    <li><a className="text-link" href="/catalog.json">Catalog lifecycle and fixture price</a></li>
                    <li><a className="text-link" href="/.well-known/clervo.json">Public operations and distribution state</a></li>
                  </ul>
                  <p className="quiet">No generated media or provider output is used as evidence.</p>
                </div>
              ) : null}

              {['verified', 'result', 'receipt', 'recovery'].includes(lab.state) ? (
                <div className="stack stack--tight">
                  <p className="eyebrow">
                    {lab.state === 'verified' ? 'Contract verification passed' : 'Fixture result'}
                  </p>
                  <h3>{result.title}</h3>
                  <p className="quiet">{result.summary}</p>
                  <ul className="claim-list">
                    {result.observations.map((item) => <li key={item}>{item}</li>)}
                  </ul>

                  {(lab.state === 'receipt' || lab.state === 'recovery') && lab.receipt !== null ? (
                    <details
                      className="lab-receipt"
                      open={lab.state === 'recovery'}
                      onToggle={(event) => {
                        if (event.currentTarget.open) updateActivation({ receiptInspected: true });
                      }}
                    >
                      <summary>Inspect fixture receipt</summary>
                      <dl className="facts">
                        <div><dt>Receipt</dt><dd>{lab.receipt.receiptId}</dd></div>
                        <div><dt>Product</dt><dd>{lab.receipt.productId}</dd></div>
                        <div><dt>Request hash</dt><dd>{lab.receipt.requestHash}</dd></div>
                        <div><dt>Charge</dt><dd>{lab.receipt.price.amountAtomic} atomic {lab.receipt.price.asset}</dd></div>
                        <div><dt>Payable</dt><dd>false</dd></div>
                      </dl>
                      <p className="cluster lab-links">
                        {lab.receipt.evidence.map((path) => (
                          <a key={path} className="text-link" href={path}>{path}</a>
                        ))}
                      </p>
                    </details>
                  ) : null}

                  {lab.state === 'recovery' && lab.receipt !== null ? (
                    <div className="stack stack--tight">
                      <p className="eyebrow">Safe replay / fixture</p>
                      <dl className="facts">
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
        </div>

        <div className="cluster lab-actions">
          {lab.state === 'recovery' ? (
            <Link className="button button--primary" to="/docs">Continue to integration</Link>
          ) : (
            <button
              className="button button--primary"
              type="button"
              onClick={advance}
              data-loading={busy ? 'true' : undefined}
              disabled={busy}
            >
              {busy ? 'Sealing fixture receipt' : lab.state === 'request' ? 'Qualify fixture route'
                : lab.state === 'route' ? 'Generate fixture quote'
                  : lab.state === 'quote' ? 'Review approval boundary'
                    : lab.state === 'approval' ? 'Approve fixture only'
                      : lab.state === 'evidence' ? 'Verify contract evidence'
                        : lab.state === 'verified' ? 'Reveal fixture result'
                          : lab.state === 'result' ? 'Seal fixture receipt'
                            : 'Test safe fixture replay'}
            </button>
          )}
          <button className="button button--quiet" type="button" onClick={reset}>Reset fixture</button>
          <button className="button button--quiet" type="button" onClick={share}>
            {shared ? 'State URL copied' : 'Share state'}
          </button>
          {/* The spinner is decoration; this is the part a screen reader hears. */}
          <p className="sr-only" role="status">{busy ? 'Sealing the fixture receipt.' : ''}</p>
          <span className="quiet lab-note">
            {activation.receiptInspected
              ? 'Receipt inspection recorded in this browser only.'
              : 'Open the receipt to complete this proof.'}
          </span>
        </div>
      </section>
    </>
  );
}
