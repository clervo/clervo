export const HCNSEC_MODELS = Object.freeze({
  'clervo/qwen3.6-35b-a3b': 'Qwen3.6-35B-A3B',
  'clervo/deepseek-v4-flash': 'DeepSeek-V4-Flash',
  'clervo/minimax-m3': 'MiniMax-M3',
});

export const HCNSEC_CLERVO_MODEL = 'clervo/qwen3.6-35b-a3b';
export const HCNSEC_UPSTREAM_MODEL = HCNSEC_MODELS[HCNSEC_CLERVO_MODEL];

const RETRYABLE_STATUSES = new Set([
  401,
  403,
  429,
  500,
  502,
  503,
  504,
]);

function validateBaseUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('invalid_hcnsec_base_url');
  }

  return value.replace(/\/+$/u, '');
}

function validateAccounts(accounts) {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('invalid_hcnsec_accounts');
  }

  return accounts.map((account, index) => {
    if (
      account === null
      || typeof account !== 'object'
      || typeof account.key !== 'string'
      || account.key.length < 16
    ) {
      throw new Error('invalid_hcnsec_accounts');
    }

    return {
      id:
        typeof account.id === 'string' && account.id !== ''
          ? account.id
          : `hcnsec-${index + 1}`,
      key: account.key,
      cooldownUntil: 0,
      consecutiveFailures: 0,
    };
  });
}

export function createHcnsecPool(options) {
  const baseUrl = validateBaseUrl(options.baseUrl);
  const accounts = validateAccounts(options.accounts);
  const fetchImpl = options.fetchImpl ?? fetch;
  const cooldownMs = options.cooldownMs ?? 30_000;

  let cursor = 0;

  function selectAccount(now, tried) {
    for (let offset = 0; offset < accounts.length; offset += 1) {
      const index = (cursor + offset) % accounts.length;
      const account = accounts[index];

      if (tried.has(account.id)) continue;
      if (account.cooldownUntil > now) continue;

      cursor = (index + 1) % accounts.length;
      return account;
    }

    return undefined;
  }

  function markSuccess(account) {
    account.consecutiveFailures = 0;
    account.cooldownUntil = 0;
  }

  function markFailure(account, now, multiplier = 1) {
    account.consecutiveFailures += 1;
    account.cooldownUntil = now + (cooldownMs * multiplier);
  }

  return Object.freeze({
    size: accounts.length,

    async request({
      path,
      payload,
      requestId,
      accept = 'application/json',
      signal,
    }) {
      const tried = new Set();

      let lastFailureResponse;
      let lastNetworkError;

      for (let attempt = 0; attempt < accounts.length; attempt += 1) {
        if (signal?.aborted) {
          throw signal.reason ?? new Error('request_aborted');
        }

        const account = selectAccount(Date.now(), tried);

        if (account === undefined) break;

        tried.add(account.id);

        try {
          const response = await fetchImpl(
            `${baseUrl}${path}`,
            {
              method: 'POST',
              headers: {
                authorization: `Bearer ${account.key}`,
                'content-type': 'application/json',
                accept,
                ...(requestId === undefined
                  ? {}
                  : { 'x-request-id': requestId }),
              },
              body: JSON.stringify(payload),
              signal,
            },
          );

          if (!RETRYABLE_STATUSES.has(response.status)) {
            markSuccess(account);

            return {
              response,
              accountId: account.id,
            };
          }

          const body = await response.arrayBuffer();

          lastFailureResponse = new Response(
            body,
            {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            },
          );

          const cooldownMultiplier =
            response.status === 401 || response.status === 403
              ? 10
              : 1;

          markFailure(
            account,
            Date.now(),
            cooldownMultiplier,
          );
        } catch (error) {
          if (signal?.aborted) throw error;

          lastNetworkError = error;
          markFailure(account, Date.now());
        }
      }

      if (lastFailureResponse !== undefined) {
        return {
          response: lastFailureResponse,
          accountId: undefined,
        };
      }

      if (lastNetworkError !== undefined) {
        throw lastNetworkError;
      }

      const error = new Error(
        'hcnsec_no_healthy_accounts',
      );

      error.code = 'hcnsec_no_healthy_accounts';

      throw error;
    },
  });
}

function contentToText(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }

      if (
        part !== null
        && typeof part === 'object'
        && typeof part.text === 'string'
      ) {
        return part.text;
      }

      return '';
    })
    .filter(Boolean)
    .join('\n');
}

export function responsesToChatPayload(
  payload,
  upstreamModel = HCNSEC_UPSTREAM_MODEL,
) {
  const messages = [];

  if (
    typeof payload.instructions === 'string'
    && payload.instructions.trim() !== ''
  ) {
    messages.push({
      role: 'system',
      content: payload.instructions,
    });
  }

  if (typeof payload.input === 'string') {
    messages.push({
      role: 'user',
      content: payload.input,
    });
  } else if (Array.isArray(payload.input)) {
    for (const item of payload.input) {
      if (
        item === null
        || typeof item !== 'object'
      ) {
        continue;
      }

      const text = contentToText(item.content);

      if (text === '') continue;

      messages.push({
        role:
          typeof item.role === 'string'
            ? item.role
            : 'user',
        content: text,
      });
    }
  }

  if (messages.length === 0) {
    const error = new Error(
      'invalid_responses_input',
    );

    error.code = 'invalid_responses_input';

    throw error;
  }

  const translated = {
    model: upstreamModel,
    messages,
  };

  if (payload.max_output_tokens !== undefined) {
    translated.max_tokens =
      payload.max_output_tokens;
  }

  for (const field of [
    'temperature',
    'top_p',
    'tools',
    'tool_choice',
  ]) {
    if (payload[field] !== undefined) {
      translated[field] = payload[field];
    }
  }

  return translated;
}

export function chatCompletionToResponse(
  chat,
  publicModel,
) {
  const choice =
    Array.isArray(chat?.choices)
      ? chat.choices[0]
      : undefined;

  const text =
    typeof choice?.message?.content === 'string'
      ? choice.message.content
      : '';

  const created =
    Number.isInteger(chat?.created)
      ? chat.created
      : Math.floor(Date.now() / 1000);

  const sourceId =
    typeof chat?.id === 'string'
      ? chat.id
      : String(created);

  return {
    id: `resp_${sourceId}`,
    object: 'response',
    created_at: created,
    status: 'completed',
    model: publicModel,

    output: [
      {
        id: `${sourceId}_message`,
        type: 'message',
        status: 'completed',
        role: 'assistant',

        content: [
          {
            type: 'output_text',
            text,
            annotations: [],
          },
        ],
      },
    ],

    output_text: text,

    usage: {
      input_tokens:
        chat?.usage?.prompt_tokens ?? 0,

      output_tokens:
        chat?.usage?.completion_tokens ?? 0,

      total_tokens:
        chat?.usage?.total_tokens ?? 0,
    },
  };
}
