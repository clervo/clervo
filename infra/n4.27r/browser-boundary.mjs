import { isIP } from 'node:net';

const blockedNames = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal', 'metadata.google']);

function ipv4Parts(value) {
  const parts = value.split('.').map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : undefined;
}

export function browserAddressDenied(value) {
  const normalized = value.trim().toLocaleLowerCase('en-US').replace(/^\[|\]$/gu, '').replace(/\.$/u, '');
  if (blockedNames.has(normalized)) return true;
  if (isIP(normalized) === 6) return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
  const parts = ipv4Parts(normalized);
  if (parts === undefined) return false;
  const [first, second] = parts;
  return first === 0 || first === 10 || first === 127 || first >= 224 || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19));
}

export function validateBrowserTarget(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') throw new Error('browser_target_denied');
  if (browserAddressDenied(url.hostname)) throw new Error('browser_target_denied');
  return url;
}

export function validateResolvedAddresses(first, second) {
  if (first.length === 0 || second.length === 0 || first.some(browserAddressDenied) || second.some(browserAddressDenied)) throw new Error('gateway_address_denied');
  if (JSON.stringify([...first].sort()) !== JSON.stringify([...second].sort())) throw new Error('gateway_dns_rebinding_denied');
}

export function validateBrowserResponse(input) {
  const mime = input.mime.split(';', 1)[0].trim().toLocaleLowerCase('en-US');
  if (!['text/html', 'application/xhtml+xml'].includes(mime)) throw new Error('browser_mime_denied');
  if (!Number.isSafeInteger(input.compressedBytes) || !Number.isSafeInteger(input.decodedBytes) || input.compressedBytes < 0 || input.decodedBytes < 0) throw new Error('browser_size_invalid');
  if (input.compressedBytes > 2_097_152 || input.decodedBytes > 2_097_152 || input.decodedBytes > Math.max(65_536, input.compressedBytes * 20)) throw new Error('browser_decompression_limit');
  if (!Number.isSafeInteger(input.outputCharacters) || input.outputCharacters < 1 || input.outputCharacters > 100_000) throw new Error('browser_output_limit');
}

export function robotsAllows(pathname, robotsText) {
  const disallowed = robotsText.split(/\r?\n/gu).map((line) => line.trim()).filter((line) => /^disallow\s*:/iu.test(line)).map((line) => line.split(':').slice(1).join(':').trim()).filter(Boolean);
  return !disallowed.some((path) => pathname.startsWith(path));
}
