import { useEffect, useMemo, useRef, useState } from 'react';

import type { ExperiencePhase } from '../product';
import '../styles/b12/start.css';

const SETUP_INSTRUCTION = 'Set up Clervo using https://clervo.dev/skill.md';

const FAMILY_NAMES = ['Search', 'AI', 'Secure Sandbox', 'Multi-chain RPC', 'Prediction', 'Crypto Intelligence'] as const;

const environments = [
  ['Codex', 'CX', 'Selected fixture', 'Agent-guided setup through the locked skill instruction.'],
  ['Claude Code', 'CC', 'Design fixture', 'MCP-compatible onboarding structure with explicit plan review.'],
  ['Cursor', 'CR', 'Design fixture', 'Editor-integrated agent environment with explicit plan review.'],
  ['Generic MCP', 'MP', 'Design fixture', 'Manual environment path with inspectable configuration details.'],
  ['Claude Desktop', 'CD', 'Design fixture', 'Desktop client route shown only after compatibility verification.'],
  ['TypeScript', 'TS', 'Design fixture', 'Programmatic agent path; package identity and version are not claimed here.'],
  ['Python', 'PY', 'Design fixture', 'SDK-shaped path with schema, quote, evidence, and receipt handling.'],
  ['HTTP / OpenAPI', 'API', 'Design fixture', 'Direct contract integration without an agent-client assumption.'],
] as const;

type Tone = 'cyan' | 'gold';
type Stage = {
  id: string;
  pill: string;
  kicker: string;
  title: string;
  tone: Tone;
  description: string;
  primary: string;
  secondary: string;
  note: string;
};

const stages: readonly Stage[] = [
  { id: 'Environment · fixture', pill: 'Environment found', kicker: 'Screen 1 · Detect', title: 'Environment found.', tone: 'cyan', description: 'Clervo identifies the selected prototype client, runtime, supported route, and any existing configuration before proposing a change.', primary: 'Show installation plan', secondary: 'Choose manually', note: 'Nothing has been installed. Detection is read-only in this design fixture.' },
  { id: 'Installation plan · fixture', pill: 'Approval required', kicker: 'Screen 2 · Plan', title: 'Review the exact change before it happens.', tone: 'cyan', description: 'The agent names the interface, version, configuration location, required secrets, rollback method, and whether any payment action is involved.', primary: 'Approve fixture plan', secondary: 'Show technical details', note: 'Installation remains blocked until the visible fixture plan is approved.' },
  { id: 'Install · fixture', pill: 'Installing', kicker: 'Screen 3 · Install', title: 'The agent handles setup. The human keeps the boundary.', tone: 'cyan', description: 'Technical detail stays collapsed by default while the design reports a calm, outcome-oriented progress sequence.', primary: 'Complete fixture install', secondary: 'Pause', note: 'No payment or standing permission is part of installation.' },
  { id: 'Verification · fixture', pill: 'Clervo connected', kicker: 'Screen 4 · Verify', title: 'Clervo connected.', tone: 'gold', description: 'Installation is complete only after identity, version, provenance, connection, catalog, availability, and the no-unapproved-action boundary all pass.', primary: 'Run my first fixture task', secondary: 'Installation details', note: 'Gold here represents the verified design state only; no live connection is claimed.' },
  { id: 'Catalog · fixture', pill: 'Six families loaded', kicker: 'Screen 5 · Catalog', title: 'What should your agent accomplish first?', tone: 'cyan', description: 'Natural language resolves to an exact operation while all six permanent capability families remain visible as one platform.', primary: 'Run free fixture task', secondary: 'Choose another', note: 'The first task is an onboarding example, not Clervo’s product identity or launch wedge.' },
  { id: 'First task · fixture', pill: 'Qualifying', kicker: 'Screen 5 · First task', title: 'The task is bounded before it runs.', tone: 'cyan', description: 'Clervo preserves intent, resolves one operation pattern, checks lifecycle and policy, and states what the result will contain.', primary: 'Complete fixture task', secondary: 'Stop task', note: 'Gold remains withheld until result, evidence, and replay identity resolve.' },
  { id: 'First result · fixture', pill: 'Result ready', kicker: 'Screen 6 · First result', title: 'Your first Clervo result is ready.', tone: 'gold', description: 'Value appears before architecture. The result stack then exposes evidence, route identity, time, cost, and verification state.', primary: 'Understand paid use', secondary: 'Inspect evidence', note: 'This is a labeled fixture result, not customer usage or demand evidence.' },
  { id: 'Paid use · fixture', pill: 'Education only', kicker: 'Screen 7 · Paid use', title: 'Pay only when the task requires it.', tone: 'cyan', description: 'Payment context appears after value. The human sees what would be purchased, the maximum charge, asset and network, and the approval scope.', primary: 'Review example quote', secondary: 'Explore catalog', note: 'There is no global wallet-connect action and no live payment action on this page.' },
  { id: 'Quote · fixture', pill: 'Approval required', kicker: 'Screen 8 · Approve', title: 'Approve this task.', tone: 'cyan', description: 'The quote is an outcome contract, not a crypto transaction form. Approval applies only to this fixture task and fixture maximum.', primary: 'Approve fixture task', secondary: 'Cancel', note: 'Price, asset, network, expiry, and provider values are fixture-only.' },
  { id: 'Execution · fixture', pill: 'Verifying', kicker: 'Screen 9 · Execute', title: 'Qualifying → Executing → Verifying.', tone: 'cyan', description: 'The default view stays outcome-oriented while technical detail remains available on demand. The irreversible boundary stays visible.', primary: 'Resolve fixture proof', secondary: 'View technical details', note: 'Retry remains blocked while execution or settlement is unknown.' },
  { id: 'Proof · fixture', pill: 'Verified result', kicker: 'Screen 10 · Prove', title: 'Verified result.', tone: 'gold', description: 'Gold is earned only after the fixture result, evidence, exact cost, receipt, and replay state resolve together.', primary: 'Replay safely', secondary: 'Inspect full receipt', note: 'This design fixture performs no transaction and does not represent live catalog, provider, price, or customer data.' },
];

const journeyLabels = ['Detect', 'Plan', 'Install', 'Verify', 'Catalog', 'First task', 'First result', 'Paid use', 'Approve', 'Execute', 'Proof'] as const;

const recoveryStates = [
  { name: 'Verification failed', tone: 'red', code: 'State · installation failed · fixture', title: 'Connection verification failed.', description: 'The interface was installed in this hypothetical state, but verification did not pass. No task executed and no money moved.', facts: [['Installation', 'Occurred · fixture'], ['Execution', 'Did not occur'], ['Money moved', '$0.00 · fixture']], next: 'Next: inspect diagnostics, correct configuration, or use rollback. Retry is safe after the cause is resolved.' },
  { name: 'Environment unsupported', tone: 'red', code: 'State · unsupported environment · fixture', title: 'This environment is not verified.', description: 'Clervo must not imply compatibility. The design offers a manual route, another verified environment, or a clean stop.', facts: [['Installation', 'Did not occur'], ['Execution', 'Did not occur'], ['Retry', 'Choose another route']], next: 'Next: select a verified environment or follow an explicitly labeled manual path.' },
  { name: 'Quote expired', tone: 'red', code: 'State · quote expired · fixture', title: 'The quote expired before approval.', description: 'Nothing executed and no money moved. Clervo requests a new quote rather than silently changing price, asset, network, or provider.', facts: [['Execution', 'Did not occur'], ['Money moved', '$0.00 · fixture'], ['Retry', 'Safe with new quote']], next: 'Next: request a fresh quote and review the new maximum before approval.' },
  { name: 'Wrong network / asset', tone: 'red', code: 'State · payment mismatch · fixture', title: 'The approved payment route does not match.', description: 'Clervo refuses to switch networks or assets silently. The task remains blocked and the mismatch stays explicit.', facts: [['Execution', 'Blocked'], ['Money moved', '$0.00 · fixture'], ['Retry', 'After correction']], next: 'Next: correct the network or asset, then request a new exact quote.' },
  { name: 'User rejected', tone: 'red', code: 'State · approval rejected · fixture', title: 'The user declined the task.', description: 'The refusal is complete: no provider call, no charge, and no standing permission was created.', facts: [['Execution', 'Did not occur'], ['Money moved', '$0.00 · fixture'], ['Retry', 'Safe']], next: 'Next: change the task or policy, or close the flow.' },
  { name: 'Settlement unresolved', tone: 'cyan', code: 'State · reconciliation required · fixture', title: 'Settlement is unresolved.', description: 'Execution or payment status is uncertain. Clervo blocks a new idempotency key and withholds gold until reconciliation completes.', facts: [['Execution', 'Unknown'], ['Money moved', 'Unknown'], ['Retry', 'Blocked']], next: 'Next: reconcile the original receipt identity. Do not repeat the task with a new key.' },
  { name: 'Safe replay', tone: 'gold', code: 'State · replay protected · fixture', title: 'The existing result is returned safely.', description: 'The same fixture task identity resolves to the completed fixture result without another provider call or duplicate charge.', facts: [['Execution', 'Not repeated'], ['Additional charge', '$0.00 · fixture'], ['Receipt', 'Original fixture returned']], next: 'Next: use the existing result or inspect its evidence and receipt.' },
] as const;

function Shield() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.6 2.7 8 7 10 4.3-2 7-5.4 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-5" /></svg>;
}

function StageContent({ index, selectedEnv }: { index: number; selectedEnv: string }) {
  const [logsOpen, setLogsOpen] = useState(false);
  const [family, setFamily] = useState(FAMILY_NAMES[0]);
  const [resolved, setResolved] = useState(false);
  useEffect(() => { setLogsOpen(false); setResolved(false); }, [index]);

  if (index === 0) return <><div className="fact-grid"><div className="fact"><span>Client</span><strong>{selectedEnv} · fixture</strong></div><div className="fact"><span>Support state</span><strong className="cyan">Design target</strong></div><div className="fact"><span>Existing config</span><strong>None detected · fixture</strong></div><div className="fact"><span>Action so far</span><strong>Read-only detection</strong></div></div><div className="safety-note"><Shield /><span>No package, file, credential, wallet, or payment action has occurred. Unsupported clients must move to a truthful manual or unsupported state.</span></div></>;
  if (index === 1) return <><div className="plan-list"><div className="plan-row"><span>Interface</span><strong>Clervo agent interface <em>· exact production identity required</em></strong></div><div className="plan-row"><span>Version</span><strong>Prototype value withheld <em>· bind to canonical release</em></strong></div><div className="plan-row"><span>Files or settings</span><strong>{selectedEnv} configuration <em>· preview before write</em></strong></div><div className="plan-row"><span>Credentials</span><strong>None requested by this fixture <em>· secrets never requested in chat</em></strong></div><div className="plan-row"><span>Rollback</span><strong>Restore previous configuration and remove installed interface</strong></div><div className="plan-row"><span>Wallet or payment</span><strong>No action involved</strong></div></div><div className="safety-note"><Shield /><span>Approval applies only to this visible plan. Broad or destructive changes require a separate confirmation.</span></div></>;
  if (index === 2 || index === 9) {
    const execution = index === 9;
    return <><div className="progress-stack">{(execution ? [['Qualifying','100%','Passed'],['Executing','100%','Passed'],['Verifying','72%','72%'],['Receipt','16%','Preparing']] : [['Detect','100%','Passed'],['Install','76%','76%'],['Verify','0%','Waiting'],['First task','0%','Waiting'],['Proof','0%','Waiting']]).map(([label,width,state]) => <div className="progress-row" key={label}><span>{label}</span><div className="progress-track"><i style={{ width }} /></div><b>{state}</b></div>)}</div>{execution ? <div className="safety-note"><Shield /><span>Fixture boundary: one task, maximum ≤ $0.02 USDC, Base fixture network, no write permission, same replay identity.</span></div> : null}<button className="log-toggle" type="button" onClick={() => setLogsOpen((value) => !value)}>{logsOpen ? 'Hide technical details' : execution ? 'Show technical details' : 'Show technical logs'}</button><pre className={`log-panel${logsOpen ? ' open' : ''}`}>{execution ? '[fixture] quote identity locked\n[fixture] provider route qualified\n[fixture] execution returned\n[fixture] evidence verification in progress\n[fixture] receipt reconciliation pending' : '[fixture] installation plan approved\n[fixture] resolving canonical interface identity\n[fixture] writing scoped configuration\n[fixture] rollback point preserved'}</pre></>;
  }
  if (index === 3) return <><div className="fact-grid"><div className="fact"><span>Interface</span><strong className="gold">Installed · fixture</strong></div><div className="fact"><span>Version</span><strong className="gold">Verified · fixture</strong></div><div className="fact"><span>Catalog</span><strong className="gold">Loaded · fixture</strong></div><div className="fact"><span>Connection</span><strong className="gold">Passed · fixture</strong></div></div><div className="result-stack"><div className="result-layer"><span>Identity</span><strong>Clervo source and provenance verified</strong><small>Fixture</small></div><div className="result-layer"><span>Wallet / payment</span><strong>No unapproved action occurred</strong><small>$0.00 · fixture</small></div><div className="result-layer verified"><span>Verification state</span><strong>Environment ready for catalog inspection</strong><small>Verified fixture</small></div></div></>;
  if (index === 4) return <><div className="task-input"><input aria-label="Describe a fixture task" readOnly value="Research an on-chain protocol and verify its current claims" /><button type="button" onClick={() => setResolved(true)}>{resolved ? 'Resolved' : 'Resolve task'}</button></div><div className="family-strip">{FAMILY_NAMES.map((name) => <button className={`family-chip${family === name ? ' active' : ''}`} key={name} type="button" onClick={() => setFamily(name)}>{name}</button>)}</div><div className="resolution"><div className="resolution-main"><span>Resolved operation pattern · fixture</span><h4>Verify a protocol claim with current evidence</h4><p>Combines current sources, explicit chain state, and risk signals. Production must resolve to canonical operation identities and lifecycle truth.</p></div><div className="resolution-meta"><div><span>Selected family</span><strong>{family}</strong></div><div><span>Expected result</span><strong>Evidence-backed brief</strong></div><div><span>Latency</span><strong>Fixture · not claimed</strong></div><div><span>Price state</span><strong>Free demo fixture</strong></div></div></div></>;
  if (index === 5) return <><div className="plan-list"><div className="plan-row"><span>Task</span><strong>Research an on-chain protocol and verify its current claims</strong></div><div className="plan-row"><span>Qualified families</span><strong>Search + Multi-chain RPC + Crypto Intelligence <em>· fixture route</em></strong></div><div className="plan-row"><span>Result contract</span><strong>Summary, cited evidence, route identity, cost, receipt, replay state</strong></div><div className="plan-row"><span>Price state</span><strong>Free onboarding fixture <em>· no wallet or payment</em></strong></div></div><div className="progress-stack"><div className="progress-row"><span>Qualify</span><div className="progress-track"><i style={{ width: '100%' }} /></div><b>Passed</b></div><div className="progress-row"><span>Execute</span><div className="progress-track"><i style={{ width: '68%' }} /></div><b>Running</b></div><div className="progress-row"><span>Verify</span><div className="progress-track"><i style={{ width: '18%' }} /></div><b>Pending</b></div></div></>;
  if (index === 6 || index === 10) {
    const proof = index === 10;
    return <div className="result-stack"><div className="result-layer verified"><span>Result</span><strong>{proof ? 'Current protocol claims checked and summarized.' : 'Current claims checked against public sources and chain state.'}</strong><small>Fixture output</small></div><div className="result-layer verified"><span>Evidence</span><strong>12 source references + 3 chain-state checks</strong><small>Fixture values</small></div>{proof ? <><div className="result-layer verified"><span>Cost</span><strong>$0.018 USDC</strong><small>Fixture charge</small></div><div className="result-layer verified"><span>Receipt</span><strong>Operation, payment, settlement, and replay identity resolved</strong><small>RCP-START-7B · fixture</small></div><div className="result-layer verified"><span>Safe replay</span><strong>Existing result returns without duplicate provider call or charge</strong><small>$0.00 additional · fixture</small></div></> : <><div className="result-layer"><span>Operation / route</span><strong>Search + RPC + Crypto Intelligence</strong><small>Fixture route</small></div><div className="result-layer"><span>Time / cost</span><strong>Demonstration only · no payment</strong><small>$0.00 · fixture</small></div><div className="result-layer verified"><span>Verification</span><strong>Result, evidence, and replay identity resolved</strong><small>Verified fixture</small></div></>}</div>;
  }
  if (index === 7) return <><div className="fact-grid"><div className="fact"><span>Purchase</span><strong>One bounded task outcome</strong></div><div className="fact"><span>Charge</span><strong>Fixed or maximum, shown first</strong></div><div className="fact"><span>Asset / network</span><strong>Explicit where relevant</strong></div><div className="fact"><span>Approval</span><strong>Per-call by default</strong></div></div><div className="plan-list"><div className="plan-row"><span>Credits</span><strong>Usage-only balance may contribute when a real program is valid</strong></div><div className="plan-row"><span>Wallet funds</span><strong>Never connected or moved without context and approval</strong></div><div className="plan-row"><span>Wrong network / asset</span><strong>Refuse or recover explicitly; never silently switch</strong></div><div className="plan-row"><span>Unknown settlement</span><strong>Block retry until reconciliation resolves</strong></div></div></>;
  return <div className="quote-card"><div className="quote-head"><div><h4>Verify a protocol claim with current evidence</h4><p>Operation and provider identities must bind to canonical runtime truth.</p></div><div className="quote-price"><span>Maximum charge</span><strong>≤ $0.02 USDC</strong><small>Fixture</small></div></div><div className="quote-grid">{[['Network','Base · fixture'],['Quote expiry','90 seconds · fixture'],['Expected latency','Value withheld'],['Evidence / receipt','Required'],['Credit contribution','$0.00 · fixture'],['Idempotency','Same identity, no duplicate charge'],['Approval scope','This fixture task only'],['Standing permission','None']].map(([label,value]) => <div className="quote-item" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p className="quote-note">Fixture values demonstrate the approval contract. They do not represent live pricing, network selection, or an executable quote.</p></div>;
}

export function Start({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  const [selectedEnv, setSelectedEnv] = useState('Codex');
  const [stage, setStage] = useState(0);
  const [recovery, setRecovery] = useState(0);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'blocked'>('idle');
  const journeyRef = useRef<HTMLElement>(null);
  const recoveryRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);

  useEffect(() => onPhase(stages[stage]?.tone === 'gold' ? 'verified' : stage >= 8 ? 'approval' : 'qualified'), [onPhase, stage]);

  useEffect(() => {
    if (!matchMedia('(max-width: 780px)').matches) return;
    const active = journeyRef.current?.querySelector<HTMLElement>('.journey-step.current');
    active?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
  }, [stage]);

  useEffect(() => {
    if (!matchMedia('(max-width: 780px)').matches) return;
    const active = recoveryRef.current?.querySelector<HTMLElement>('.state-button.active');
    active?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
  }, [recovery]);

  const currentStage = stages[stage] ?? stages[0]!;
  const recoveryState = recoveryStates[recovery] ?? recoveryStates[0]!;
  const journeyCount = useMemo(() => `${String(stage + 1).padStart(2, '0')} / ${String(stages.length).padStart(2, '0')}`, [stage]);

  const copyInstruction = async () => {
    try { await navigator.clipboard.writeText(SETUP_INSTRUCTION); setCopied('copied'); }
    catch { setCopied('blocked'); }
  };

  const begin = () => { setStage(0); workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <div className="b12-start" data-start-stage={stage}>
      <section className="hero shell b12-start-hero" id="entry">
        <div className="command-wrap hero-command">
          <div className="command-label"><span>Agent instruction</span><span>Prototype path</span></div>
          <div className="command"><code>{SETUP_INSTRUCTION}</code><button className="copy-button clervo-liquid" data-liquid="secondary" type="button" onClick={copyInstruction}>{copied === 'copied' ? 'Copied' : 'Copy instruction'}</button></div>
          <p className="entry-note" aria-live="polite">{copied === 'blocked' ? 'Clipboard access was blocked. Select the instruction manually.' : 'Design prototype only. No installation, account, wallet, package publication, or payment readiness is claimed by this page.'}</p>
        </div>
        <div className="hero-copy">
          <p className="eyebrow">Agent-native onboarding</p>
          <h1>Set up Clervo<br />in your agent.</h1>
          <p className="lede">One instruction. Your agent follows a bounded setup plan, verifies the connection, and exposes the complete six-family Clervo platform.</p>
          <p className="trust-line"><Shield /><span>No wallet action, payment, standing spending permission, or destructive change happens without explicit approval.</span></p>
          <div className="expectation" aria-label="Three step expectation"><b>Install Clervo</b><span>→</span><b>Run a verified task</b><span>→</span><b>Pay only when needed</b></div>
        </div>
        <div className="hero-stage">
          <div className="entry-shell">
            <div className="entry-top"><span>Choose how to begin</span><span className="mode"><i />Prototype paths</span></div>
            <div className="path-grid">
              <article className="path-card credits"><div className="path-label"><span>Optional path</span><span className="fixture-tag">Program fixture</span></div><h2>Claim Founding Agent credits</h2><p>Up to $25 in usage-only task credits is a design fixture. Eligibility, allocation, expiration, and terms require real program authority before launch.</p><div className="path-action"><button className="text-action clervo-liquid" data-liquid="quiet" type="button" onClick={begin}>Preview credit path <span>→</span></button></div></article>
              <article className="path-card install"><div className="path-label"><span>No login · fixture</span><span>Setup path</span></div><h2>Install now</h2><p>Paste one instruction into your agent. The locked flow detects the environment, shows the plan, and asks before changing anything.</p><div className="path-action"><button className="text-action clervo-liquid" data-liquid="quiet" type="button" onClick={begin}>Start setup <span>→</span></button></div></article>
            </div>
          </div>
        </div>
      </section>

      <section className="section b12-start-section" id="environments"><div className="shell"><div className="section-head"><div><p className="kicker">Environment confidence</p><h2>Start where your agent already works.</h2></div><p className="section-copy">Prominent production support requires exact clean-machine installation, verification, recovery, and rollback proof. Every environment below is a design fixture, not a compatibility claim.</p></div><div className="environment-grid" role="listbox" aria-label="Prototype environment selector">{environments.map(([name,icon,status,copy]) => <button aria-selected={selectedEnv === name} className={`env-card${selectedEnv === name ? ' active' : ''}`} key={name} role="option" type="button" onClick={() => setSelectedEnv(name)}><div className="env-top"><span className="env-icon">{icon}</span><span className="env-status">{selectedEnv === name ? 'Selected fixture' : status}</span></div><h3>{name}</h3><p>{copy}</p></button>)}</div><p className="env-disclaimer">Compatibility, package publication, version, setup-time, and supported-client values are intentionally not claimed by this design fixture.</p></div></section>

      <section className="section workspace-section b12-start-section" id="workspace" ref={workspaceRef}><div className="shell"><div className="workspace-intro"><div><p className="kicker">Operate → Prove</p><h2>From environment detection to a proven first task.</h2></div><p>The surface below is an interactive design fixture. It demonstrates required human approvals and agent responsibilities without installing software or executing a transaction.</p></div><div className="workspace"><aside className="journey" aria-label="Onboarding journey" ref={journeyRef}><div className="journey-head"><span>Setup journey</span><b>{journeyCount}</b></div><div className="journey-list">{journeyLabels.map((label,index) => <button className={`journey-step${index === stage ? ' current' : ''}${index < stage ? ' complete' : ''}${(index === 3 || index === 6 || index === 10) && index <= stage ? ' verified' : ''}`} data-start-stage-button={index} key={label} type="button" onClick={() => setStage(index)}><span className="journey-dot">{String(index + 1).padStart(2, '0')}</span><span><strong>{label}</strong><small>{index === 3 || index === 6 || index === 10 ? 'Verified fixture state' : 'Fixture stage'}</small></span></button>)}</div></aside><section className="stage-panel" data-stage-index={stage} data-tone={currentStage.tone} aria-live="polite"><div className="stage-bar"><span className="stage-id">{currentStage.id}</span><span className="state-pill"><i /><b>{currentStage.pill}</b></span></div><div className="stage-body"><p className="stage-kicker">{currentStage.kicker}</p><h3 className="stage-title">{currentStage.title}</h3><p className="stage-description">{currentStage.description}</p><div className="stage-content"><StageContent index={stage} selectedEnv={selectedEnv} /></div></div><div className="stage-actions"><p className="action-note">{currentStage.note}</p><div className="button-group"><button className="ghost-button clervo-liquid" data-liquid="secondary" disabled={stage === 0} type="button" onClick={() => setStage((value) => Math.max(0, value - 1))}>Back</button><button className="secondary-button clervo-liquid" data-liquid="secondary" type="button" onClick={() => stage === 8 ? setStage(7) : stage === 0 ? document.querySelector('#environments')?.scrollIntoView({ behavior: 'smooth' }) : undefined}>{currentStage.secondary}</button><button className="primary-button clervo-liquid" data-liquid="primary" type="button" onClick={() => setStage((value) => Math.min(stages.length - 1, value + 1))}>{stage === stages.length - 1 ? 'Existing fixture result returned' : currentStage.primary}</button></div></div></section></div></div></section>

      <section className="section state-section b12-start-section" id="states"><div className="shell"><div className="section-head"><div><p className="kicker">Recovery contract</p><h2>Failure stays legible.</h2></div><p className="section-copy">Every fixture failure answers the same questions: did installation happen, did execution happen, did money move, is retry safe, and what should the user do next?</p></div><div className="state-inspector"><div className="state-list" ref={recoveryRef}><h3>Inspect required states</h3>{recoveryStates.map((item,index) => <button className={`state-button${index === recovery ? ' active' : ''}`} data-tone={item.tone} key={item.name} type="button" onClick={() => setRecovery(index)}><span>{item.name}</span><i /></button>)}</div><div className="state-view" data-tone={recoveryState.tone}><span className="state-code">{recoveryState.code}</span><h3>{recoveryState.title}</h3><p>{recoveryState.description}</p><div className="state-facts">{recoveryState.facts.map(([label,value]) => <div className="state-fact" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><p className="state-next">{recoveryState.next}</p></div></div></div></section>

      <section className="section b12-start-section" id="final"><div className="shell final"><div><p className="kicker">Start with one instruction</p><h2>Let the agent handle setup. You keep approval authority.</h2><p className="section-copy">Installation can be immediate only when real compatibility and package truth prove it. Credits remain optional. Paid use appears only after value, with an exact quote, explicit approval, evidence, receipt, and safe replay behavior.</p></div><div className="final-command"><div className="command-label"><span>Canonical design instruction</span><span>Prototype path</span></div><div className="command"><code>{SETUP_INSTRUCTION}</code><button className="copy-button clervo-liquid" data-liquid="secondary" type="button" onClick={copyInstruction}>{copied === 'copied' ? 'Copied' : 'Copy instruction'}</button></div><p className="entry-note">This page does not contact clervo.dev, install a package, connect a wallet, or modify the local environment.</p></div></div></section>
    </div>
  );
}
