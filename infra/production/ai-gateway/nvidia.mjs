import { chatCompletionToResponse, responsesToChatPayload } from './hcnsec.mjs';

export async function requestNvidia({ route, path, payload, apiKey, baseUrl = 'https://integrate.api.nvidia.com/v1', signal, requestId }) {
  const upstreamPath = path === '/v1/responses' ? '/chat/completions' : path.slice(3);
  const providerPayload = path === '/v1/responses'
    ? responsesToChatPayload(payload, route.upstream)
    : { ...payload, model: route.upstream };

  const response = await fetch(`${baseUrl.replace(/\/+$/u, '')}${upstreamPath}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
      'x-request-id': requestId,
    },
    body: JSON.stringify(providerPayload),
    signal,
  });

  const text = await response.text();
  let body = null;
  try { body = text === '' ? null : JSON.parse(text); } catch { body = { raw: text.slice(0, 1000) }; }

  if (!response.ok) return { ok: false, status: response.status, body, headers: response.headers };

  if (path === '/v1/responses') {
    return { ok: true, status: response.status, body: chatCompletionToResponse(body, route.id), headers: response.headers };
  }

  if (body && typeof body === 'object') body.model = route.id;
  return { ok: true, status: response.status, body, headers: response.headers };
}
