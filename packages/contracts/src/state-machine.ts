import type { OperationState } from './types.js';

const transitions = {
  RECEIVED: ['VALIDATED', 'FAILED'],
  VALIDATED: ['QUOTED', 'FAILED'],
  QUOTED: ['PAYMENT_REQUIRED', 'AUTHORIZED', 'FAILED'],
  PAYMENT_REQUIRED: ['AUTHORIZED', 'FAILED'],
  AUTHORIZED: ['RESERVED', 'FAILED'],
  RESERVED: ['EXECUTING', 'FAILED'],
  EXECUTING: ['EXECUTED', 'EXECUTION_UNKNOWN'],
  EXECUTION_UNKNOWN: ['RECONCILING'],
  EXECUTED: ['VERIFYING'],
  VERIFYING: ['VERIFIED', 'FAILED'],
  VERIFIED: ['SETTLING'],
  SETTLING: ['SETTLED', 'SETTLEMENT_UNKNOWN'],
  SETTLEMENT_UNKNOWN: ['RECONCILING'],
  SETTLED: ['RECEIPTED'],
  RECEIPTED: [],
  RECONCILING: ['EXECUTED', 'SETTLED', 'FAILED'],
  FAILED: [],
} as const satisfies Record<OperationState, readonly OperationState[]>;

export const terminalStates: ReadonlySet<OperationState> = new Set(['RECEIPTED', 'FAILED']);
export const unknownOutcomeStates: ReadonlySet<OperationState> = new Set([
  'EXECUTION_UNKNOWN',
  'SETTLEMENT_UNKNOWN',
]);

export function allowedTransitions(state: OperationState): readonly OperationState[] {
  return transitions[state];
}

export function canTransition(from: OperationState, to: OperationState): boolean {
  return transitions[from].some((candidate) => candidate === to);
}

export type RetryAction = 'REPLAY_STORED_RESPONSE' | 'RESUME' | 'RECONCILE' | 'REJECT';

export function retryAction(state: OperationState): RetryAction {
  if (state === 'RECEIPTED') return 'REPLAY_STORED_RESPONSE';
  if (unknownOutcomeStates.has(state) || state === 'RECONCILING') return 'RECONCILE';
  if (state === 'FAILED') return 'REJECT';
  return 'RESUME';
}