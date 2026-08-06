import { useEffect, useState } from 'react';

import { ModeBadge } from '../components/Navigation';
import type { ActivationState } from '../experience';
import { onboarding, type ExperiencePhase } from '../product';
import { Link } from '../router';

interface BrowserCheck { label: string; passed: boolean; evidence: string; }
const setupInstruction = `Review the Clervo setup plan for this environment. Show every file, package, and setting you intend to change. Ask for approval before installation. Install only approved components, verify the connection, load the catalog, and run one non-payable proof task. Do not connect a wallet or authorize spending.`;
const environments = [
  ['Codex', 'Agent-guided setup through the verified instruction.'],
  ['Claude Code', 'Planned MCP-compatible installation and verification path.'],
  ['Cursor', 'Editor-integrated agent environment with explicit plan review.'],
  ['Generic MCP', 'Manual client path with inspectable configuration details.'],
  ['Claude Desktop', 'Desktop route shown only after compatibility verification.'],
  ['TypeScript', 'SDK path for programmatic agents and bounded task calls.'],
  ['Python', 'SDK path with schema, quote, evidence, and receipt handling.'],
  ['HTTP / OpenAPI', 'Direct contract integration without a client assumption.'],
] as const;

function inspectBrowser(): BrowserCheck[] {
  return [
    { label: 'Deterministic hashing', passed: crypto?.subtle !== undefined, evidence: crypto?.subtle !== undefined ? 'window.crypto.subtle available' : 'Web Crypto unavailable' },
    { label: 'Bounded cancellation', passed: typeof AbortController === 'function', evidence: typeof AbortController === 'function' ? 'AbortController available' : 'AbortController unavailable' },
    { label: 'Contract transport', passed: typeof fetch === 'function', evidence: typeof fetch === 'function' ? 'Fetch API available' : 'Fetch API unavailable' },
  ];
}

export function Build({ activation, onPhase }: { activation: ActivationState; onPhase(phase: ExperiencePhase): void }) {
  const [checks, setChecks] = useState<BrowserCheck[] | null>(null);
  const [environment, setEnvironment] = useState('Codex');
  const [copied, setCopied] = useState(false);
  useEffect(() => onPhase(activation.receiptInspected ? 'receipt' : 'approval'), [activation.receiptInspected, onPhase]);
  const completed = { install: activation.selectedClient !== null, ask: activation.proofCompleted, fund: false, approve: activation.proofCompleted, result: activation.proofCompleted, receipt: activation.receiptInspected } as const;
  const current = activation.selectedClient === null ? 'install' : !activation.proofCompleted ? 'ask' : !activation.receiptInspected ? 'receipt' : null;
  const journeyLink = (step: keyof typeof completed) => {
    if (step === 'install') return { to: '/docs/http', label: activation.selectedClient ? 'Review client choices' : 'Choose an access path' };
    if (step === 'fund') return { to: '/pricing', label: 'Read the payment boundary' };
    return { to: '/proof', label: activation.proofCompleted ? 'Review fixture evidence' : 'Open Proof' };
  };
  const copyInstruction = async () => { await navigator.clipboard.writeText(setupInstruction); setCopied(true); window.setTimeout(() => setCopied(false), 1_800); };

  return (
    <section className="build-page authority-start-page">
      <header className="page-intro start-intro">
        <ModeBadge>Design fixture · no installation, wallet, or payment action</ModeBadge>
        <p className="eyebrow">Agent-native onboarding</p><h1>Set up Clervo in your agent.</h1>
        <p>One instruction. Your agent inspects the environment, shows the plan, asks before changing anything, verifies the connection, and gives you access to the complete six-family platform.</p>
        <p className="start-approval-note">No wallet action, payment, or standing spending permission happens without explicit approval.</p>
      </header>
      <section className="start-command-panel">
        <div><p className="eyebrow">Start with one instruction</p><h2>Let the agent handle setup. You keep approval authority.</h2><p>Installation can be immediate after review. Paid use appears only after value, with an exact quote, explicit approval, evidence, receipt, and safe replay behavior.</p></div>
        <pre><code>{setupInstruction}</code></pre><button className="liquid-capsule liquid-capsule--primary" type="button" onClick={copyInstruction}>{copied ? 'Instruction copied' : 'Copy instruction'}</button>
      </section>
      <section className="start-credit-panel"><div><p className="eyebrow">Optional program fixture</p><h2>Claim Founding Agent credits.</h2><p>Up to $25 in usage-only task credits. Eligibility, allocation, expiration, and terms must bind to real program data before launch.</p></div><Link className="liquid-capsule liquid-capsule--secondary" to="/pricing">Preview credit path</Link></section>
      <section className="environment-section">
        <header><p className="eyebrow">Environment confidence</p><h2>Start where your agent already works.</h2><p>Prominent support appears only after clean-machine installation, verification, first-task, recovery, and rollback paths pass. Every option below is labeled as a fixture.</p></header>
        <div className="environment-grid">{environments.map(([name, description], index) => <button key={name} type="button" className={environment === name ? 'is-selected' : ''} onClick={() => setEnvironment(name)}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{name}</b><small>{name === 'Codex' ? 'Selected fixture' : 'Design fixture'}</small><p>{description}</p></div></button>)}</div>
        <p className="environment-selection">Selected environment fixture: <b>{environment}</b>. Selection does not install or modify anything.</p>
      </section>
      <section className="journey-section">
        <header><p className="eyebrow">Operate → Prove</p><h2>From environment detection to a proven first task.</h2><p>The journey below preserves human approvals and agent responsibilities without pretending a public endpoint, wallet, or settlement path exists.</p></header>
        <ol className="activation-journey">{onboarding.journey.map((item, index) => { const link = journeyLink(item.step); const isComplete = completed[item.step]; return <li key={item.step} className={isComplete ? 'is-complete' : current === item.step ? 'is-current' : item.state === 'unavailable' ? 'is-blocked' : ''}><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{item.step}</h2><p>{item.action}</p><Link to={link.to}>{link.label}</Link></div><b>{isComplete ? 'proven locally' : item.state.replaceAll('_', ' ')}</b></li>; })}</ol>
      </section>
      <section className="recovery-contract"><header><div><p className="eyebrow">Recovery contract</p><h2>Failure stays legible.</h2></div><p>Every failure answers whether installation happened, execution happened, money moved, retry is safe, and what the user should do next.</p></header><div>{onboarding.recovery.map((item, index) => <article key={item.code}><span>{String(index + 1).padStart(2, '0')}</span><h3>{item.code.replaceAll('_', ' ')}</h3><p>{item.action}</p><b>{item.retry.replaceAll('_', ' ')}</b></article>)}</div></section>
      <section className="browser-preflight"><div><p className="eyebrow">This browser only</p><h2>Inspect fixture prerequisites.</h2><p>This does not inspect Node, Python, MCP, a wallet, or a public Clervo service.</p><button className="liquid-capsule liquid-capsule--secondary" type="button" onClick={() => setChecks(inspectBrowser())}>Run browser preflight</button></div><div aria-live="polite">{checks === null ? <p>No checks run.</p> : checks.map((check) => <article key={check.label} className={check.passed ? 'is-pass' : 'is-fail'}><span aria-hidden="true" /><div><b>{check.label}</b><small>{check.evidence}</small></div><strong>{check.passed ? 'PASS' : 'FAIL'}</strong></article>)}</div></section>
    </section>
  );
}
