import type { ProblemDetails } from './types.js';

export const problemTypes = {
  invalidRequest: 'https://api.clervo.dev/problems/invalid-request',
  idempotencyConflict: 'https://api.clervo.dev/problems/idempotency-conflict',
  operationInProgress: 'https://api.clervo.dev/problems/operation-in-progress',
  quoteExpired: 'https://api.clervo.dev/problems/quote-expired',
  paymentRequired: 'https://api.clervo.dev/problems/payment-required',
  outcomeUnknown: 'https://api.clervo.dev/problems/outcome-unknown',
} as const;

export function problem(input: ProblemDetails): ProblemDetails {
  return input;
}