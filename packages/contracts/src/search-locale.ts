export const DEFAULT_SEARCH_LANGUAGE = 'en' as const;
export const DEFAULT_SEARCH_REGION = 'US' as const;
const regionNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });

export interface SearchLocaleOptions {
  language: string;
  region: string;
}

export function normalizeSearchLanguage(value: unknown = DEFAULT_SEARCH_LANGUAGE): string {
  if (typeof value !== 'string' || value.length < 2 || value.length > 35 || value.includes('_')) throw new TypeError('invalid_search_language');
  let canonical: string;
  try {
    canonical = Intl.getCanonicalLocales(value)[0] ?? '';
  } catch {
    throw new TypeError('invalid_search_language');
  }
  if (canonical !== value) throw new TypeError('search_language_not_canonical');
  return canonical;
}

export function normalizeSearchRegion(value: unknown = DEFAULT_SEARCH_REGION): string {
  if (typeof value !== 'string' || !/^[A-Z]{2}$/u.test(value)) throw new TypeError('invalid_search_region');
  try {
    const region = new Intl.Locale(`und-${value}`).region;
    const displayName = regionNames.of(value);
    if (region !== value || displayName === undefined || displayName === 'Unknown Region' || value === 'XA' || value === 'XB') throw new TypeError('invalid_search_region');
  } catch {
    throw new TypeError('invalid_search_region');
  }
  return value;
}

export function normalizeSearchLocaleOptions(input: { language?: unknown; region?: unknown }): Readonly<SearchLocaleOptions> {
  return Object.freeze({ language: normalizeSearchLanguage(input.language), region: normalizeSearchRegion(input.region) });
}