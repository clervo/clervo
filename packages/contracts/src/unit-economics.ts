export const UNIT_ECONOMICS_VERSION = 'clervo.unit-economics.v1' as const;

export interface UnitEconomicsInput {
  productId: string;
  priceVersion: string;
  customerPriceMicrousd: number;
  supplierCostCeilingMicrousd: number;
  infrastructureCostCeilingMicrousd: number;
  failureReserveMicrousd: number;
  paymentReconciliationCostCeilingMicrousd: number;
  targetContributionMicrousd: number;
  competitiveCeilingMicrousd: number;
  supplierCostBounded: boolean;
  promotionalCreditsExcluded: boolean;
}

export interface UnitEconomicsDecision extends UnitEconomicsInput {
  schemaVersion: typeof UNIT_ECONOMICS_VERSION;
  requiredPriceMicrousd: number;
  contributionAtCeilingsMicrousd: number;
  contributionBasisPoints: number;
  postCreditViable: boolean;
  competitivelyPriced: boolean;
  paidActivationAllowed: boolean;
  failureCodes: readonly string[];
}

export function evaluateUnitEconomics(input: UnitEconomicsInput): Readonly<UnitEconomicsDecision> {
  assertIdentifier(input.productId, 'productId');
  assertIdentifier(input.priceVersion, 'priceVersion');
  for (const [name, value] of Object.entries(input)) {
    if (name.endsWith('Microusd') && (!Number.isSafeInteger(value) || (value as number) < 0)) {
      throw new TypeError(`unit_economics_${name}_invalid`);
    }
  }
  const requiredPriceMicrousd = input.supplierCostCeilingMicrousd
    + input.infrastructureCostCeilingMicrousd
    + input.failureReserveMicrousd
    + input.paymentReconciliationCostCeilingMicrousd
    + input.targetContributionMicrousd;
  const contributionAtCeilingsMicrousd = input.customerPriceMicrousd
    - input.supplierCostCeilingMicrousd
    - input.infrastructureCostCeilingMicrousd
    - input.failureReserveMicrousd
    - input.paymentReconciliationCostCeilingMicrousd;
  const failureCodes: string[] = [];
  if (!input.supplierCostBounded) failureCodes.push('supplier_cost_unbounded');
  if (!input.promotionalCreditsExcluded) failureCodes.push('promotional_credit_subsidy_included');
  if (input.customerPriceMicrousd < requiredPriceMicrousd) failureCodes.push('price_below_post_credit_floor');
  if (input.customerPriceMicrousd > input.competitiveCeilingMicrousd) failureCodes.push('price_above_competitive_ceiling');
  const postCreditViable = input.supplierCostBounded
    && input.promotionalCreditsExcluded
    && input.customerPriceMicrousd >= requiredPriceMicrousd;
  const competitivelyPriced = input.customerPriceMicrousd <= input.competitiveCeilingMicrousd;
  return Object.freeze({
    schemaVersion: UNIT_ECONOMICS_VERSION,
    ...input,
    requiredPriceMicrousd,
    contributionAtCeilingsMicrousd,
    contributionBasisPoints: input.customerPriceMicrousd === 0
      ? 0
      : Math.floor((contributionAtCeilingsMicrousd * 10_000) / input.customerPriceMicrousd),
    postCreditViable,
    competitivelyPriced,
    paidActivationAllowed: postCreditViable && competitivelyPriced,
    failureCodes: Object.freeze(failureCodes),
  });
}

export interface PromotionalCreditPolicy {
  unitName: string;
  withdrawable: false;
  equivalentToUsdOrUsdc: false;
  expirationRequired: true;
  eligibleProductsRequired: true;
  perAccountLimitRequired: true;
  paidSupplierBudgetSeparate: true;
}

export function assertPromotionalCreditPolicy(value: PromotionalCreditPolicy): void {
  if (
    typeof value.unitName !== 'string'
    || value.unitName.length < 3
    || value.unitName.length > 80
    || /[\u0000-\u001f\u007f]/u.test(value.unitName)
  ) throw new TypeError('unit_economics_credit_unit_name_invalid');
  if (
    value.withdrawable !== false
    || value.equivalentToUsdOrUsdc !== false
    || value.expirationRequired !== true
    || value.eligibleProductsRequired !== true
    || value.perAccountLimitRequired !== true
    || value.paidSupplierBudgetSeparate !== true
  ) throw new TypeError('promotional_credit_policy_unsafe');
}

function assertIdentifier(value: string, name: string): void {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:._-]{2,127}$/u.test(value)) {
    throw new TypeError(`unit_economics_${name}_invalid`);
  }
}
