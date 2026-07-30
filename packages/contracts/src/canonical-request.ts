import { createHash } from 'node:crypto';
import type { JsonValue } from './types.js';

function assertValidUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError('JCS input contains an unpaired high surrogate');
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError('JCS input contains an unpaired low surrogate');
    }
  }
}

export function canonicalize(value: JsonValue): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    assertValidUnicode(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JCS input numbers must be finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;

  const entries = Object.keys(value)
    .sort()
    .map((key) => {
      assertValidUnicode(key);
      return `${JSON.stringify(key)}:${canonicalize(value[key]!)}`;
    });
  return `{${entries.join(',')}}`;
}

export interface FingerprintInput {
  contractVersion: string;
  operation: string;
  method: string;
  target: string;
  contentType: string;
  body: JsonValue;
}

export function canonicalRequestHash(input: FingerprintInput): string {
  const normalized: JsonValue = {
    body: input.body,
    contentType: input.contentType.trim().toLowerCase(),
    contractVersion: input.contractVersion,
    method: input.method.trim().toUpperCase(),
    operation: input.operation,
    target: input.target,
  };
  return `sha256:${createHash('sha256').update(canonicalize(normalized), 'utf8').digest('hex')}`;
}