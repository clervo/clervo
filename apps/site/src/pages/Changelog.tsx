import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import type { ExperiencePhase } from '../product';

export function Changelog({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('verified'), [onPhase]);
  return (
    <section className="authority-page changelog-page">
      <header className="authority-intro">
        <ModeBadge>Repository history · no invented release claims</ModeBadge>
        <p className="eyebrow">Changelog / controlled truth</p>
        <h1>Changes should be inspectable.<br />Claims should be earned.</h1>
        <p>This surface will derive public release notes from reviewed repository changes. It does not treat design completion or a local release candidate as a public launch.</p>
      </header>
      <section className="changelog-ledger">
        <article><time>2026-08-06</time><div><h2>Step 8 implementation opened</h2><p>The locked v4.0 identity and website authority entered repository implementation. Deployment and live operations remain separate gates.</p></div><b>in progress</b></article>
        <article><time>2026-08-05</time><div><h2>Steps 1–7G locked</h2><p>Brand, site architecture, coded compositions, responsive states, visual hardening, and mobile parity were approved as design authority.</p></div><b>design authority</b></article>
      </section>
    </section>
  );
}
