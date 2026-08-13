import { useEffect, useMemo, useRef, useState } from 'react';

import {
  operationContract,
  publishedOperationIds,
  type OperationScenario,
} from '../operation';
import type { ExperiencePhase } from '../product';
import { Link } from '../router';
import '../styles/b12/operation-contract.css';

type ExecutionState = 'idle' | 'request' | 'qualify' | 'execute' | 'verify' | 'verified' | 'refused' | 'unresolved';
type ResultTab = 'result' | 'evidence' | 'receipt';
type InterfaceTab = 'skill' | 'mcp' | 'typescript' | 'python' | 'http';
type PipelineStep = 'request' | 'qualify' | 'execute' | 'verify' | 'prove';

const pipeline: ReadonlyArray<readonly [PipelineStep, string, string]> = [
  ['request', 'Request', 'Bounded task and identity received.'],
  ['qualify', 'Qualify', 'Lifecycle, schema, policy, route and price boundary checked.'],
  ['execute', 'Execute', 'Selected route would perform the approved task.'],
  ['verify', 'Verify', 'Output, evidence and settlement truth would be checked.'],
  ['prove', 'Prove', 'Result, evidence, receipt and replay state close the contract.'],
];

const sectionLinks: ReadonlyArray<readonly [string, string, string]> = [
  ['overview', 'Overview', '01'],
  ['input', 'Required input', '02'],
  ['result', 'Returned result', '03'],
  ['availability', 'Availability', '04'],
  ['price', 'Price & approval', '05'],
  ['execution', 'Execution', '06'],
  ['latency', 'Latency', '07'],
  ['proof', 'Evidence & receipt', '08'],
  ['interfaces', 'Interfaces', '09'],
  ['errors', 'Errors & recovery', '10'],
  ['replay', 'Safe replay', '11'],
  ['history', 'Version history', '12'],
];

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function JsonBlock({ value, empty }: { value: unknown | null; empty: string }) {
  return <pre className="s5-code-block">{value === null ? empty : JSON.stringify(value, null, 2)}</pre>;
}

function SectionHead({ number, label, title, copy }: { number: string; label: string; title: string; copy: string }) {
  return (
    <div className="s5-section-head">
      <div><p className="s5-kicker">{number} · {label}</p><h2>{title}</h2></div>
      <p>{copy}</p>
    </div>
  );
}

function packageItem(
  packages: Array<{ registry: 'npm' | 'pypi'; name: string; version: string; url: string }>,
  name: string,
) {
  return packages.find((entry) => entry.name === name) ?? null;
}

export function Operation({ operationId, onPhase }: { operationId: string; onPhase(phase: ExperiencePhase): void }) {
  const contract = useMemo(() => operationContract(operationId), [operationId]);
  const [approved, setApproved] = useState(false);
  const [scenario, setScenario] = useState<OperationScenario>('verified');
  const [executionState, setExecutionState] = useState<ExecutionState>('idle');
  const [resultTab, setResultTab] = useState<ResultTab>('result');
  const [interfaceTab, setInterfaceTab] = useState<InterfaceTab>('http');
  const [replayed, setReplayed] = useState(false);
  const [notice, setNotice] = useState('Design-state fixture only. No live request, wallet action, payment, settlement, or receipt generation occurs here.');
  const [reducedMotion, setReducedMotion] = useState(false);
  const runToken = useRef(0);

  useEffect(() => onPhase(contract.publicAvailable ? 'qualified' : 'risk'), [contract.publicAvailable, onPhase]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    runToken.current += 1;
    setApproved(false);
    setExecutionState('idle');
    setReplayed(false);
    setNotice('Design-state fixture only. No live request, wallet action, payment, settlement, or receipt generation occurs here.');
  }, [operationId]);

  const responseErrors = contract.openapi.responses === null
    ? []
    : Object.entries(contract.openapi.responses).filter(([code]) => code !== '200').sort(([a], [b]) => a.localeCompare(b));
  const mcpPackage = packageItem(contract.packages, '@clervo/mcp');
  const tsPackage = packageItem(contract.packages, '@clervo/sdk');
  const pythonPackage = packageItem(contract.packages, 'clervo-sdk');
  const pickerIds = [...new Set([operationId, ...publishedOperationIds])];

  const resetFixture = () => {
    runToken.current += 1;
    setExecutionState('idle');
    setReplayed(false);
    setNotice('Design-state fixture reset. No production state changed.');
  };

  const runFixture = async () => {
    if (scenario === 'verified' && !approved) {
      setNotice('Approval fixture required before the verified design state. No live authorization is being requested.');
      document.querySelector('#s5-price')?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' });
      return;
    }
    const token = ++runToken.current;
    const step = async (state: ExecutionState) => {
      if (token !== runToken.current) return false;
      setExecutionState(state);
      if (!reducedMotion) await wait(260);
      return token === runToken.current;
    };
    setReplayed(false);
    setNotice(`Running ${scenario} design-state fixture. No production execution occurs.`);
    if (!await step('request') || !await step('qualify')) return;
    if (scenario === 'refused') {
      setExecutionState('refused');
      setNotice('Refused · design fixture · no charge · recovery guidance remains visible.');
      return;
    }
    if (!await step('execute') || !await step('verify')) return;
    if (scenario === 'unresolved') {
      setExecutionState('unresolved');
      setNotice('Unresolved · design fixture · retry is blocked until settlement is reconciled.');
      return;
    }
    setExecutionState('verified');
    setNotice('Verified · design fixture only · proof semantics demonstrated without creating a live receipt or transaction.');
  };

  const replayFixture = () => {
    if (executionState === 'unresolved') {
      setNotice('Replay blocked · unresolved fixture must reconcile before retry.');
      return;
    }
    if (executionState !== 'verified') {
      setNotice('Replay fixture is available after the verified design state.');
      return;
    }
    setReplayed(true);
    setNotice('Safe replay · design fixture · same outcome identity, no second execution or charge demonstrated conceptually only.');
  };

  const pipelineState = (step: PipelineStep) => {
    const order: ExecutionState[] = ['request', 'qualify', 'execute', 'verify', 'verified'];
    const target = step === 'prove' ? 'verified' : step;
    if (executionState === 'refused') return step === 'request' || step === 'qualify' ? 'done' : step === 'execute' ? 'blocked' : '';
    if (executionState === 'unresolved') {
      if (step === 'request' || step === 'qualify' || step === 'execute') return 'done';
      return step === 'verify' ? 'unresolved' : '';
    }
    const currentIndex = order.indexOf(executionState);
    const targetIndex = order.indexOf(target as ExecutionState);
    if (currentIndex < 0) return '';
    if (targetIndex < currentIndex) return 'done';
    if (targetIndex === currentIndex) return executionState === 'verified' ? 'done' : 'active';
    return '';
  };

  const interfaceContent: Record<InterfaceTab, string> = {
    skill: `Canonical Skill surface\n${contract.artifacts.skill}\n\nNo operation-specific Skill command is invented on this page.`,
    mcp: mcpPackage === null ? 'MCP package publication is not bound.' : `Published package\n${mcpPackage.name}@${mcpPackage.version}\n\nOperation-specific tool syntax: not bound here.`,
    typescript: tsPackage === null ? 'TypeScript package publication is not bound.' : `Published package\n${tsPackage.name}@${tsPackage.version}\n\nOperation-specific SDK call syntax: not invented here.`,
    python: pythonPackage === null ? 'Python package publication is not bound.' : `Published package\n${pythonPackage.name}==${pythonPackage.version}\n\nOperation-specific SDK call syntax: not invented here.`,
    http: contract.publicRoute === null ? `No public HTTP execution route is bound for ${contract.id}.\nInspect ${contract.artifacts.openapi} for current machine truth.` : `POST ${contract.publicRoute}\nOpenAPI: ${contract.artifacts.openapi}\nIdempotency-Key: ${contract.openapi.idempotencyRequired ? 'required' : 'not asserted'}`,
  };

  const proof = contract.exactPaymentProof;
  const priceDisplay = contract.price.amount === 'No single amount published' ? 'QUOTE' : contract.price.amount.split(' ')[0];

  return (
    <div className="b12-operation" data-operation-id={contract.id} data-execution-state={executionState} data-scenario={scenario}>
      <div className="s5-contract-picker" aria-label="Operation contract picker">
        <div className="s5-shell s5-contract-picker-inner">
          <span className="s5-picker-label">Operation contracts</span>
          {pickerIds.map((id) => <Link key={id} className={`s5-contract-choice${id === contract.id ? ' active' : ''}`} to={`/operations/${id}`}><i aria-hidden="true" />{id}</Link>)}
        </div>
      </div>

      <section className="s5-operation-hero s5-narrow" aria-labelledby="s5-operation-title">
        <div className="s5-breadcrumbs"><Link to="/catalog">Catalog</Link><span>/</span><Link to={`/products/${contract.familyRoute}`}>{contract.familyLabel}</Link><span>/</span><strong>{contract.id}</strong></div>
        <div className="s5-hero-grid">
          <div className="s5-hero-copy">
            <p className="s5-eyebrow">Operation contract · canonical identity</p>
            <h1 id="s5-operation-title">{contract.title}</h1>
            <p className="s5-lede">{contract.summary}</p>
            <code className="s5-operation-id">{contract.id}</code>
            <div className="s5-hero-badges">
              <span className={`s5-badge ${contract.publicAvailable ? 'preview' : 'unavailable'}`}><i />{contract.lifecycle}</span>
              <span className="s5-badge"><i />{contract.health}</span>
              <span className="s5-badge"><i />{contract.actionClass}</span>
              <span className="s5-badge"><i />contract {contract.contractVersion}</span>
            </div>
            <div className="s5-hero-actions"><a className="b12-button b12-button-primary b12-liquid" href="#s5-execution">Review execution states</a><a className="b12-button b12-button-secondary b12-liquid" href="#s5-input">Inspect contract</a></div>
          </div>
          <aside className="s5-hero-summary" aria-label="Current operation contract summary">
            <div className="s5-summary-head"><span>Current contract</span><strong>Canonical where bound</strong></div>
            <div className="s5-summary-row"><span>Price behavior</span><strong>{contract.price.behavior}</strong></div>
            <div className="s5-summary-row"><span>Maximum</span><strong>{contract.price.amount}</strong></div>
            <div className="s5-summary-row"><span>Access</span><strong>{contract.access}</strong></div>
            <div className="s5-summary-row"><span>Latency</span><strong>Not published</strong></div>
          </aside>
        </div>
      </section>

      <section className="s5-contract-strip" aria-label="Operation contract facts"><div className="s5-narrow s5-contract-strip-inner">
        <div className="s5-contract-stat"><small>Family</small><strong>{contract.familyLabel}</strong></div>
        <div className="s5-contract-stat"><small>Family probe</small><strong>{contract.observedFamilyLifecycle}</strong></div>
        <div className="s5-contract-stat"><small>Quote</small><strong>{contract.price.behavior}</strong></div>
        <div className="s5-contract-stat"><small>Network</small><strong>{contract.price.network}</strong></div>
        <div className="s5-contract-stat"><small>Proof</small><strong>{contract.proofLabel}</strong></div>
        <div className="s5-contract-stat"><small>Observed</small><code>{contract.observedAt}</code></div>
      </div></section>

      <div className="s5-narrow s5-contract-layout">
        <nav className="s5-contract-nav" aria-label="Operation contract sections"><p>Contract index</p>{sectionLinks.map(([id, label, number]) => <a key={id} href={`#s5-${id}`}>{label}<span>{number}</span></a>)}</nav>
        <div className="s5-contract-main">
          <section className="s5-contract-section" id="s5-overview">
            <SectionHead number="01" label="What it does" title="The callable contract for this task." copy="Human meaning and machine truth stay together. Anything not bound by current canonical artifacts remains explicitly unavailable rather than filled from the design fixture." />
            <div className="s5-two-col">
              <article className="s5-panel"><h3>{contract.title}</h3><p>{contract.summary}</p><div className="s5-task-examples"><div className="s5-task-example">Canonical operation ID · {contract.id}</div><div className="s5-task-example">Current access · {contract.access}</div><div className="s5-task-example">Public route · {contract.publicRoute ?? 'not bound'}</div></div></article>
              <article className="s5-panel s5-boundary"><p className="s5-kicker">Boundary</p><h3>Unknown fields stay unknown.</h3><p>Action class, operation-specific health, latency, provider identity, and history are not inferred from family or fixture copy when current public truth does not bind them.</p><div className="s5-task-examples"><div className="s5-task-example">No hidden live execution from this page.</div><div className="s5-task-example">No fake quote, wallet, receipt, transaction, or settlement.</div><div className="s5-task-example">Gold only marks explicitly verified proof.</div></div></article>
            </div>
          </section>

          <section className="s5-contract-section" id="s5-input">
            <SectionHead number="02" label="Required input" title="Inputs are explicit before execution." copy="Where the current OpenAPI route binds an input schema, this page renders that exact schema. Otherwise the structure remains visible with a truthful unbound state." />
            <div className="s5-schema-shell"><div className="s5-schema-form"><div className="s5-field-ledger"><div className="s5-field-row"><code>operation</code><p>{contract.id}</p><span>canonical identity</span></div><div className="s5-field-row"><code>HTTP route</code><p>{contract.publicRoute ?? 'No public execution route bound'}</p><span>{contract.publicAvailable ? 'published' : 'unavailable'}</span></div><div className="s5-field-row"><code>Idempotency-Key</code><p>{contract.openapi.idempotencyRequired ? 'Required by the mapped public OpenAPI route.' : 'No operation-level requirement is asserted here.'}</p><span>{contract.openapi.idempotencyRequired ? 'required' : 'not bound'}</span></div></div></div><div className="s5-code-panel"><div className="s5-code-head"><span>Request schema · canonical OpenAPI</span><a href={contract.artifacts.openapi}>Open raw</a></div><JsonBlock value={contract.openapi.requestSchema} empty="No operation-specific public request schema is bound." /></div></div>
          </section>

          <section className="s5-contract-section" id="s5-result">
            <SectionHead number="03" label="Returned result" title="Result, evidence, and receipt stay separate." copy="A useful response is not automatically a verified paid outcome. The page keeps schema, evidence, receipt, and proof state distinct." />
            <div className="s5-result-tabs" role="tablist" aria-label="Result contract views">{(['result', 'evidence', 'receipt'] as ResultTab[]).map((tab) => <button key={tab} className={`s5-tab${resultTab === tab ? ' active' : ''}`} type="button" onClick={() => setResultTab(tab)}>{tab[0]?.toUpperCase()}{tab.slice(1)}</button>)}</div>
            <div className="s5-result-window"><div className="s5-code-head"><span>{resultTab} contract · canonical where bound</span></div>{resultTab === 'result' ? <JsonBlock value={contract.openapi.responseSchema} empty="No operation-specific public response schema is bound." /> : null}{resultTab === 'evidence' ? <div className="s5-prose-block"><strong>Evidence contract</strong><p>{contract.openapi.responseSchema === null ? 'No operation-level evidence schema is currently published.' : 'The mapped response schema is public; stronger evidence claims remain limited by the current proof state.'}</p><code>Current family proof: {contract.proofLabel}</code></div> : null}{resultTab === 'receipt' ? <div className="s5-prose-block"><strong>Receipt contract</strong><p>{contract.openapi.responseSchema === null ? 'No operation-specific receipt schema is currently bound.' : 'The mapped OpenAPI response exposes a receipt object without this page inventing a receipt identifier or settlement.'}</p><code>No live receipt is generated by this design-state surface.</code></div> : null}</div>
          </section>

          <section className="s5-contract-section" id="s5-availability">
            <SectionHead number="04" label="Availability & limitations" title="Current availability before the call." copy="Operation publication and family probe truth are shown separately so a family-level live observation cannot silently make every operation callable." />
            <div className="s5-availability-grid"><div className="s5-availability-cell"><small>Operation lifecycle</small><strong>{contract.lifecycle}</strong><p>{contract.publicAvailable ? 'Current catalog marks this operation publicly available.' : 'No public execution path is claimed for this operation.'}</p></div><div className="s5-availability-cell"><small>Family probe</small><strong>{contract.observedFamilyLifecycle}</strong><p>Observed family state; not substituted for operation publication.</p></div><div className="s5-availability-cell"><small>Operation health</small><strong>Not bound</strong><p>{contract.health}.</p></div><div className="s5-availability-cell"><small>Proof level</small><strong>{contract.proofLabel}</strong><p>Current observed family proof vocabulary.</p></div></div>
          </section>

          <section className="s5-contract-section" id="s5-price">
            <SectionHead number="05" label="Price, asset, network & approval" title="No hidden charge. No standing permission." copy="Current pricing truth is bound where the public pricing document has an exact operation record. Approval controls below are a labeled visual fixture and perform no authorization." />
            <div className="s5-quote-layout"><div className="s5-quote-copy"><p className="s5-kicker">Current price boundary</p><h3>{contract.price.behavior}</h3><p>{contract.price.amount === 'No single amount published' ? 'A single amount is not published; the executable route returns its own bounded quote where supported.' : `Current published maximum: ${contract.price.amount}.`}</p><div className="s5-quote-anatomy"><div className="s5-quote-row"><span>Operation</span><strong>{contract.id}</strong></div><div className="s5-quote-row"><span>Maximum</span><strong>{contract.price.amount}</strong></div><div className="s5-quote-row"><span>Network</span><strong>{contract.price.network}</strong></div><div className="s5-quote-row"><span>Asset</span><strong>{contract.price.asset}</strong></div><div className="s5-quote-row"><span>Price version</span><strong>{contract.price.priceVersion ?? 'not bound'}</strong></div><div className="s5-quote-row"><span>Observed</span><strong>{contract.price.observedAt}</strong></div></div></div><div className="s5-approval-box"><div className="s5-approval-head"><span>Approval boundary · design fixture</span><div className={`s5-approval-state${approved ? ' approved' : ''}`}><i /><b>{approved ? 'Approved fixture' : 'Not approved'}</b></div></div><div><div className="s5-price-number">{priceDisplay} <small>{priceDisplay === 'QUOTE' ? 'required' : 'max'}</small></div><div className="s5-budget-line"><span>Standing authority</span><strong>None</strong></div><div className="s5-budget-track"><i style={{ width: approved ? '28%' : '0%' }} /></div></div><div><div className="s5-approval-actions"><button className="b12-button b12-button-secondary b12-liquid" type="button" onClick={() => { setApproved(false); setNotice('Approval fixture rejected. No execution or charge occurred.'); }}>Reject fixture</button><button className="b12-button b12-button-primary b12-liquid" type="button" onClick={() => { setApproved(true); setNotice('Approval fixture set. No wallet or production authorization was created.'); }}>Approve fixture boundary</button></div><p className="s5-approval-note">This UI state does not sign, authorize, fund, or settle anything. It exists only to preserve the locked approval information architecture.</p></div></div></div>
          </section>

          <section className="s5-contract-section" id="s5-execution">
            <SectionHead number="06" label="Execution states" title="Verified, refused, and unresolved are different outcomes." copy="Request red enters. Qualification, execution, and unresolved investigation use cyan. Gold appears only on the verified proof state." />
            <div className="s5-execution-shell"><div className="s5-execution-control"><p className="s5-kicker">Scenario · design fixture</p><h3>Run the operating contract visually.</h3><p>No API, provider, wallet, payment, or settlement action is performed.</p><div className="s5-scenario-tabs" role="tablist" aria-label="Operation outcome fixture">{(['verified', 'refused', 'unresolved'] as OperationScenario[]).map((value) => <button key={value} className={`s5-tab${scenario === value ? ' active' : ''}`} type="button" onClick={() => { setScenario(value); resetFixture(); }}>{value[0]?.toUpperCase()}{value.slice(1)}</button>)}</div><div className="s5-execution-actions"><button className="b12-button b12-button-primary b12-liquid" type="button" onClick={() => void runFixture()}>Execute fixture</button><button className="b12-button b12-button-secondary b12-liquid" type="button" onClick={resetFixture}>Reset</button></div><div className={`s5-execution-result ${executionState}`}>{notice}</div></div><div className="s5-pipeline" aria-label="Request to proof pipeline">{pipeline.map(([step, label, copy]) => { const state = pipelineState(step); return <div key={step} className={`s5-pipeline-step ${step} ${state}`}><i /><div><strong>{label}</strong><p>{copy}</p></div><span>{state || 'waiting'}</span></div>; })}</div></div>
          </section>

          <section className="s5-contract-section" id="s5-latency">
            <SectionHead number="07" label="Expected latency & timeout" title="Unknown timing stays unknown." copy="The locked structure is preserved without fabricating a percentile chart, SLA, provider deadline, or reconciliation duration." />
            <div className="s5-latency-layout"><div className="s5-latency-empty"><p className="s5-kicker">Operation latency</p><div className="s5-timeout-big">—</div><h3>Not published.</h3><p>No reproducible operation/version latency measurement is currently bound to this page.</p></div><div className="s5-timeout-card"><p className="s5-kicker">Timeout & reconciliation</p><div className="s5-timeout-big">—</div><h3>Not bound at operation level.</h3><p>Platform recovery rules remain available below. A blind retry is never implied when settlement is unknown.</p></div></div>
          </section>

          <section className="s5-contract-section" id="s5-proof">
            <SectionHead number="08" label="Evidence & receipt fields" title="Proof is part of the product surface." copy="Exact paid proof is shown only when the current status authority names this operation. Otherwise the page keeps proof neutral." />
            <div className="s5-proof-grid"><article className="s5-proof-panel"><p className="s5-kicker">Current proof boundary</p><h3>{contract.proofLabel}</h3><code className="s5-proof-id">family observation · {contract.familyLabel}</code><div className="s5-proof-fields"><div className="s5-proof-field"><span>operation</span><strong>{contract.id}</strong></div><div className="s5-proof-field"><span>response schema</span><strong>{contract.openapi.responseSchema === null ? 'not bound' : 'OpenAPI-bound'}</strong></div><div className="s5-proof-field"><span>receipt generation here</span><strong>none</strong></div><div className="s5-proof-field"><span>payment proof state</span><strong>{proof === null ? 'not bound' : proof.state}</strong></div></div></article><article className={`s5-proof-panel${proof === null ? '' : ' earned'}`}><p className="s5-kicker">Operation-specific proof</p><h3>{proof === null ? 'No paid outcome proof bound.' : 'Verified payment proof.'}</h3><code className="s5-proof-id">{proof === null ? 'No gold production claim' : `${proof.amountDisplay} · ${proof.network} · ${proof.asset}`}</code><div className="s5-proof-fields">{proof === null ? <><div className="s5-proof-field"><span>settlement</span><strong>not asserted</strong></div><div className="s5-proof-field"><span>replay</span><strong>not asserted</strong></div><div className="s5-proof-field"><span>receipt</span><strong>not invented</strong></div></> : <><div className="s5-proof-field"><span>settlement confirmed</span><strong>{String(proof.settlementConfirmed)}</strong></div><div className="s5-proof-field"><span>useful result</span><strong>{String(proof.usefulResult)}</strong></div><div className="s5-proof-field"><span>same receipt replay</span><strong>{String(proof.replaySameReceipt)}</strong></div><div className="s5-proof-field"><span>second charge</span><strong>{String(proof.secondCharge)}</strong></div><div className="s5-proof-field"><span>transaction evidence</span><strong>{proof.transactionUrl ? 'linked' : 'not linked'}</strong></div></>}</div></article></div>
          </section>

          <section className="s5-contract-section" id="s5-interfaces">
            <SectionHead number="09" label="Skill, MCP, SDK & HTTP" title="The same operation identity across every interface." copy="Only package publication and raw routes proven by generated public artifacts are shown. Operation-specific client syntax is omitted when it is not safely generated here." />
            <div className="s5-interface-shell"><div className="s5-interface-head"><div className="s5-interface-tabs" role="tablist" aria-label="Operation interfaces">{(['skill', 'mcp', 'typescript', 'python', 'http'] as InterfaceTab[]).map((tab) => <button key={tab} type="button" className={`s5-tab${interfaceTab === tab ? ' active' : ''}`} onClick={() => setInterfaceTab(tab)}>{tab === 'typescript' ? 'TypeScript' : tab.toUpperCase()}</button>)}</div></div><pre className="s5-code-block">{interfaceContent[interfaceTab]}</pre><div className="s5-interface-note">Canonical publication evidence only. No `@clervo/router` publication or unsupported client compatibility is implied.</div></div>
          </section>

          <section className="s5-contract-section" id="s5-errors">
            <SectionHead number="10" label="Errors & recovery" title="Every known failure keeps a next action." copy="HTTP errors come from the mapped OpenAPI route where one exists. Platform recovery codes come from the generated onboarding contract and remain separate from operation-specific claims." />
            <div className="s5-error-table"><div className="s5-error-row header"><span>Source</span><span>Code</span><span>Meaning</span><span>Recovery</span></div>{responseErrors.length === 0 ? <div className="s5-error-row"><span>OpenAPI</span><code>not bound</code><span>No operation-specific public error map is bound.</span><span>Inspect lifecycle and current machine artifacts before attempting execution.</span></div> : responseErrors.map(([code, response]) => <div className="s5-error-row" key={code}><span>OpenAPI</span><code>HTTP {code}</code><span>{response.description ?? 'No description published'}</span><span>Follow published problem details; no recovery is invented here.</span></div>)}{contract.recovery.map((item) => <div className="s5-error-row" key={item.code}><span>Platform recovery</span><code>{item.code}</code><span>{item.problemCodes.join(', ')}</span><span>{item.action} · retry: {item.retry.replaceAll('_', ' ')}</span></div>)}</div>
          </section>

          <section className="s5-contract-section" id="s5-replay">
            <SectionHead number="11" label="Idempotency & safe replay" title="The same bounded task does not silently become a second effect." copy="Where current OpenAPI requires an Idempotency-Key, that requirement is shown directly. Retention windows and scope are not invented." />
            <div className="s5-replay-shell"><div className="s5-replay-copy"><p className="s5-kicker">Replay contract</p><h3>Identity before retry.</h3><p>{contract.openapi.idempotencyRequired ? 'The current mapped HTTP route requires Idempotency-Key.' : 'No operation-specific idempotency header requirement is bound.'} Retention duration and account scope are not published on this page.</p><div className="s5-key-box">Operation: {contract.id}<br />Idempotency-Key: {contract.openapi.idempotencyRequired ? 'required · value supplied by caller' : 'not bound'}<br />Retention: not published<br />Unresolved settlement: retry blocked until reconciliation</div></div><div className="s5-replay-demo"><div className="s5-approval-head"><span>Replay · design fixture</span><div className={`s5-approval-state${replayed ? ' approved' : ''}`}><i /><b>{replayed ? 'Stored outcome returned' : executionState === 'unresolved' ? 'Retry blocked' : 'Awaiting verified fixture'}</b></div></div><div className="s5-charge-ledger"><div className="s5-charge-row"><span>Live execution</span><strong>None</strong></div><div className="s5-charge-row"><span>Fixture replay</span><strong>{replayed ? 'Matched' : 'Not requested'}</strong></div><div className="s5-charge-row no-charge"><span>Additional live charge</span><strong>None</strong></div></div><button className="b12-button b12-button-secondary b12-liquid" type="button" onClick={replayFixture}>Replay same fixture identity</button><p className="s5-replay-state">{executionState === 'unresolved' ? 'Unresolved fixture blocks retry until reconciliation.' : replayed ? 'Replay fixture returned the same conceptual outcome identity. No request or payment occurred.' : 'Run the verified design state first to demonstrate safe replay semantics.'}</p></div></div>
          </section>

          <section className="s5-contract-section" id="s5-history">
            <SectionHead number="12" label="Version history & related operations" title="Current version truth without invented history." copy="The current contract, catalog, pricing, and observation identifiers are visible. Historical operation versions remain unclaimed until a canonical history exists." />
            <div className="s5-two-col"><article className="s5-panel"><div className="s5-timeline"><div className="s5-version current"><div className="s5-version-head"><strong>Contract {contract.contractVersion}</strong><span>Current generated contract</span></div><p>Catalog {contract.catalogVersion}. OpenAPI {contract.openApiVersion}. Observed {contract.observedAt}.</p></div><div className="s5-version"><div className="s5-version-head"><strong>Operation history</strong><span>Not bound</span></div><p>No synthetic changelog, sunset date, compatibility window, or replacement history is generated here.</p></div></div></article><article className="s5-panel"><p className="s5-kicker">Current machine surfaces</p><h3>Inspect the source documents.</h3><div className="s5-task-examples"><a className="s5-task-example" href={contract.artifacts.catalog}>Catalog · {contract.catalogVersion}</a><a className="s5-task-example" href={contract.artifacts.openapi}>OpenAPI · {contract.openApiVersion}</a><a className="s5-task-example" href={contract.artifacts.pricing}>Pricing · observed {contract.price.observedAt}</a><a className="s5-task-example" href={contract.artifacts.status}>Status · observed {contract.statusObservedAt}</a></div></article></div>
            <div className="s5-related-grid">{contract.relatedOperationIds.map((id) => <article className="s5-related" key={id}><div><code>{id}</code><h3>{id}</h3><p>Canonical sibling operation in the {contract.familyLabel} family. Public contract fields remain independently bound.</p></div><Link to={`/operations/${id}`}>Open contract →</Link></article>)}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
