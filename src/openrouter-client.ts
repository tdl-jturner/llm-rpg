// ---------------------------------------------------------------------------
// OpenRouterClient
//
// Thin fetch wrapper for the OpenRouter API (OpenAI-compatible).
// https://openrouter.ai/docs
// ---------------------------------------------------------------------------

const BASE_URL = 'https://openrouter.ai/api/v1';
const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 2000;

interface OpenRouterResponse {
  choices?: Array<{ message: { content: string } }>;
  error?: { message: string; code: number };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Send a single prompt to an OpenRouter model and return the response text.
 * Retries with exponential backoff on transient 502/503 errors.
 *
 * @param apiKey    - OpenRouter API key
 * @param tag       - model identifier, e.g. "meta-llama/llama-3.1-8b-instruct:free"
 * @param prompt    - user prompt
 * @param jsonMode  - when true, requests JSON-formatted output
 */
export async function callModel(
  apiKey: string,
  tag: string,
  prompt: string,
  jsonMode: boolean,
): Promise<string> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'LLM RPG',
        },
        body: JSON.stringify({
          model: tag,
          messages: [{ role: 'user', content: prompt }],
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } catch {
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw new Error(
        'The oracles cannot be reached across the void. Check your connection and try again.',
      );
    }

    if (res.status === 429) {
      throw new Error(
        'The oracles are on a break — they have answered too many questions this hour. ' +
          'Rest a moment and try again.',
      );
    }

    if ((res.status === 502 || res.status === 503) && attempt < MAX_RETRIES) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      continue;
    }

    const data = (await res.json()) as OpenRouterResponse;

    if (!res.ok) {
      if (res.status === 502 || res.status === 503) {
        throw new Error(
          'The oracles are overwhelmed and cannot answer. The distant realm is experiencing high demand. ' +
            'Try again in a moment.',
        );
      }
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`The oracle refused to answer: ${msg}`);
    }

    return data.choices?.[0]?.message?.content ?? '';
  }

  throw new Error('The oracles gave no answer.');
}

/**
 * Fetch free models from OpenRouter. Returns an array of model IDs sorted
 * alphabetically. Returns empty array on any error.
 */
export async function listFreeModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data: Array<{ id: string; pricing: { prompt: string; completion: string } }>;
    };
    return data.data
      .filter((m) => m.pricing?.prompt === '0' && m.pricing?.completion === '0')
      .map((m) => m.id)
      .sort();
  } catch {
    return [];
  }
}
