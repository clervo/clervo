#!/usr/bin/env node

import { evaluatePrivateStabilityCampaign, runPrivateStabilityDrills } from '../../dist/services/workflows/src/stability.js';

const observations = await runPrivateStabilityDrills();
const campaign = evaluatePrivateStabilityCampaign(observations);
console.log(JSON.stringify({
  schemaVersion: 'clervo.private-stability-report.v1',
  evaluatedAt: new Date().toISOString(),
  passed: campaign.passed,
  realPaymentUsed: false,
  productionMutationUsed: false,
  results: campaign.results,
}, null, 2));
if (!campaign.passed) process.exitCode = 1;
