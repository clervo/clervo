import { Buffer } from 'node:buffer';
import { canonicalize } from './canonical-request.js';
import { hashJson } from './receipt.js';
import type { AssetAmount, JsonValue } from './types.js';
import { CONTRACT_VERSION } from './types.js';

export const X402_VERSION = 2 as const;
export const PAYMENT_REQUIRED_HEADER = 'PAYMENT-REQUIRED' as const;

export interface Quote {
  contractVersion: typeof CONTRACT_VERSION;
  quoteId: string;
  operationId: string;
  productId: string;
  requestHash: string;
  priceVersion: string;
  maximumCharge: AssetAmount;
  issuedAt: string;
  expiresAt: string;
  quoteHash: string;
}

export type UnsignedQuote = Omit<Quote, 'quoteHash'>;

export interface MockPaymentRequirement {
  scheme: 'exact';
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: {
    mock: true;
    payable: false;
    clervo: {
      quoteId: string;
      quoteHash: string;
      requestHash: string;
      priceVersion: string;
      quoteExpiresAt: string;
    };
  };
}

export interface MockPaymentRequired {
  x402Version: typeof X402_VERSION;
  error: 'PAYMENT-SIGNATURE header is required';
  resource: {
    url: string;
    description: string;
    mimeType: 'application/json';
  };
  accepts: readonly [MockPaymentRequirement];
  extensions: {
    clervo: {
      mode: 'mock';
      paymentSignatureAccepted: false;
      verificationImplemented: false;
      facilitatorConfigured: false;
      authorizationImplemented: false;
      settlementImplemented: false;
      executionAllowed: false;
    };
  };
}

export interface MockChallengeInput {
  quote: Quote;
  resourceUrl: string;
  description: string;
  network: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  now: string;
}

export interface MockChallengeResponse {
  status: 402;
  headers: Readonly<Record<typeof PAYMENT_REQUIRED_HEADER, string>>;
  body: MockPaymentRequired;
}

export function quoteHash(quote: UnsignedQuote): string {
  return hashJson(quote as unknown as JsonValue);
}

export function sealQuote(quote: UnsignedQuote): Readonly<Quote> {
  assertQuoteTimes(quote.issuedAt, quote.expiresAt);
  return Object.freeze({ ...quote, quoteHash: quoteHash(quote) });
}

export function verifyQuote(quote: Quote): boolean {
  const { quoteHash: claimed, ...unsigned } = quote;
  try {
    assertQuoteTimes(unsigned.issuedAt, unsigned.expiresAt);
    return claimed === quoteHash(unsigned);
  } catch {
    return false;
  }
}

export function isQuoteExpired(quote: Quote, now: string): boolean {
  const nowMilliseconds = Date.parse(now);
  if (!Number.isFinite(nowMilliseconds)) throw new TypeError('now must be an RFC 3339 date-time');
  return nowMilliseconds >= Date.parse(quote.expiresAt);
}

export function createMockPaymentRequired(input: MockChallengeInput): Readonly<MockPaymentRequired> {
  assertMockChallengeInput(input);
  const challenge: MockPaymentRequired = {
    x402Version: X402_VERSION,
    error: 'PAYMENT-SIGNATURE header is required',
    resource: {
      url: input.resourceUrl,
      description: input.description,
      mimeType: 'application/json',
    },
    accepts: [{
      scheme: 'exact',
      network: input.network,
      amount: input.quote.maximumCharge.amountAtomic,
      asset: input.asset,
      payTo: input.payTo,
      maxTimeoutSeconds: input.maxTimeoutSeconds,
      extra: {
        mock: true,
        payable: false,
        clervo: {
          quoteId: input.quote.quoteId,
          quoteHash: input.quote.quoteHash,
          requestHash: input.quote.requestHash,
          priceVersion: input.quote.priceVersion,
          quoteExpiresAt: input.quote.expiresAt,
        },
      },
    }],
    extensions: {
      clervo: {
        mode: 'mock',
        paymentSignatureAccepted: false,
        verificationImplemented: false,
        facilitatorConfigured: false,
        authorizationImplemented: false,
        settlementImplemented: false,
        executionAllowed: false,
      },
    },
  };
  assertMockPaymentRequired(challenge, input.quote, input.now);
  return Object.freeze(challenge);
}

export function encodePaymentRequired(challenge: MockPaymentRequired): string {
  return Buffer.from(canonicalize(challenge as unknown as JsonValue), 'utf8').toString('base64');
}

export function createMockChallengeResponse(input: MockChallengeInput): Readonly<MockChallengeResponse> {
  const body = createMockPaymentRequired(input);
  return Object.freeze({
    status: 402,
    headers: Object.freeze({ [PAYMENT_REQUIRED_HEADER]: encodePaymentRequired(body) }),
    body,
  });
}

export function assertMockPaymentRequired(challenge: MockPaymentRequired, quote: Quote, now: string): void {
  if (!verifyQuote(quote)) throw new TypeError('quote_hash_invalid');
  if (isQuoteExpired(quote, now)) throw new TypeError('quote_expired');
  if (challenge.x402Version !== X402_VERSION) throw new TypeError('x402_version_invalid');
  if (challenge.accepts.length !== 1) throw new TypeError('mock_requires_one_payment_requirement');
  const requirement = challenge.accepts[0];
  if (requirement.amount !== quote.maximumCharge.amountAtomic) throw new TypeError('challenge_amount_exceeds_or_differs_from_quote');
  if (requirement.extra.clervo.quoteId !== quote.quoteId || requirement.extra.clervo.quoteHash !== quote.quoteHash) throw new TypeError('challenge_quote_binding_invalid');
  if (requirement.extra.clervo.requestHash !== quote.requestHash) throw new TypeError('challenge_request_binding_invalid');
  if (requirement.extra.clervo.priceVersion !== quote.priceVersion || requirement.extra.clervo.quoteExpiresAt !== quote.expiresAt) throw new TypeError('challenge_price_binding_invalid');
  if (!requirement.extra.mock || requirement.extra.payable) throw new TypeError('challenge_must_be_nonpayable_mock');
  const capabilities = challenge.extensions.clervo;
  if (capabilities.mode !== 'mock') throw new TypeError('challenge_mode_must_be_mock');
  if (capabilities.paymentSignatureAccepted || capabilities.verificationImplemented || capabilities.facilitatorConfigured || capabilities.authorizationImplemented || capabilities.settlementImplemented || capabilities.executionAllowed) {
    throw new TypeError('mock_challenge_must_not_claim_payment_readiness');
  }
}

function assertQuoteTimes(issuedAt: string, expiresAt: string): void {
  const issued = Date.parse(issuedAt);
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires)) throw new TypeError('quote timestamps must be RFC 3339 date-times');
  if (expires <= issued) throw new TypeError('quote expiry must be after issuance');
}

function assertMockChallengeInput(input: MockChallengeInput): void {
  if (!verifyQuote(input.quote)) throw new TypeError('quote_hash_invalid');
  if (isQuoteExpired(input.quote, input.now)) throw new TypeError('quote_expired');
  const remainingSeconds = Math.floor((Date.parse(input.quote.expiresAt) - Date.parse(input.now)) / 1000);
  if (!Number.isInteger(input.maxTimeoutSeconds) || input.maxTimeoutSeconds < 1 || input.maxTimeoutSeconds > 3600 || input.maxTimeoutSeconds > remainingSeconds) {
    throw new TypeError('challenge_timeout_exceeds_quote_expiry');
  }
  if (input.asset !== input.quote.maximumCharge.asset) throw new TypeError('challenge_asset_differs_from_quote');
  if (!URL.canParse(input.resourceUrl) || !input.resourceUrl.startsWith('https://')) throw new TypeError('resource_url_must_be_https');
  if (input.description.length < 1 || input.description.length > 500) throw new TypeError('description_length_invalid');
  if (!/^[a-z0-9]+:[A-Za-z0-9._-]+$/.test(input.network)) throw new TypeError('network_must_be_caip2_like');
  if (!/^mock:[A-Za-z0-9._-]{8,128}$/.test(input.payTo)) throw new TypeError('mock_pay_to_required');
}