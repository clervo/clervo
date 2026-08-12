import modelsSource from '../../../generated/public/models.json';
import creatorSource from '../brand/model-creators.v1.json';

export interface CreatorIdentity {
  id: string;
  name: string;
  officialUrl: string;
  brandSourceUrl: string;
  logoAsset: string | null;
  logoDecision: 'official_asset' | 'typography_fallback';
  usageNotes: string;
}

export interface CustomerPricing {
  currency: 'USD';
  decimals: number;
  inputTokenMicrosPerMillion: number;
  cachedInputTokenMicrosPerMillion: number;
  outputTokenMicrosPerMillion: number;
  reasoningTokenMicrosPerMillion: number;
  imageMicrosEach: number;
  audioMicrosPerThousandCharacters: number;
  videoMicrosPerSecond: number;
  musicMicrosPerGeneration: number;
  virtualTryOnMicrosPerImage: number;
}

export interface AiModel {
  id: string;
  name: string;
  description: string;
  identityKind: 'canonical' | 'alias';
  aliases: string[];
  aliasFor: string | null;
  reasoningEffort: string | null;
  productIds: string[];
  capabilities: string[];
  inputTypes: string[];
  outputTypes: string[];
  availability: 'available' | 'degraded' | 'unavailable';
  health: 'healthy' | 'degraded' | 'unavailable';
  publicSellable: boolean;
  publicationBlockers: string[];
  customerPricing: CustomerPricing;
  pricingMethod: string;
  billingMode: string;
  executionPath: string;
  payment: string;
  replaySafe: boolean;
  creator: CreatorIdentity | null;
}

interface ModelsDocument {
  data: Array<{
    id: string;
    clervo: {
      name: string;
      description: string;
      identityKind: 'canonical' | 'alias';
      aliases?: string[];
      aliasFor?: string;
      reasoningEffort?: string;
      productIds: string[];
      capabilities: string[];
      inputTypes: string[];
      outputTypes: string[];
      availability: AiModel['availability'];
      health: AiModel['health'];
      publicSellable: boolean;
      publicationBlockers?: string[];
      customerPricing: CustomerPricing;
      pricingMethod: string;
      billingMode: string;
      commerce: {
        executionPath: string;
        payment: string;
        replaySafe: boolean;
      };
    };
  }>;
}

const creators = new Map(
  creatorSource.creators.map((creator) => [creator.id, creator as CreatorIdentity]),
);
const exactAssignments = new Map(
  creatorSource.exactAssignments.map(({ modelId, creatorId }) => [modelId, creatorId]),
);

function creatorFor(modelId: string, identityKind: AiModel['identityKind']): CreatorIdentity | null {
  if (identityKind === 'alias') return null;
  const exact = exactAssignments.get(modelId);
  const creatorId = exact ?? creatorSource.assignments.find(({ prefix }) => modelId.startsWith(prefix))?.creatorId;
  return creatorId === undefined ? null : creators.get(creatorId) ?? null;
}

const document = modelsSource as unknown as ModelsDocument;

export const aiModels: AiModel[] = document.data.map(({ id, clervo }) => ({
  id,
  name: clervo.identityKind === 'alias'
    ? `${id.slice('clervo/'.length)} routing profile`
    : clervo.name,
  description: clervo.description,
  identityKind: clervo.identityKind,
  aliases: clervo.aliases ?? [],
  aliasFor: clervo.aliasFor ?? null,
  reasoningEffort: clervo.reasoningEffort ?? null,
  productIds: clervo.productIds,
  capabilities: clervo.capabilities,
  inputTypes: clervo.inputTypes,
  outputTypes: clervo.outputTypes,
  availability: clervo.availability,
  health: clervo.health,
  publicSellable: clervo.publicSellable,
  publicationBlockers: clervo.publicationBlockers ?? [],
  customerPricing: clervo.customerPricing,
  pricingMethod: clervo.pricingMethod,
  billingMode: clervo.billingMode,
  executionPath: clervo.commerce.executionPath,
  payment: clervo.commerce.payment,
  replaySafe: clervo.commerce.replaySafe,
  creator: creatorFor(id, clervo.identityKind),
}));

export const canonicalModelCount = aiModels.filter(({ identityKind }) => identityKind === 'canonical').length;
export const aliasModelCount = aiModels.filter(({ identityKind }) => identityKind === 'alias').length;
export const sellableModelCount = aiModels.filter(({ publicSellable }) => publicSellable).length;
export const creatorIdentities = creatorSource.creators as CreatorIdentity[];

export function modelSlug(model: Pick<AiModel, 'id'>): string {
  return encodeURIComponent(model.id.slice('clervo/'.length));
}

export function modelPath(model: Pick<AiModel, 'id'>): string {
  return `/models/${modelSlug(model)}`;
}

export function modelFromSlug(slug: string): AiModel | null {
  let decoded: string;
  try { decoded = decodeURIComponent(slug); } catch { return null; }
  return aiModels.find(({ id }) => id === `clervo/${decoded}`) ?? null;
}

export function capabilityName(value: string): string {
  return value.replaceAll('_', ' ');
}

function dollars(micros: number): string {
  const value = micros / 1_000_000;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: 6,
  }).format(value);
}

export function modelPriceLines(model: AiModel): string[] {
  const price = model.customerPricing;
  const lines: string[] = [];
  if (price.inputTokenMicrosPerMillion > 0) lines.push(`${dollars(price.inputTokenMicrosPerMillion)} / 1M input tokens`);
  if (price.outputTokenMicrosPerMillion > 0) lines.push(`${dollars(price.outputTokenMicrosPerMillion)} / 1M output tokens`);
  if (price.imageMicrosEach > 0) lines.push(`${dollars(price.imageMicrosEach)} / image`);
  if (price.audioMicrosPerThousandCharacters > 0) lines.push(`${dollars(price.audioMicrosPerThousandCharacters)} / 1K characters`);
  if (price.videoMicrosPerSecond > 0) lines.push(`${dollars(price.videoMicrosPerSecond)} / second`);
  if (price.musicMicrosPerGeneration > 0) lines.push(`${dollars(price.musicMicrosPerGeneration)} / generation`);
  if (price.virtualTryOnMicrosPerImage > 0) lines.push(`${dollars(price.virtualTryOnMicrosPerImage)} / image`);
  return lines.length === 0 ? ['Request a live quote'] : lines;
}

export function modelExample(model: AiModel): string {
  const product = model.productIds[0] ?? 'ai.chat';
  const inputs: Record<string, string> = {
    'ai.chat': `input: {\n      kind: 'chat',\n      messages: [{ role: 'user', content: 'Return one useful, bounded result.' }],\n      responseFormat: 'text',\n      stream: false,\n    },\n    maximumOutputTokens: 256`,
    'ai.embed': `input: { kind: 'embedding', inputs: ['A useful bounded input.'] }`,
    'ai.image': `input: { kind: 'image', prompt: 'A precise technical object on black', size: '1024x1024', quality: 'medium', count: 1 }`,
    'ai.speech': `input: { kind: 'speech', input: 'A useful bounded result.', voice: 'Kore', responseFormat: 'mp3' }`,
    'ai.video': `input: { kind: 'video', prompt: 'A restrained technical mechanism', durationSeconds: 5, aspectRatio: '16:9', resolution: '720p' }`,
    'ai.music': `input: { kind: 'music', prompt: 'A restrained instrumental signal', durationSeconds: 30, instrumental: true }`,
    'ai.virtual_try_on': `input: { kind: 'virtual_try_on', personImageBase64, productImageBase64 }`,
  };
  return `import { ClervoClient } from '@clervo/sdk';\n\nconst clervo = new ClervoClient();\nconst result = await clervo.ai.execute({\n  model: '${model.id}',\n  ${inputs[product] ?? inputs['ai.chat']}\n}); // the client generates a fresh key for this logical operation`;
}
