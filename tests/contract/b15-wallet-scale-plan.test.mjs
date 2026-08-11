import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const plan = JSON.parse(await readFile('packages/catalog/connect-wallet-scale-benchmark-plan.v1.json', 'utf8'));
const roadmap = await readFile('ROADMAP.md', 'utf8');

test('B15 is an unexecuted 10,000 synthetic-wallet qualification, never a customer claim', () => {
  assert.equal(plan.schemaVersion, 'clervo.connect-wallet-scale-benchmark-plan.v1');
  assert.equal(plan.milestone, 'B15');
  assert.equal(plan.state, 'planned_not_executed');
  assert.equal(plan.scope.syntheticWallets, 10000);
  assert.equal(plan.scope.independentClervoHomes, 10000);
  assert.deepEqual(
    [plan.scope.walletsAreCustomers, plan.scope.walletsAreUsers, plan.scope.revenueEvidence, plan.scope.demandEvidence],
    [false, false, false, false],
  );
  assert.match(roadmap, /10,000-Wallet Connect Scale Qualification \(B15\)/u);
  assert.match(roadmap, /planned and unexecuted/u);
});

test('B15 local qualification creates no network, payment, USDC, or gas effect', () => {
  const local = plan.phases.find(({ id }) => id === 'local_wallet_qualification');
  assert.deepEqual(
    { wallets: local.wallets, networkCalls: local.networkCalls, paymentEffects: local.paymentEffects, maximumUsdcAtomic: local.maximumUsdcAtomic, maximumGasWei: local.maximumGasWei },
    { wallets: 10000, networkCalls: 0, paymentEffects: 0, maximumUsdcAtomic: '0', maximumGasWei: '0' },
  );
});

test('B15 paid reference math is bounded but grants no spending authorization', () => {
  const paid = plan.costModel.paidReference;
  assert.equal(BigInt(paid.currentObservedAmountAtomicPerWallet) * BigInt(paid.wallets), BigInt(paid.maximumTotalUsdcAtomic));
  assert.equal(paid.maximumTotalUsdcAtomic, '10000000');
  assert.equal(paid.maximumTotalUsdc, '10.000000');
  assert.equal(plan.phases.find(({ id }) => id === 'production_paid_ramp').authorizationGranted, false);
  assert.equal(plan.authority.mustObtainNewBoundedOwnerAuthorizationBeforeAnyPaidPhase, true);
  assert.equal(plan.authority.mustRevalidateRuntimeQuoteBeforeExecution, true);
});

test('B15 gas extrapolation is arithmetically exact and never represented as a live quote', () => {
  const gas = plan.costModel.gasReference;
  assert.equal(BigInt(gas.observedFundingGasWeiPerWallet) * 10000n, BigInt(gas.extrapolatedFundingGasWei));
  assert.equal(BigInt(gas.observedSettlementGasWeiPerWallet) * 10000n, BigInt(gas.extrapolatedSettlementGasWei));
  assert.equal(BigInt(gas.extrapolatedFundingGasWei) + BigInt(gas.extrapolatedSettlementGasWei), BigInt(gas.extrapolatedUnderlyingTotalGasWei));
  assert.equal(gas.notAGasQuote, true);
  assert.equal(gas.exactFundingGasBudgetPendingBatchDesignAndLivePreflight, true);
  assert.equal(gas.individualMetaMaskPromptsProhibited, true);
});

test('B15 requires exact rate denominators, no duplicate effects, and no secrets', () => {
  assert.equal(plan.successGates.walletCreationAttempts, 10000);
  assert.equal(plan.successGates.exactAttemptAndSuccessCountsRequired, true);
  assert.equal(plan.successGates.duplicateAuthorizationCount, 0);
  assert.equal(plan.successGates.duplicateSettlementCount, 0);
  assert.equal(plan.successGates.duplicateChargeCount, 0);
  assert.equal(plan.successGates.unreconciledAtClosure, 0);
  const serialized = JSON.stringify(plan);
  assert.doesNotMatch(serialized, /0x[a-f0-9]{40}|privateKey|recoveryPhrase|mnemonic/iu);
});
