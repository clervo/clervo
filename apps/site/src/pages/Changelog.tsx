import { useEffect } from 'react';

import { ModeBadge } from '../components/Navigation';
import type { ExperiencePhase } from '../product';

export function Changelog({ onPhase }: { onPhase(phase: ExperiencePhase): void }) {
  useEffect(() => onPhase('verified'), [onPhase]);
  return (
    <section className="authority-page changelog-page">
      <header className="authority-intro"><ModeBadge>Repository history · no invented release claims</ModeBadge><p className="eyebrow">Changelog · version truth</p><h1>What changed, what broke, and what replaces it.</h1><p>Product, catalog, operation, pricing, schema, lifecycle, evidence, receipt, and recovery changes publish with dates, compatibility notes, migration guidance, and affected surfaces.</p></header>
      <section className="changelog-ledger"><article><time>2026-08-06</time><div><h2>Step 8 frontend implementation opened.</h2><p>The locked v4.0 identity and website authority entered repository implementation. Deployment and live operations remain separate gates.</p><ul><li>Hollow Apex shell and canonical navigation</li><li>Catalog, capability, operation, and changelog routes</li><li>Agent-native onboarding and trust-page alignment</li></ul></div><b>in progress</b></article><article><time>2026-08-05</time><div><h2>Steps 1–7G locked.</h2><p>Brand, architecture, coded compositions, responsive states, visual hardening, and mobile parity became design authority.</p></div><b>design authority</b></article></section>
    </section>
  );
}
