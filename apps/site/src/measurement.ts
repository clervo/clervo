const VISITOR_KEY = 'clervo.measurement.visitor.v1';
const API_ENDPOINT = 'https://api.clervo.dev/v1/analytics/events';

function visitorRef(): string {
  if (typeof localStorage === 'undefined') return 'sha256:site-render';
  const existing = localStorage.getItem(VISITOR_KEY);
  if (existing !== null && /^sha256:[a-f0-9]{64}$/u.test(existing)) return existing;
  const seed = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  // This is a random site-visitor pseudonym, never a wallet or request identity.
  const bytes = new TextEncoder().encode(seed);
  const digest = typeof crypto?.subtle?.digest === 'function' ? crypto.subtle.digest('SHA-256', bytes) : undefined;
  if (digest === undefined) return 'sha256:site-render';
  // The async hash is completed by the caller before an event is sent.
  return seed;
}

async function hashedVisitorRef(): Promise<string> {
  const current = visitorRef();
  if (/^sha256:[a-f0-9]{64}$/u.test(current)) return current;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(current));
  const value = `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  try { localStorage.setItem(VISITOR_KEY, value); } catch { /* storage is optional */ }
  return value;
}

function eventId(name: string, path: string): string {
  const seed = `${name}:${path}:${Date.now()}:${Math.random()}`;
  // Event IDs are only deduplication keys; no request data enters them.
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const randomPart = Math.floor(Math.random() * 0x1_0000_0000).toString(16).padStart(8, '0');
  return `evt_${hash.toString(16).padStart(8, '0')}${Date.now().toString(16).padStart(16, '0')}${randomPart}`;
}

export async function recordSiteMeasurement(eventName: 'site_visit' | 'activation_surface' | 'setup_start' | 'catalog_view', path: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const current = new URL(window.location.href);
  const referrer = document.referrer === '' ? undefined : new URL(document.referrer).hostname;
  const params = current.searchParams;
  const event = {
    eventId: eventId(eventName, path),
    eventName,
    occurredAt: new Date().toISOString(),
    visitorRef: await hashedVisitorRef(),
    source: params.get('utm_source') ?? (referrer === undefined ? 'direct' : referrer),
    channel: params.get('utm_medium') ?? (referrer === undefined ? 'direct' : 'referral'),
    referrerHost: referrer,
    utmSource: params.get('utm_source') ?? undefined,
    utmMedium: params.get('utm_medium') ?? undefined,
    utmCampaign: params.get('utm_campaign') ?? undefined,
    metadata: { path },
  };
  const body = JSON.stringify(event);
  try {
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(API_ENDPOINT, new Blob([body], { type: 'application/json' }));
    } else {
      await fetch(API_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true });
    }
  } catch {
    // Measurement must never affect the product journey.
  }
}
