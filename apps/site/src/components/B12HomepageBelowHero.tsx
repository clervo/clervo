import { useEffect, useMemo, useRef, useState } from 'react';

import { discovery, observedProduct } from '../product';
import { Link } from '../router';

type ProofState = 'rest' | 'request' | 'qualify' | 'execute' | 'verify' | 'prove';
type ControlState = 'quote' | 'approved' | 'receipt' | 'refused' | 'replay';
type FixtureFamily = 'all' | 'search' | 'ai' | 'sandbox' | 'rpc' | 'prediction' | 'intelligence';

type ProofCopy = {
  status: string;
  route: string;
  label: string;
  title: string;
  copy: string;
  metrics: readonly [string, string, string];
};

type ControlCopy = {
  title: string;
  state: string;
  price: string;
  network: string;
  expiry: string;
  policy: string;
  message: string;
  primary: string;
  secondary: string;
};

type CatalogFixture = {
  family: Exclude<FixtureFamily, 'all'>;
  keywords: string;
  title: string;
  copy: string;
  familyLabel: string;
  metaLabel: string;
  metaValue: string;
  href: string;
  openLabel: string;
};

const SETUP_INSTRUCTION = 'Set up https://clervo.dev/skill.md';
const DEFAULT_CATALOG_QUERY = 'Verify an on-chain claim and return cited evidence';
const proofOrder: readonly Exclude<ProofState, 'rest'>[] = ['request', 'qualify', 'execute', 'verify', 'prove'];

const proofStates: Record<ProofState, ProofCopy> = {
  rest: {
    status: 'Ready for task',
    route: 'Not selected',
    label: 'Awaiting bounded request',
    title: 'One task enters. The contract stays visible.',
    copy: 'Run the labeled fixture to see request, qualification, execution, verification, and proof resolve without implying a live customer transaction.',
    metrics: ['Pending', 'Pending', 'Pending'],
  },
  request: {
    status: 'Request received',
    route: 'Evaluating six families',
    label: 'Bounded request received',
    title: 'The task is accepted. No route has executed.',
    copy: 'Clervo first preserves the task identity, budget boundary, and approval requirement.',
    metrics: ['Queued', 'Not collected', 'Not issued'],
  },
  qualify: {
    status: 'Qualifying route',
    route: 'Search + Multi-chain RPC + Crypto Intelligence',
    label: 'Route qualification',
    title: 'Capability, availability, policy, and cost are checked.',
    copy: 'One eligible route becomes explicit while all paid execution remains blocked behind approval.',
    metrics: ['Qualified', 'Planned', 'Not issued'],
  },
  execute: {
    status: 'Executing selected route',
    route: 'Search + Multi-chain RPC + Crypto Intelligence',
    label: 'Bounded execution',
    title: 'Only the selected route is running.',
    copy: 'The demonstration now represents the approved route collecting current sources and chain state.',
    metrics: ['Running', 'Collecting', 'Preparing'],
  },
  verify: {
    status: 'Verifying evidence',
    route: 'Search + Multi-chain RPC + Crypto Intelligence',
    label: 'Verification',
    title: 'The result exists, but gold is still withheld.',
    copy: 'Claims, citations, chain checks, and replay identity must resolve before completion is shown.',
    metrics: ['Returned', '12 sources · 3 checks', 'Resolving'],
  },
  prove: {
    status: 'Verified result',
    route: 'Search + Multi-chain RPC + Crypto Intelligence',
    label: 'Verified outcome · fixture',
    title: 'Claims checked. Evidence attached. Receipt resolved.',
    copy: 'The completed state exposes the result, evidence, maximum cost, receipt identity, and replay behavior.',
    metrics: ['Verified fixture', '12 sources · 3 checks', 'RCP-7A92 · fixture'],
  },
};

const controlStates: Record<ControlState, ControlCopy> = {
  quote: {
    title: 'Approval required before execution',
    state: 'Quote fixture',
    price: '≤ $0.02 USDC',
    network: 'Base · fixture',
    expiry: '90 seconds',
    policy: 'Within agent budget',
    message: 'No paid route begins until the user or authorized policy approves this exact maximum, network, asset, and expiry.',
    primary: 'Approve fixture',
    secondary: 'Cancel',
  },
  approved: {
    title: 'Execution is bounded by the approved quote',
    state: 'Approved fixture',
    price: '≤ $0.02 USDC',
    network: 'Base · fixture',
    expiry: 'Quote locked',
    policy: 'No write permission',
    message: 'Approval applies only to this task identity and quote. It does not create standing payment authority.',
    primary: 'View execution',
    secondary: 'Revoke',
  },
  receipt: {
    title: 'Verification resolved the receipt',
    state: 'Verified fixture',
    price: '$0.018 USDC',
    network: 'Base · fixture',
    expiry: 'Settled',
    policy: 'Evidence attached',
    message: 'Gold is earned only after the result, evidence, cost, and receipt reconcile.',
    primary: 'Inspect receipt',
    secondary: 'View evidence',
  },
  refused: {
    title: 'The request stopped at the boundary',
    state: 'Refused fixture',
    price: '$0.00',
    network: 'No provider call',
    expiry: 'Not applicable',
    policy: 'Policy mismatch',
    message: 'Refusal is a complete product state: no execution, no charge, and a clear next action.',
    primary: 'Change policy',
    secondary: 'Close',
  },
  replay: {
    title: 'The existing result is returned safely',
    state: 'Replay fixture',
    price: '$0.00 additional',
    network: 'Original receipt',
    expiry: 'Replay protected',
    policy: 'Same task identity',
    message: 'The same task identity returns the resolved result without a duplicate provider call or charge.',
    primary: 'Return result',
    secondary: 'Inspect identity',
  },
};

const fixtureCatalog: readonly CatalogFixture[] = [
  { family: 'search', keywords: 'research web sources cited evidence verify claim search', title: 'Research and verify a current claim', copy: 'Find primary sources, compare assertions, and return evidence.', familyLabel: 'Search', metaLabel: 'Evidence', metaValue: 'Required', href: '/operations/search.research.verify', openLabel: 'Open search fixture operation' },
  { family: 'intelligence', keywords: 'wallet token protocol risk intelligence crypto claim on-chain evidence', title: 'Analyze an on-chain protocol', copy: 'Inspect protocol, token, wallet, and risk signals.', familyLabel: 'Crypto Intelligence', metaLabel: 'Quote', metaValue: 'Maximum shown', href: '/operations/crypto.analyze.protocol', openLabel: 'Open intelligence fixture operation' },
  { family: 'rpc', keywords: 'chain rpc transaction state balance logs block verify on-chain', title: 'Verify chain state across networks', copy: 'Read balances, logs, transactions, and block state.', familyLabel: 'Multi-chain RPC', metaLabel: 'Networks', metaValue: 'Explicit in contract', href: '/operations/rpc.verify.chain-state', openLabel: 'Open RPC fixture operation' },
  { family: 'ai', keywords: 'model reasoning extract classify transform summarize ai', title: 'Run a bounded model task', copy: 'Reason, extract, classify, or transform with a defined output schema.', familyLabel: 'AI', metaLabel: 'Schema', metaValue: 'Inspect first', href: '/operations/ai.run.bounded', openLabel: 'Open AI fixture operation' },
  { family: 'sandbox', keywords: 'code run execute file browser sandbox secure runtime test', title: 'Execute code in a bounded runtime', copy: 'Run an isolated task with explicit resource and output limits.', familyLabel: 'Secure Sandbox', metaLabel: 'Risk', metaValue: 'Policy-gated', href: '/operations/sandbox.execute.bounded', openLabel: 'Open sandbox fixture operation' },
  { family: 'prediction', keywords: 'prediction market probability forecast outcome event', title: 'Inspect a prediction market', copy: 'Retrieve current probabilities, market rules, and evidence context.', familyLabel: 'Prediction', metaLabel: 'Freshness', metaValue: 'Visible', href: '/operations/prediction.inspect.market', openLabel: 'Open prediction fixture operation' },
];

const familyPresentation = {
  search: { copy: 'Find current information and return traceable sources.', example: 'Example · verify a claim', icon: <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5M4 10h12M10 4v12" /></> },
  ai: { copy: 'Run model work against an exact task and output contract.', example: 'Example · structured analysis', icon: <path d="M6 7h12v10H6zM9 3v4m6-4v4M9 17v4m6-4v4M2 10h4m12 0h4M2 14h4m12 0h4" /> },
  sandbox: { copy: 'Execute code and tools inside explicit runtime boundaries.', example: 'Example · test a package', icon: <path d="M5 5h14v14H5zM8 10l3 2-3 2m5 0h3" /> },
  rpc: { copy: 'Read and verify state across supported blockchain networks.', example: 'Example · inspect a transaction', icon: <path d="M5 7h14M5 17h14M8 4v6m8 4v6M4 12h16" /> },
  prediction: { copy: 'Inspect market probabilities, rules, and current context.', example: 'Example · evaluate an event', icon: <path d="M4 18 9 12l4 3 7-9M17 6h3v3" /> },
  crypto_intelligence: { copy: 'Combine token, wallet, protocol, and risk signals.', example: 'Example · analyze a protocol', icon: <path d="M4 17 9 12l4 3 7-8M4 5h16M4 21h16" /> },
} as const;

const canonicalFamilies = discovery.releaseScope.pillars.map(({ pillarId }) => ({ id: pillarId, label: observedProduct(pillarId).label, ...familyPresentation[pillarId] }));
const familyCountWord = canonicalFamilies.length === 6 ? 'six' : String(canonicalFamilies.length);
const familyCountTitle = canonicalFamilies.length === 6 ? 'Six' : String(canonicalFamilies.length);

const familyTabs: readonly { id: FixtureFamily; label: string; count: string }[] = [
  { id: 'all', label: 'All matches', count: '06' }, { id: 'search', label: 'Search', count: '01' }, { id: 'ai', label: 'AI', count: '01' }, { id: 'sandbox', label: 'Secure Sandbox', count: '01' }, { id: 'rpc', label: 'Multi-chain RPC', count: '01' }, { id: 'prediction', label: 'Prediction', count: '01' }, { id: 'intelligence', label: 'Crypto Intelligence', count: '01' },
];

const controlTabs: readonly { id: ControlState; label: string; small: string }[] = [
  { id: 'quote', label: 'Quote', small: 'Before execution' }, { id: 'approved', label: 'Approved', small: 'Bounded execution' }, { id: 'receipt', label: 'Receipt', small: 'Verified proof' }, { id: 'refused', label: 'Refused', small: 'No execution' }, { id: 'replay', label: 'Replay', small: 'No duplicate charge' },
];

export function B12HomepageBelowHero() {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'blocked'>('idle');
  const [proofState, setProofState] = useState<ProofState>('rest');
  const [proofRunning, setProofRunning] = useState(false);
  const [proofHasRun, setProofHasRun] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState(DEFAULT_CATALOG_QUERY);
  const [activeFamily, setActiveFamily] = useState<FixtureFamily>('all');
  const [controlState, setControlState] = useState<ControlState>('quote');
  const timers = useRef<number[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const clearProofTimers = () => { timers.current.forEach((timer) => window.clearTimeout(timer)); timers.current = []; };
  useEffect(() => clearProofTimers, []);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return undefined;
    const nodes = [...root.querySelectorAll<HTMLElement>('.clervo-liquid')];
    const cleanups = nodes.map((element) => {
      const move = (event: PointerEvent) => {
        const rect = element.getBoundingClientRect();
        element.style.setProperty('--liquid-x', `${((event.clientX - rect.left) / rect.width) * 100}%`);
        element.style.setProperty('--liquid-y', `${((event.clientY - rect.top) / rect.height) * 100}%`);
      };
      const leave = () => { element.style.setProperty('--liquid-x', '50%'); element.style.setProperty('--liquid-y', '22%'); };
      element.addEventListener('pointermove', move); element.addEventListener('pointerleave', leave);
      return () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerleave', leave); };
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  const filteredCatalog = useMemo(() => {
    const query = catalogQuery.toLowerCase().trim();
    const words = query.split(/\s+/u);
    return fixtureCatalog.filter((card) => {
      const familyMatches = activeFamily === 'all' || card.family === activeFamily;
      const queryMatches = query.length === 0 || card.keywords.includes(query) || words.some((word) => word.length > 3 && card.keywords.includes(word));
      return familyMatches && queryMatches;
    });
  }, [activeFamily, catalogQuery]);

  const proof = proofStates[proofState];
  const activeProofIndex = proofOrder.indexOf(proofState as Exclude<ProofState, 'rest'>);
  const control = controlStates[controlState];

  const copyInstruction = async () => {
    try { await navigator.clipboard.writeText(SETUP_INSTRUCTION); setCopyState('copied'); }
    catch { setCopyState('blocked'); }
  };

  const runProof = () => {
    clearProofTimers(); setProofRunning(true); setProofHasRun(true);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setProofState('prove'); setProofRunning(false); return; }
    const sequence: readonly [ProofState, number][] = [['request', 0], ['qualify', 650], ['execute', 1450], ['verify', 2300], ['prove', 3150]];
    sequence.forEach(([state, delay]) => { timers.current.push(window.setTimeout(() => setProofState(state), delay)); });
    timers.current.push(window.setTimeout(() => setProofRunning(false), 3800));
  };

  const resetProof = () => { clearProofTimers(); setProofState('rest'); setProofRunning(false); setProofHasRun(false); };

  return (
    <div className="s7a-root" id="step-7a" ref={rootRef}>
      <section className="s7a-section s7a-bridge">
        <div className="s7a-shell s7a-bridge-grid">
          <div><p className="s7a-kicker">One-instruction setup</p><h2>Install the operating layer once.</h2><p>Clervo is the operating layer between an agent task and a verified result. The setup path stays capability-independent across all {familyCountWord} launch families.</p></div>
          <div aria-label="Clervo setup instruction" className="s7a-command">
            <div className="s7a-command-top"><span>Agent instruction</span><span className="s7a-fixture">Prototype path</span></div>
            <div className="s7a-command-line"><code className="s7a-command-code"><span>›</span> {SETUP_INSTRUCTION}</code><button className="s7a-button s7a-button-primary clervo-liquid" data-liquid="primary" onClick={copyInstruction} type="button">{copyState === 'copied' ? 'Copied' : 'Copy instruction'}</button></div>
            <div className="s7a-command-meta"><span>Detect environment</span><span>Approve plan</span><span>Verify install</span><span>Load catalog</span></div>
            <p aria-live="polite" className="s7a-copy-note">{copyState === 'copied' ? 'Instruction copied. This prototype still performs no installation or account action.' : copyState === 'blocked' ? 'Copy was blocked by the browser. Select the instruction manually.' : 'No account or wallet action is performed by this design prototype.'}</p>
          </div>
          <aside className="s7a-bridge-boundary"><p className="s7a-kicker">Owner boundary</p><div><strong>No standing spend</strong><span>Approval is scoped to the exact task and maximum.</span></div><div><strong>{familyCountTitle}-family access · prototype</strong><span>The design path is capability-independent; live availability remains canonical.</span></div><div><strong>Proof survives replay</strong><span>Result, evidence, receipt, and replay identity remain inspectable.</span></div></aside>
        </div>
      </section>

      <section className="s7a-section"><div className="s7a-shell">
        <div className="s7a-proof-head"><div><p className="s7a-kicker">One real task pattern</p><h2 className="s7a-title">See the complete outcome contract.</h2><p className="s7a-copy">A request is useful only when the route, limit, approval, result, evidence, receipt, and replay state remain inspectable.</p></div><span className="s7a-fixture">Demonstration · no payment · fixture values</span></div>
        <div className="s7a-proof-frame" data-proof-state={proofState}>
          <div className="s7a-proof-toolbar"><span>Featured outcome trace</span><span className="s7a-proof-status"><i /><b>{proof.status}</b></span></div><div className="s7a-proof-progress"><span /></div>
          <div className="s7a-proof-main">
            <div className="s7a-request-pane"><p className="s7a-label">Agent task</p><p className="s7a-task">Research an on-chain protocol, verify its current claims, and return cited evidence.</p><dl className="s7a-contract-list"><div className="s7a-contract-row"><dt>Qualified route</dt><dd>{proof.route}</dd></div><div className="s7a-contract-row"><dt>Maximum charge</dt><dd className="fixture-value">≤ $0.02 USDC · fixture</dd></div><div className="s7a-contract-row"><dt>Approval</dt><dd>Required before paid execution</dd></div><div className="s7a-contract-row"><dt>Replay</dt><dd>Existing result returned without a second charge</dd></div></dl><div className="s7a-proof-actions"><button className="s7a-button s7a-button-primary clervo-liquid" data-liquid="primary" disabled={proofRunning} onClick={runProof} type="button">{proofHasRun ? 'Run again' : 'Run demonstration'}</button><button className="s7a-button" onClick={resetProof} type="button">Reset</button></div></div>
            <div className="s7a-outcome-pane"><div><div aria-label="Outcome sequence" className="s7a-flow">{proofOrder.map((step, index) => <span className={`s7a-flow-step${activeProofIndex >= index && activeProofIndex >= 0 ? ' active' : ''}`} data-step={step} key={step}>{step[0]?.toUpperCase()}{step.slice(1)}</span>)}</div><div className="s7a-result-eyebrow"><i /><span>{proof.label}</span></div><h3 className="s7a-result-title">{proof.title}</h3><p className="s7a-result-copy">{proof.copy}</p></div><div className="s7a-proof-metrics"><div className="s7a-proof-metric"><span>Result</span><strong>{proof.metrics[0]}</strong></div><div className="s7a-proof-metric"><span>Evidence</span><strong>{proof.metrics[1]}</strong></div><div className="s7a-proof-metric"><span>Receipt</span><strong>{proof.metrics[2]}</strong></div></div></div>
          </div>
        </div>
      </div></section>

      <section className="s7a-section" id="catalog"><div className="s7a-shell">
        <div className="s7a-catalog-intro"><div><p className="s7a-kicker">Natural-language catalog</p><h2 className="s7a-title">What does your agent need to do?</h2></div><div className="s7a-searchbox"><label htmlFor="s7-search">Describe the outcome, not the provider</label><div className="s7a-searchline"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 5 5" /></svg><input autoComplete="off" id="s7-search" onChange={(event) => setCatalogQuery(event.target.value)} type="search" value={catalogQuery} /></div><p className="s7a-search-hint">Illustrative catalog responses below are clearly labeled fixtures and are not connected to production lifecycle, pricing, or availability data.</p></div></div>
        <div className="s7a-catalog-stage"><div aria-label="Capability family fixture filters" className="s7a-family-nav" role="tablist">{familyTabs.map((tab) => <button aria-selected={activeFamily === tab.id} className={`s7a-family-tab${activeFamily === tab.id ? ' active' : ''}`} data-family={tab.id} key={tab.id} onClick={() => setActiveFamily(tab.id)} role="tab" type="button"><span>{tab.label}</span><span>{tab.count}</span></button>)}</div><div className="s7a-results" id="s7-results">{fixtureCatalog.map((card) => { const visible = filteredCatalog.includes(card); return <article className="s7a-result-card" data-family={card.family} data-keywords={card.keywords} hidden={!visible} key={card.href}><div><h3>{card.title}</h3><p>{card.copy}</p></div><div className="s7a-result-meta">Family<strong>{card.familyLabel}</strong></div><div className="s7a-result-meta">{card.metaLabel}<strong>{card.metaValue}</strong></div><span className="s7a-lifecycle"><i />Fixture</span><a aria-label={card.openLabel} className="s7a-result-open" href={card.href} onClick={(event) => event.preventDefault()}>→</a></article>; })}<p className="s7a-empty" style={{ display: filteredCatalog.length === 0 ? 'block' : 'none' }}>No fixture matches this wording. Production must return a truthful empty, preview, unavailable, or replacement state.</p></div></div>
      </div></section>

      <section className="s7a-section" id="families"><div className="s7a-shell"><div className="s7a-families-head"><div><p className="s7a-kicker">The complete platform</p><h2 className="s7a-title">{familyCountTitle} capability families. One outcome layer.</h2></div><p className="s7a-copy">The families are not {familyCountWord} disconnected products. Clervo qualifies and combines them around the bounded task.</p></div><div className="s7a-family-grid">{canonicalFamilies.map((family) => <article className="s7a-family-card" key={family.id}><div className="s7a-family-icon"><svg aria-hidden="true" viewBox="0 0 24 24">{family.icon}</svg></div><h3>{family.label}</h3><p>{family.copy}</p><div className="s7a-family-foot"><span>Canonical launch family</span><span>{family.example}</span></div></article>)}</div></div></section>

      <section className="s7a-section"><div className="s7a-shell s7a-mechanism-grid"><div><p className="s7a-kicker">Operating mechanism</p><h2 className="s7a-title">Find. Understand. Act.</h2><p className="s7a-copy">Clervo does not hide the route behind an abstract promise. The agent can discover the task, inspect the contract, and act only inside the approved boundary.</p><div className="s7a-steps"><div className="s7a-step"><span className="s7a-step-num">01</span><div><strong>Find the operation</strong><p>Match the natural-language task to the canonical catalog.</p></div></div><div className="s7a-step"><span className="s7a-step-num">02</span><div><strong>Understand the contract</strong><p>Inspect schema, lifecycle, route, price, policy, and risk.</p></div></div><div className="s7a-step"><span className="s7a-step-num">03</span><div><strong>Act with proof</strong><p>Approve when required, then receive the result, evidence, and receipt.</p></div></div></div></div><div aria-label="Find Understand Act mechanism" className="s7a-mechanism-panel"><div className="s7a-mechanism-beam" /><svg aria-hidden="true" className="s7a-mechanism-apex" viewBox="0 0 240 220"><path d="M120 14 24 198h192L120 14Z" /><path className="seam" d="m120 14-1 184M24 198l95-88 97 88M72 106l47 4 49-4" /><path className="cyan" d="M24 110h95" /><path className="gold" d="M119 110h97" /></svg><div className="s7a-mechanism-note find"><strong>Find</strong><span>Task intent enters without provider knowledge.</span></div><div className="s7a-mechanism-note understand"><strong>Understand</strong><span>Capability, policy, availability, route, and cost qualify.</span></div><div className="s7a-mechanism-note act"><strong>Act</strong><span>Only the selected, approved route executes.</span></div><div className="s7a-mechanism-note prove"><strong>Prove</strong><span>Gold appears only after evidence and receipt resolve.</span></div></div></div></section>

      <section className="s7a-section" id="controls"><div className="s7a-shell"><div className="s7a-controls-head"><div><p className="s7a-kicker">Cost and control</p><h2 className="s7a-title">Fast for the agent. Explicit for the owner.</h2></div><p className="s7a-copy">Maximum charge, network, asset, expiry, approval, refusal, receipt, and replay protection stay adjacent to the action.</p></div><div className="s7a-control-shell"><div aria-label="Fixture control states" className="s7a-control-tabs" role="tablist">{controlTabs.map((tab) => <button aria-selected={controlState === tab.id} className={`s7a-control-tab${controlState === tab.id ? ' active' : ''}`} data-control={tab.id} key={tab.id} onClick={() => setControlState(tab.id)} role="tab" type="button">{tab.label}<small>{tab.small}</small></button>)}</div><div className="s7a-control-view" data-control={controlState}><div className="s7a-quote-top"><h3 className="s7a-quote-title">{control.title}</h3><span className="s7a-quote-state"><i /><b>{control.state}</b></span></div><div className="s7a-quote-grid"><div className="s7a-quote-item"><span>Maximum charge</span><strong>{control.price}</strong></div><div className="s7a-quote-item"><span>Network</span><strong>{control.network}</strong></div><div className="s7a-quote-item"><span>Quote expiry</span><strong>{control.expiry}</strong></div><div className="s7a-quote-item"><span>Policy</span><strong>{control.policy}</strong></div></div><p className="s7a-control-message">{control.message}</p><div className="s7a-control-actions"><button className="s7a-button s7a-button-primary clervo-liquid" data-liquid="primary" type="button">{control.primary}</button><button className="s7a-button" type="button">{control.secondary}</button></div></div></div></div></section>

      <section className="s7a-section"><div className="s7a-shell"><div className="s7a-setup-grid"><div><p className="s7a-kicker">Agent-native setup</p><h2 className="s7a-title">The setup stays one instruction. The authority does not.</h2><p className="s7a-copy">Detect the environment, show the plan, request approval, install, verify, load the catalog, and complete the first useful task.</p><span className="s7a-fixture s7a-setup-fixture">Prototype setup structure · no live setup action</span></div><div className="s7a-install-steps"><div className="s7a-install-step"><b>01</b><div><strong>Detect</strong><span>Identify the agent, client, package manager, and available interfaces.</span></div><em>Prototype · no account action</em></div><div className="s7a-install-step"><b>02</b><div><strong>Plan and approve</strong><span>Show exactly what will be installed and which permissions are requested.</span></div><em>User approval</em></div><div className="s7a-install-step"><b>03</b><div><strong>Install and verify</strong><span>Confirm the connection before loading any task catalog.</span></div><em>Diagnostic proof</em></div><div className="s7a-install-step"><b>04</b><div><strong>Complete one useful task</strong><span>Teach paid use only when a real quote and approval are needed.</span></div><em>Result first</em></div></div></div><div aria-label="Status and trust fixture" className="s7a-trust-strip"><div className="s7a-trust-item"><span>Catalog surface</span><strong>{familyCountTitle} launch families</strong><small>Family identity is bound to the canonical release scope; lifecycle and availability are not claimed here.</small></div><div className="s7a-trust-item"><span>Payment surface</span><strong>Disconnected prototype</strong><small>No wallet, quote, settlement, or payment action is connected.</small></div><div className="s7a-trust-item"><span>Proof surface</span><strong>Labeled fixture only</strong><small>No customer usage or live transaction is claimed.</small></div><div className="s7a-trust-item"><span>Required bindings</span><strong>Catalog · pricing · status</strong><small>Production must use one canonical truth system.</small></div></div></div></section>

      <section className="s7a-section s7a-final"><svg aria-hidden="true" className="s7a-final-apex" viewBox="0 0 420 390"><path d="M210 20 32 360h356L210 20Z" /><path d="m210 20-2 340M32 360l176-165 180 165" /></svg><div className="s7a-final-content"><p className="s7a-kicker">Buy outcomes. Not integrations.</p><h2>One task is enough to start.</h2><p>Set up Clervo, describe the result your agent needs, and inspect the contract before anything executes.</p><div className="s7a-final-actions"><Link className="s7a-button s7a-button-primary clervo-liquid" data-liquid="primary" to="/start">Set up Clervo</Link><a className="s7a-button" href="#catalog">Explore the catalog</a></div></div></section>

      <footer className="s7a-shell s7a-footer"><span>Step 7A · v1.3 locked · mobile parity approved</span><nav aria-label="Footer" className="s7a-footer-links"><Link to="/product">Product</Link><Link to="/catalog">Catalog</Link><Link to="/pricing">Pricing</Link><Link to="/docs">Docs</Link><Link to="/status">Status</Link><Link to="/security">Security</Link><Link to="/proof">Proof</Link></nav></footer>
    </div>
  );
}
