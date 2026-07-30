import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { CONTRACT_VERSION } from './types.js';
import type { RetrievalFetchReceipt } from './retrieval-fetch.js';

const supportedContentTypes = new Set(['text/html', 'text/plain', 'application/xhtml+xml']);
const maximumInputBytes = 2 * 1024 * 1024;
const maximumOutputCharacters = 500_000;
const maximumWorkerMs = 5_000;
const shingleSize = 5;

export interface ExtractionRequest {
  extractionId: string;
  receipt: RetrievalFetchReceipt;
  body: Uint8Array;
  maximumOutputCharacters: number;
  workerTimeoutMs: number;
}

export interface ExtractedSegment {
  kind: 'heading' | 'paragraph' | 'list_item';
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface ExtractionRecord {
  contractVersion: typeof CONTRACT_VERSION;
  extractionId: string;
  fetchId: string;
  finalUrl: string;
  contentType: 'text/html' | 'text/plain' | 'application/xhtml+xml';
  sourceBodySha256: string;
  normalizedTextSha256: string;
  normalizedText: string;
  segments: readonly Readonly<ExtractedSegment>[];
  warnings: readonly string[];
  isolation: 'worker_thread';
  instructionHandling: 'untrusted_data_only';
}

export interface DeduplicationInput {
  batchId: string;
  records: readonly ExtractionRecord[];
  nearDuplicateThresholdBasisPoints: number;
}

export interface DeduplicatedExtraction {
  extraction: Readonly<ExtractionRecord>;
  disposition: 'retained' | 'exact_duplicate' | 'near_duplicate';
  duplicateOfExtractionId?: string;
  similarityBasisPoints: number;
}

export interface ExtractionDeduplicationResult {
  contractVersion: typeof CONTRACT_VERSION;
  batchId: string;
  shingleSize: typeof shingleSize;
  nearDuplicateThresholdBasisPoints: number;
  inputCount: number;
  retainedCount: number;
  exactDuplicateCount: number;
  nearDuplicateCount: number;
  results: readonly Readonly<DeduplicatedExtraction>[];
}

interface WorkerValue {
  normalizedText: string;
  segments: ExtractedSegment[];
  warnings: string[];
}

function sha256(value: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function freezeExtraction(record: ExtractionRecord): Readonly<ExtractionRecord> {
  return Object.freeze({
    ...record,
    segments: Object.freeze(record.segments.map((segment) => Object.freeze({ ...segment }))),
    warnings: Object.freeze([...record.warnings]),
  });
}

function validateExtractionRecord(record: ExtractionRecord): Readonly<ExtractionRecord> {
  if (record.contractVersion !== CONTRACT_VERSION) throw new Error('invalid_extraction_contract_version');
  if (!/^extract_[A-Za-z0-9]{20,64}$/u.test(record.extractionId)) throw new Error('invalid_extraction_id');
  if (!/^fetch_[A-Za-z0-9]{20,64}$/u.test(record.fetchId)) throw new Error('invalid_extraction_fetch_id');
  let finalUrl: URL;
  try {
    finalUrl = new URL(record.finalUrl);
  } catch {
    throw new Error('invalid_extraction_final_url');
  }
  if (!['http:', 'https:'].includes(finalUrl.protocol) || finalUrl.username !== '' || finalUrl.password !== '') throw new Error('invalid_extraction_final_url');
  if (!supportedContentTypes.has(record.contentType)) throw new Error('extraction_content_type_not_supported');
  if (!/^sha256:[a-f0-9]{64}$/u.test(record.sourceBodySha256)) throw new Error('invalid_extraction_source_hash');
  if (record.normalizedText.length < 1 || record.normalizedText.length > maximumOutputCharacters || record.normalizedTextSha256 !== sha256(record.normalizedText)) throw new Error('invalid_extraction_normalized_text');
  if (record.segments.length < 1 || record.segments.length > 10_000) throw new Error('invalid_extraction_segments');
  for (const segment of record.segments) {
    if (!['heading', 'paragraph', 'list_item'].includes(segment.kind)
      || !Number.isInteger(segment.startOffset) || !Number.isInteger(segment.endOffset)
      || segment.startOffset < 0 || segment.endOffset <= segment.startOffset
      || record.normalizedText.slice(segment.startOffset, segment.endOffset) !== segment.text) throw new Error('invalid_extraction_segment');
  }
  if (record.isolation !== 'worker_thread' || record.instructionHandling !== 'untrusted_data_only') throw new Error('invalid_extraction_safety_boundary');
  if (new Set(record.warnings).size !== record.warnings.length || record.warnings.some((warning) => !['active_content_removed', 'instruction_like_text_present'].includes(warning))) throw new Error('invalid_extraction_warning');
  return freezeExtraction({ ...record, finalUrl: finalUrl.href });
}

function validateReceipt(request: ExtractionRequest): asserts request is ExtractionRequest & { receipt: RetrievalFetchReceipt & { finalUrl: string; contentType: string; contentLengthBytes: number; bodySha256: string } } {
  if (!/^extract_[A-Za-z0-9]{20,64}$/u.test(request.extractionId)) throw new Error('invalid_extraction_id');
  if (!(request.body instanceof Uint8Array) || request.body.byteLength < 1 || request.body.byteLength > maximumInputBytes) throw new Error('invalid_extraction_body');
  if (!Number.isSafeInteger(request.maximumOutputCharacters) || request.maximumOutputCharacters < 1 || request.maximumOutputCharacters > maximumOutputCharacters) throw new Error('invalid_extraction_output_limit');
  if (!Number.isSafeInteger(request.workerTimeoutMs) || request.workerTimeoutMs < 1 || request.workerTimeoutMs > maximumWorkerMs) throw new Error('invalid_extraction_worker_timeout');
  const receipt = request.receipt;
  if (receipt.outcome !== 'succeeded' || receipt.finalUrl === undefined || receipt.contentType === undefined || receipt.contentLengthBytes === undefined || receipt.bodySha256 === undefined) throw new Error('extraction_requires_successful_fetch');
  if (receipt.contractVersion !== CONTRACT_VERSION || !/^fetch_[A-Za-z0-9]{20,64}$/u.test(receipt.fetchId)) throw new Error('invalid_extraction_fetch_receipt');
  if (!receipt.hops.some((hop) => hop.kind === 'content' && hop.url === receipt.finalUrl && hop.status >= 200 && hop.status < 300)) throw new Error('invalid_extraction_fetch_receipt');
  if (!receipt.robots.some((entry) => entry.status === 'allowed' || entry.status === 'not_applicable')) throw new Error('invalid_extraction_fetch_receipt');
  if (!supportedContentTypes.has(receipt.contentType)) throw new Error('extraction_content_type_not_supported');
  if (receipt.contentLengthBytes !== request.body.byteLength) throw new Error('extraction_body_length_mismatch');
  if (receipt.bodySha256 !== sha256(request.body)) throw new Error('extraction_body_hash_mismatch');
}

function runWorker(request: ExtractionRequest & { receipt: RetrievalFetchReceipt & { contentType: string } }): Promise<WorkerValue> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./extraction-worker.js', import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 2 } });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('extraction_worker_timeout'));
    }, request.workerTimeoutMs);
    worker.once('message', (message: { ok: boolean; value?: WorkerValue; error?: string }) => {
      clearTimeout(timer);
      void worker.terminate();
      if (!message.ok || message.value === undefined) reject(new Error(message.error ?? 'extraction_worker_failed'));
      else resolve(message.value);
    });
    worker.once('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`extraction_worker_failed:${error.message}`));
    });
    worker.postMessage({ body: request.body, contentType: request.receipt.contentType, maximumOutputCharacters: request.maximumOutputCharacters });
  });
}

export async function extractRetrieval(request: ExtractionRequest): Promise<Readonly<ExtractionRecord>> {
  validateReceipt(request);
  const value = await runWorker(request);
  for (const segment of value.segments) {
    if (value.normalizedText.slice(segment.startOffset, segment.endOffset) !== segment.text) throw new Error('extraction_segment_offset_mismatch');
  }
  return freezeExtraction({
    contractVersion: CONTRACT_VERSION,
    extractionId: request.extractionId,
    fetchId: request.receipt.fetchId,
    finalUrl: request.receipt.finalUrl,
    contentType: request.receipt.contentType as ExtractionRecord['contentType'],
    sourceBodySha256: request.receipt.bodySha256,
    normalizedTextSha256: sha256(value.normalizedText),
    normalizedText: value.normalizedText,
    segments: value.segments,
    warnings: [...new Set(value.warnings)].sort(),
    isolation: 'worker_thread',
    instructionHandling: 'untrusted_data_only',
  });
}

function shingles(value: string): Set<string> {
  const words = value.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length === 0) return new Set();
  if (words.length < shingleSize) return new Set([words.join(' ')]);
  return new Set(words.slice(0, words.length - shingleSize + 1).map((_word, index) => words.slice(index, index + shingleSize).join(' ')));
}

export function contentSimilarityBasisPoints(left: string, right: string): number {
  const leftSet = shingles(left);
  const rightSet = shingles(right);
  if (leftSet.size === 0 || rightSet.size === 0) return leftSet.size === rightSet.size ? 10_000 : 0;
  let intersection = 0;
  for (const item of leftSet) if (rightSet.has(item)) intersection += 1;
  return Math.round(intersection * 10_000 / (leftSet.size + rightSet.size - intersection));
}

function compareRecord(left: ExtractionRecord, right: ExtractionRecord): number {
  return left.finalUrl.localeCompare(right.finalUrl) || left.extractionId.localeCompare(right.extractionId);
}

export function deduplicateExtractedContent(input: DeduplicationInput): Readonly<ExtractionDeduplicationResult> {
  if (!/^batch_[A-Za-z0-9]{20,64}$/u.test(input.batchId)) throw new Error('invalid_extraction_batch_id');
  if (!Number.isInteger(input.nearDuplicateThresholdBasisPoints) || input.nearDuplicateThresholdBasisPoints < 5_000 || input.nearDuplicateThresholdBasisPoints > 10_000) throw new Error('invalid_near_duplicate_threshold');
  if (input.records.length > 100) throw new Error('too_many_extraction_records');
  const identifiers = new Set<string>();
  const records = input.records.map(validateExtractionRecord).sort(compareRecord);
  const retained: ExtractionRecord[] = [];
  const results: DeduplicatedExtraction[] = [];
  let exactDuplicateCount = 0;
  let nearDuplicateCount = 0;
  for (const record of records) {
    if (identifiers.has(record.extractionId)) throw new Error('duplicate_extraction_id');
    identifiers.add(record.extractionId);
    const exact = retained.find((candidate) => candidate.normalizedTextSha256 === record.normalizedTextSha256);
    if (exact !== undefined) {
      exactDuplicateCount += 1;
      results.push({ extraction: record, disposition: 'exact_duplicate', duplicateOfExtractionId: exact.extractionId, similarityBasisPoints: 10_000 });
      continue;
    }
    const similarities = retained.map((candidate) => ({ candidate, similarity: contentSimilarityBasisPoints(candidate.normalizedText, record.normalizedText) }))
      .sort((left, right) => right.similarity - left.similarity || compareRecord(left.candidate, right.candidate));
    const near = similarities[0];
    if (near !== undefined && near.similarity >= input.nearDuplicateThresholdBasisPoints) {
      nearDuplicateCount += 1;
      results.push({ extraction: record, disposition: 'near_duplicate', duplicateOfExtractionId: near.candidate.extractionId, similarityBasisPoints: near.similarity });
      continue;
    }
    retained.push(record);
    results.push({ extraction: record, disposition: 'retained', similarityBasisPoints: near?.similarity ?? 0 });
  }
  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    batchId: input.batchId,
    shingleSize,
    nearDuplicateThresholdBasisPoints: input.nearDuplicateThresholdBasisPoints,
    inputCount: records.length,
    retainedCount: retained.length,
    exactDuplicateCount,
    nearDuplicateCount,
    results: Object.freeze(results.map((result) => Object.freeze({ ...result }))),
  });
}