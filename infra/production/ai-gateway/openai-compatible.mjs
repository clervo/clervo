import { chatCompletionToResponse } from './hcnsec.mjs';

export const OPENAI_COMPATIBLE_PROVIDER_DEFAULTS = Object.freeze({
  groq: Object.freeze({ baseUrl: 'https://api.groq.com/openai/v1' }),
  zai: Object.freeze({ baseUrl: 'https://api.z.ai/api/paas/v4' }),
  sambanova: Object.freeze({ baseUrl: 'https://api.sambanova.ai/v1' }),
  openrouter: Object.freeze({
    baseUrl: 'https://openrouter.ai/api/v1',
    headers: Object.freeze({
      'http-referer': 'https://clervo.dev',
      'x-title': 'Clervo',
    }),
  }),
  mistral: Object.freeze({ baseUrl: 'https://api.mistral.ai/v1' }),
  siliconflow: Object.freeze({ baseUrl: 'https://api.siliconflow.com/v1' }),
  mwapi: Object.freeze({ baseUrl: 'https://api.mwapi.dev/v1' }),
});

function contentPartToChat(part) {
  if (typeof part === 'string') return { type: 'text', text: part };
  if (!part || typeof part !== 'object') return null;

  if (part.type === 'input_text' || part.type === 'text') {
    return typeof part.text === 'string' ? { type: 'text', text: part.text } : null;
  }

  if (part.type === 'input_image' || part.type === 'image_url') {
    const candidate =
      typeof part.image_url === 'string'
        ? part.image_url
        : typeof part.image_url?.url === 'string'
          ? part.image_url.url
          : typeof part.url === 'string'
            ? part.url
            : null;

    return candidate === null
      ? null
      : { type: 'image_url', image_url: { url: candidate } };
  }

  return null;
}

function responseInputToMessages(payload) {
  const messages = [];

  if (typeof payload.instructions === 'string' && payload.instructions.trim() !== '') {
    messages.push({ role: 'system', content: payload.instructions });
  }

  if (typeof payload.input === 'string') {
    messages.push({ role: 'user', content: payload.input });
  } else if (Array.isArray(payload.input)) {
    for (const item of payload.input) {
      if (typeof item === 'string') {
        messages.push({ role: 'user', content: item });
        continue;
      }
      if (!item || typeof item !== 'object') continue;

      const role = typeof item.role === 'string' ? item.role : 'user';
      if (typeof item.content === 'string') {
        messages.push({ role, content: item.content });
        continue;
      }
      if (!Array.isArray(item.content)) continue;

      const parts = item.content.map(contentPartToChat).filter(Boolean);
      if (parts.length > 0) messages.push({ role, content: parts });
    }
  }

  if (messages.length === 0) {
    const error = new Error('invalid_responses_input');
    error.code = 'invalid_responses_input';
    throw error;
  }

  return messages;
}

export function responsesToOpenAIChatPayload(payload, upstreamModel) {
  const translated = {
    model: upstreamModel,
    messages: responseInputToMessages(payload),
  };

  if (payload.max_output_tokens !== undefined) translated.max_tokens = payload.max_output_tokens;
  if (payload.reasoning?.effort !== undefined) translated.reasoning_effort = payload.reasoning.effort;

  for (const field of ['temperature', 'top_p', 'tools', 'tool_choice', 'seed', 'stop']) {
    if (payload[field] !== undefined) translated[field] = payload[field];
  }

  return translated;
}

function chatPayload(payload, upstreamModel) {
  const translated = { ...payload, model: upstreamModel };

  if (
    translated.max_output_tokens !== undefined
    && translated.max_tokens === undefined
    && translated.max_completion_tokens === undefined
  ) {
    translated.max_tokens = translated.max_output_tokens;
  }
  delete translated.max_output_tokens;

  return translated;
}

function errorClass(status) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 400 && status < 500) return 'upstream_4xx';
  if (status >= 500) return 'upstream_5xx';
  return 'normalization';
}

function parseBody(text) {
  if (text === '') return null;
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 1000) }; }
}

function withPublicModel(body, publicModel) {
  if (body && typeof body === 'object') body.model = publicModel;
  return body;
}

export async function requestOpenAICompatible({
  route,
  path,
  payload,
  providerConfig,
  signal,
  requestId,
  fetchImpl = fetch,
}) {
  if (!providerConfig || typeof providerConfig.apiKey !== 'string' || providerConfig.apiKey.length < 16) {
    return {
      ok: false,
      status: 503,
      errorClass: 'provider_not_configured',
      body: { error: { message: 'Provider is not configured.' } },
    };
  }
  if (typeof providerConfig.baseUrl !== 'string' || providerConfig.baseUrl.trim() === '') {
    return {
      ok: false,
      status: 503,
      errorClass: 'provider_not_configured',
      body: { error: { message: 'Provider base URL is not configured.' } },
    };
  }

  const providerPayload = path === '/v1/responses'
    ? responsesToOpenAIChatPayload(payload, route.upstream)
    : chatPayload(payload, route.upstream);

  const response = await fetchImpl(`${providerConfig.baseUrl.replace(/\/+$/u, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${providerConfig.apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
      'x-request-id': requestId,
      ...(providerConfig.headers ?? {}),
    },
    body: JSON.stringify(providerPayload),
    signal,
  });

  const body = parseBody(await response.text());

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      errorClass: errorClass(response.status),
      body,
      headers: response.headers,
    };
  }

  if (body === null || typeof body !== 'object') {
    return {
      ok: false,
      status: 502,
      errorClass: 'normalization',
      body: { error: { message: 'Upstream returned an invalid JSON body.' } },
      headers: response.headers,
    };
  }

  if (body.model !== route.upstream) {
    return {
      ok: false,
      status: 502,
      errorClass: 'wrong_identity',
      body: { error: { message: 'Upstream returned an unexpected model identity.' } },
      headers: response.headers,
    };
  }

  if (path === '/v1/responses') {
    const normalized = chatCompletionToResponse(body, route.id);
    const reasoning = body?.choices?.[0]?.message?.reasoning_content;
    if (typeof reasoning === 'string' && reasoning.trim() !== '') {
      normalized.reasoning_content = reasoning;
    }
    return { ok: true, status: response.status, body: normalized, headers: response.headers };
  }

  return {
    ok: true,
    status: response.status,
    body: withPublicModel(body, route.id),
    headers: response.headers,
  };
}
