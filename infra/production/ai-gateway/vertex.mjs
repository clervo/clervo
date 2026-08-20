import { chatCompletionToResponse, responsesToChatPayload } from './hcnsec.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decodeBase64(value) {
  if (typeof value !== 'string' || value.length < 8) return null;
  try { return Buffer.from(value, 'base64'); } catch { return null; }
}

function visibleText(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.filter((part) => part?.thought !== true).map((part) => typeof part?.text === 'string' ? part.text : '').filter(Boolean).join('\n').trim();
}

function inlinePart(json, prefix) {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const blob = part?.inlineData ?? part?.inline_data;
    const data = blob?.data;
    const mime = blob?.mimeType ?? blob?.mime_type;
    const bytes = decodeBase64(data);
    if (bytes && bytes.length > 0 && typeof mime === 'string' && mime.startsWith(prefix)) return { data, mime, bytes };
  }
  return null;
}

function largestVector(node, found = []) {
  if (Array.isArray(node)) {
    if (node.length >= 32 && node.every((value) => typeof value === 'number' && Number.isFinite(value))) found.push(node);
    for (const item of node) largestVector(item, found);
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) largestVector(value, found);
  }
  return found.sort((a, b) => b.length - a.length)[0] ?? null;
}

function safeProviderError(json, status) {
  return {
    error: {
      type: 'vertex_upstream_error',
      code: String(json?.error?.status ?? json?.error?.code ?? status ?? 'unknown').slice(0, 120),
      message: typeof json?.error?.message === 'string' ? json.error.message.replace(/[A-Za-z0-9+/_=-]{40,}/gu, '[REDACTED]').slice(0, 500) : 'Vertex request failed.',
    },
  };
}

export function createVertexClient(options = {}) {
  const projectId = options.projectId ?? 'bloxsniper-prod';
  const metadataTokenUrl = options.metadataTokenUrl ?? 'http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token';
  const requestTimeoutMs = options.requestTimeoutMs ?? 600_000;
  const videoPollMs = options.videoPollMs ?? 5_000;
  let cachedToken = null;
  let tokenExpiresAt = 0;

  async function accessToken() {
    if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;
    const response = await fetch(metadataTokenUrl, { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`vertex_metadata_token_${response.status}`);
    const body = await response.json();
    if (typeof body?.access_token !== 'string' || body.access_token.length < 20) throw new Error('vertex_metadata_token_invalid');
    cachedToken = body.access_token;
    tokenExpiresAt = Date.now() + (Number(body.expires_in ?? 3000) * 1000);
    return cachedToken;
  }

  async function requestJson(url, body, { method = 'POST', signal, timeoutMs = requestTimeoutMs } = {}) {
    const token = await accessToken();
    const localController = new AbortController();
    const timeout = setTimeout(() => localController.abort(new Error('vertex_timeout')), timeoutMs);
    const abort = () => localController.abort(signal?.reason ?? new Error('client_aborted'));
    if (signal) signal.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          'x-goog-user-project': projectId,
          'content-type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: localController.signal,
      });
      const text = await response.text();
      let json = null;
      try { json = text === '' ? null : JSON.parse(text); } catch {}
      return { ok: response.ok, status: response.status, json, headers: response.headers };
    } finally {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener('abort', abort);
    }
  }

  function modelUrl(model, action, location = 'global') {
    const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
    return `https://${host}/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:${action}`;
  }

  function chatToVertex(payload) {
    const contents = [];
    const systemParts = [];
    for (const message of payload.messages ?? []) {
      const parts = [];
      const content = message?.content;
      if (typeof content === 'string') parts.push({ text: content });
      else if (Array.isArray(content)) {
        for (const part of content) {
          if (typeof part?.text === 'string') parts.push({ text: part.text });
          else if (part?.type === 'text' && typeof part.text === 'string') parts.push({ text: part.text });
          else if (part?.type === 'image_url' && typeof part?.image_url?.url === 'string' && part.image_url.url.startsWith('data:')) {
            const match = /^data:([^;]+);base64,(.+)$/u.exec(part.image_url.url);
            if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          }
        }
      }
      if (parts.length === 0) continue;
      if (message.role === 'system') systemParts.push(...parts.filter((part) => part.text));
      else contents.push({ role: message.role === 'assistant' ? 'model' : 'user', parts });
    }
    return {
      contents,
      ...(systemParts.length ? { systemInstruction: { parts: systemParts } } : {}),
      generationConfig: {
        temperature: payload.temperature ?? 0,
        maxOutputTokens: payload.max_tokens ?? payload.max_completion_tokens ?? 1024,
      },
    };
  }

  async function chat(route, path, payload, signal) {
    const chatPayload = path === '/v1/responses' ? responsesToChatPayload(payload, route.upstream) : { ...payload, model: route.upstream };
    const result = await requestJson(modelUrl(route.upstream, 'generateContent'), chatToVertex(chatPayload), { signal });
    if (!result.ok) return { ok: false, status: result.status, kind: 'json', body: safeProviderError(result.json, result.status) };
    const text = visibleText(result.json);
    const completion = {
      id: `chatcmpl_vertex_${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: route.id,
      choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    return { ok: true, status: 200, kind: 'json', body: path === '/v1/responses' ? chatCompletionToResponse(completion, route.id) : completion };
  }

  async function image(route, payload, signal) {
    const prompt = payload.prompt ?? payload.input;
    if (typeof prompt !== 'string' || prompt.trim() === '') return { ok: false, status: 400, kind: 'json', body: { error: { code: 'prompt_required', message: 'prompt is required' } } };
    const result = await requestJson(modelUrl(route.upstream, 'generateContent'), {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], candidateCount: 1, imageConfig: { aspectRatio: payload.aspect_ratio ?? '1:1' } },
    }, { signal, timeoutMs: 180_000 });
    if (!result.ok) return { ok: false, status: result.status, kind: 'json', body: safeProviderError(result.json, result.status) };
    const generated = inlinePart(result.json, 'image/');
    if (!generated) return { ok: false, status: 502, kind: 'json', body: { error: { code: 'empty_image', message: 'Vertex returned no image.' } } };
    return { ok: true, status: 200, kind: 'json', body: { created: Math.floor(Date.now() / 1000), model: route.id, data: [{ b64_json: generated.data, mime_type: generated.mime }] } };
  }

  async function embedding(route, payload, signal) {
    const inputs = Array.isArray(payload.input) ? payload.input : [payload.input];
    if (inputs.length === 0 || inputs.some((item) => typeof item !== 'string')) return { ok: false, status: 400, kind: 'json', body: { error: { code: 'input_required', message: 'input must be a string or string array' } } };
    const location = 'us-central1';
    const data = [];
    for (let index = 0; index < inputs.length; index += 1) {
      const multimodal = route.upstream === 'multimodalembedding@001';
      const body = multimodal
        ? { instances: [{ text: inputs[index] }], parameters: { dimension: route.dimension ?? 128 } }
        : { instances: [{ content: inputs[index] }], parameters: { autoTruncate: false } };
      const result = await requestJson(modelUrl(route.upstream, 'predict', location), body, { signal });
      if (!result.ok) return { ok: false, status: result.status, kind: 'json', body: safeProviderError(result.json, result.status) };
      const vector = largestVector(result.json);
      if (!vector) return { ok: false, status: 502, kind: 'json', body: { error: { code: 'empty_embedding', message: 'Vertex returned no embedding.' } } };
      data.push({ object: 'embedding', index, embedding: vector });
    }
    return { ok: true, status: 200, kind: 'json', body: { object: 'list', model: route.id, data, usage: { prompt_tokens: 0, total_tokens: 0 } } };
  }

  async function speech(route, payload, signal) {
    if (typeof payload.input !== 'string' || payload.input.trim() === '') return { ok: false, status: 400, kind: 'json', body: { error: { code: 'input_required', message: 'input is required' } } };
    const result = await requestJson(modelUrl(route.upstream, 'generateContent'), {
      contents: [{ role: 'user', parts: [{ text: payload.input }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: payload.voice ?? 'Kore' } } },
      },
    }, { signal, timeoutMs: 180_000 });
    if (!result.ok) return { ok: false, status: result.status, kind: 'json', body: safeProviderError(result.json, result.status) };
    const audio = inlinePart(result.json, 'audio/');
    if (!audio) return { ok: false, status: 502, kind: 'json', body: { error: { code: 'empty_audio', message: 'Vertex returned no audio.' } } };
    return { ok: true, status: 200, kind: 'binary', body: audio.bytes, contentType: audio.mime, headers: { 'x-clervo-model': route.id } };
  }

  function videoFromOperation(json) {
    const videos = json?.response?.videos ?? json?.response?.generatedVideos ?? [];
    if (!Array.isArray(videos)) return null;
    for (const item of videos) {
      const video = item?.video ?? item;
      const data = video?.bytesBase64Encoded ?? video?.data;
      const uri = video?.gcsUri ?? video?.uri;
      const mime = video?.mimeType ?? video?.mime_type ?? 'video/mp4';
      if (typeof data === 'string' && data.length > 1000) return { b64_json: data, mime_type: mime };
      if (typeof uri === 'string' && uri.length > 8) return { url: uri, mime_type: mime };
    }
    return null;
  }

  async function veo(route, payload, signal) {
    const location = 'us-central1';
    const start = await requestJson(modelUrl(route.upstream, 'predictLongRunning', location), {
      instances: [{ prompt: payload.prompt ?? payload.input ?? 'A matte black cube rotates on a white background.' }],
      parameters: {
        aspectRatio: payload.aspect_ratio ?? '16:9',
        sampleCount: 1,
        durationSeconds: Math.max(4, Math.min(8, Number(payload.duration_seconds ?? 4))),
        personGeneration: payload.person_generation ?? 'disallow',
        resolution: payload.resolution ?? '720p',
      },
    }, { signal, timeoutMs: 120_000 });
    if (!start.ok) return { ok: false, status: start.status, kind: 'json', body: safeProviderError(start.json, start.status) };
    const operationName = start.json?.name;
    if (typeof operationName !== 'string') return { ok: false, status: 502, kind: 'json', body: { error: { code: 'invalid_video_operation', message: 'Vertex returned no operation.' } } };
    const deadline = Date.now() + 420_000;
    while (Date.now() < deadline) {
      const poll = await requestJson(modelUrl(route.upstream, 'fetchPredictOperation', location), { operationName }, { signal, timeoutMs: 60_000 });
      if (!poll.ok) return { ok: false, status: poll.status, kind: 'json', body: safeProviderError(poll.json, poll.status) };
      if (poll.json?.done === true) {
        const video = videoFromOperation(poll.json);
        if (!video) return { ok: false, status: 502, kind: 'json', body: { error: { code: 'empty_video', message: 'Vertex completed without video.' } } };
        return { ok: true, status: 200, kind: 'json', body: { object: 'video.generation', status: 'completed', model: route.id, data: [video] } };
      }
      await sleep(videoPollMs);
    }
    return { ok: false, status: 504, kind: 'json', body: { error: { code: 'video_timeout', message: 'Video generation timed out.' } } };
  }

  function interactionMedia(json, type) {
    for (const output of json?.outputs ?? []) {
      if (output?.type === type && typeof output?.data === 'string') return { b64_json: output.data, mime_type: output.mime_type ?? output.mimeType ?? `${type}/mpeg` };
    }
    for (const step of json?.steps ?? []) {
      for (const item of step?.content ?? []) {
        if (item?.type !== type) continue;
        if (typeof item?.data === 'string') return { b64_json: item.data, mime_type: item.mime_type ?? item.mimeType ?? `${type}/mp4` };
        if (typeof item?.uri === 'string') return { url: item.uri, mime_type: item.mime_type ?? item.mimeType ?? `${type}/mp4` };
      }
    }
    return null;
  }

  async function interaction(route, payload, signal) {
    const url = `https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}/locations/global/interactions`;
    const isOmni = route.upstream === 'gemini-omni-flash-preview';
    const body = isOmni ? {
      model: route.upstream,
      input: [{ type: 'text', text: payload.prompt ?? payload.input ?? 'A matte black cube rotates on a white studio background.' }],
      response_format: [{ type: 'video', aspect_ratio: payload.aspect_ratio ?? '16:9', duration: `${Math.max(3, Number(payload.duration_seconds ?? 3))}s` }],
      generation_config: { video_config: { task: 'text_to_video' } },
    } : {
      model: route.upstream,
      input: [{ type: 'text', text: payload.prompt ?? payload.input ?? 'Instrumental ambient electronic music, calm, minimal, no vocals.' }],
    };
    const result = await requestJson(url, body, { signal, timeoutMs: 360_000 });
    if (!result.ok) return { ok: false, status: result.status, kind: 'json', body: safeProviderError(result.json, result.status) };
    const type = isOmni ? 'video' : 'audio';
    const media = interactionMedia(result.json, type);
    if (!media) return { ok: false, status: 502, kind: 'json', body: { error: { code: `empty_${type}`, message: `Vertex returned no ${type}.` } } };
    return { ok: true, status: 200, kind: 'json', body: { object: `${type}.generation`, status: result.json?.status ?? 'completed', model: route.id, data: [media] } };
  }

  async function virtualTryOn(route, payload, signal) {
    const person = payload?.person_image?.b64_json ?? payload?.personImage?.b64_json;
    const product = payload?.product_image?.b64_json ?? payload?.product_images?.[0]?.b64_json;
    if (typeof person !== 'string' || typeof product !== 'string') return { ok: false, status: 400, kind: 'json', body: { error: { code: 'images_required', message: 'person_image.b64_json and product_image.b64_json are required.' } } };
    const result = await requestJson(modelUrl(route.upstream, 'predict', 'us-central1'), {
      instances: [{
        personImage: { image: { bytesBase64Encoded: person } },
        productImages: [{ image: { bytesBase64Encoded: product } }],
      }],
      parameters: { sampleCount: 1 },
    }, { signal, timeoutMs: 240_000 });
    if (!result.ok) return { ok: false, status: result.status, kind: 'json', body: safeProviderError(result.json, result.status) };
    for (const prediction of result.json?.predictions ?? []) {
      const data = prediction?.bytesBase64Encoded ?? prediction?.image?.bytesBase64Encoded;
      if (typeof data === 'string' && data.length > 1000) return { ok: true, status: 200, kind: 'json', body: { created: Math.floor(Date.now() / 1000), model: route.id, data: [{ b64_json: data, mime_type: prediction?.mimeType ?? prediction?.image?.mimeType ?? 'image/png' }] } };
    }
    return { ok: false, status: 502, kind: 'json', body: { error: { code: 'empty_try_on', message: 'Vertex returned no try-on image.' } } };
  }

  return Object.freeze({
    async request({ route, path, payload, signal }) {
      if (route.capability === 'text') return chat(route, path, payload, signal);
      if (route.capability === 'image') return image(route, payload, signal);
      if (route.capability === 'embedding') return embedding(route, payload, signal);
      if (route.capability === 'tts') return speech(route, payload, signal);
      if (route.capability === 'video') return route.protocol === 'interactions' ? interaction(route, payload, signal) : veo(route, payload, signal);
      if (route.capability === 'music') return interaction(route, payload, signal);
      if (route.capability === 'virtual_try_on') return virtualTryOn(route, payload, signal);
      return { ok: false, status: 400, kind: 'json', body: { error: { code: 'unsupported_capability', message: 'Unsupported capability.' } } };
    },
  });
}
