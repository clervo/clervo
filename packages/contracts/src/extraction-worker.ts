import { parentPort } from 'node:worker_threads';

interface WorkerRequest {
  body: Uint8Array;
  contentType: 'text/html' | 'text/plain' | 'application/xhtml+xml';
  maximumOutputCharacters: number;
}

interface ExtractedSegment {
  kind: 'heading' | 'paragraph' | 'list_item';
  text: string;
  startOffset: number;
  endOffset: number;
}

const blockTags = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol',
  'p', 'pre', 'section', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);
const removedTags = new Set(['script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'object', 'embed', 'template']);
const headingTags = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function decodeEntity(entity: string): string {
  const named: Record<string, string> = { amp: '&', apos: "'", gt: '>', hellip: '…', lt: '<', nbsp: ' ', quot: '"' };
  if (entity.startsWith('#x') || entity.startsWith('#X')) {
    const value = Number.parseInt(entity.slice(2), 16);
    return Number.isInteger(value) && value >= 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : `&${entity};`;
  }
  if (entity.startsWith('#')) {
    const value = Number.parseInt(entity.slice(1), 10);
    return Number.isInteger(value) && value >= 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : `&${entity};`;
  }
  return named[entity.toLowerCase()] ?? `&${entity};`;
}

function decodeEntities(value: string): string {
  return value.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z][a-z0-9]+);/giu, (_match, entity: string) => decodeEntity(entity));
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\r\n?/gu, '\n')
    .replace(/[\t\f\v ]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function extractHtml(source: string): { text: string; removedActiveContent: boolean; kinds: Array<'heading' | 'paragraph' | 'list_item'> } {
  const tokenPattern = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-zA-Z][a-zA-Z0-9:-]*)\b[^>]*>|[^<]+|</gu;
  let match: RegExpExecArray | null;
  let removedDepth = 0;
  let removedActiveContent = false;
  let output = '';
  const kinds: Array<'heading' | 'paragraph' | 'list_item'> = [];
  while ((match = tokenPattern.exec(source)) !== null) {
    const token = match[0];
    if (token === '<') throw new Error('malformed_html');
    if (token.startsWith('<!--') || token.startsWith('<!')) continue;
    if (token.startsWith('<')) {
      const tag = (match[1] ?? '').toLowerCase();
      const closing = /^<\//u.test(token);
      const selfClosing = /\/>$/u.test(token);
      if (removedTags.has(tag)) {
        removedActiveContent = true;
        if (!selfClosing) removedDepth += closing ? -1 : 1;
        if (removedDepth < 0) throw new Error('malformed_html');
        continue;
      }
      if (removedDepth > 0) continue;
      if (blockTags.has(tag)) {
        output += '\n\n';
        if (!closing && headingTags.has(tag)) kinds.push('heading');
        else if (!closing && tag === 'li') kinds.push('list_item');
      }
      continue;
    }
    if (removedDepth === 0) output += decodeEntities(token);
  }
  if (removedDepth !== 0) throw new Error('malformed_html');
  return { text: normalizeText(output), removedActiveContent, kinds };
}

function segment(text: string, hintedKinds: Array<'heading' | 'paragraph' | 'list_item'>): ExtractedSegment[] {
  const segments: ExtractedSegment[] = [];
  const pattern = /[^\n]+(?:\n(?!\n)[^\n]+)*/gu;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    const segmentText = match[0];
    segments.push({
      kind: hintedKinds[index] ?? 'paragraph',
      text: segmentText,
      startOffset: match.index,
      endOffset: match.index + segmentText.length,
    });
    index += 1;
  }
  return segments;
}

function execute(request: WorkerRequest): { normalizedText: string; segments: ExtractedSegment[]; warnings: string[] } {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(request.body);
  let normalizedText: string;
  let removedActiveContent = false;
  let hintedKinds: Array<'heading' | 'paragraph' | 'list_item'> = [];
  if (request.contentType === 'text/plain') normalizedText = normalizeText(source);
  else {
    const extracted = extractHtml(source);
    normalizedText = extracted.text;
    removedActiveContent = extracted.removedActiveContent;
    hintedKinds = extracted.kinds;
  }
  if (normalizedText.length === 0) throw new Error('extraction_empty');
  if (normalizedText.length > request.maximumOutputCharacters) throw new Error('extraction_output_too_large');
  const warnings: string[] = [];
  if (removedActiveContent) warnings.push('active_content_removed');
  if (/(?:ignore|disregard) (?:all |any )?(?:previous|prior|system|developer) instructions|(?:system|assistant|developer) prompt/iu.test(normalizedText)) warnings.push('instruction_like_text_present');
  return { normalizedText, segments: segment(normalizedText, hintedKinds), warnings };
}

parentPort?.once('message', (request: WorkerRequest) => {
  try {
    parentPort?.postMessage({ ok: true, value: execute(request) });
  } catch (error) {
    parentPort?.postMessage({ ok: false, error: error instanceof Error ? error.message : 'extraction_worker_failed' });
  }
});