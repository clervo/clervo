const MODEL_MAP = Object.freeze({
  'gpt-4o': 'clervo/gpt-5.6-luna',
  'gpt-4o-mini': 'clervo/fast',
  'gpt-4-turbo': 'clervo/smart',
  'gpt-3.5-turbo': 'clervo/fast',
  o1: 'clervo/deep',
  o3: 'clervo/deep',
  'claude-3-5-sonnet-20241022': 'clervo/claude-sonnet-4-6',
  'claude-sonnet-4-6': 'clervo/claude-sonnet-4-6',
  'claude-3-opus-20240229': 'clervo/claude-opus-4-6',
  'claude-opus-4-6': 'clervo/claude-opus-4-6',
  'claude-3-haiku-20240307': 'clervo/claude-haiku-4-5-20251001',
});

export function resolveCompatibilityModel(model) {
  if (typeof model !== 'string' || model.length === 0) return model;
  return MODEL_MAP[model]
    ?? (model.startsWith('clervo/') ? model : `clervo/${model}`);
}
