// ---------------------------------------------------------------------------
// OllamaClient
//
// Thin wrapper around the ollama-js SDK.  All network calls are isolated here
// so the rest of the codebase can depend on this module without knowing SDK
// internals.
// ---------------------------------------------------------------------------

import { Ollama } from 'ollama';

const BASE_URL = 'http://localhost:11434';
const client = new Ollama({ host: BASE_URL });

/**
 * Returns true if Ollama is reachable (HTTP 200 at the root endpoint).
 */
export async function isOllamaReachable(): Promise<boolean> {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Returns the list of model names that are locally pulled.
 */
export async function listPulledModels(): Promise<string[]> {
  const response = await client.list();
  return response.models.map((m) => m.name);
}

/**
 * Pull a model by tag, streaming progress strings via the optional callback.
 */
export async function pullModel(
  tag: string,
  onProgress?: (status: string) => void,
): Promise<void> {
  const stream = await client.pull({ model: tag, stream: true });
  for await (const chunk of stream) {
    if (chunk.status && onProgress) {
      onProgress(chunk.status);
    }
  }
}

/**
 * Send a single chat message to a model and return the response text.
 *
 * @param tag       - model identifier, e.g. "qwen3:8b"
 * @param prompt    - user prompt
 * @param jsonMode  - when true, requests JSON-formatted output (format: 'json')
 */
export async function callModel(
  tag: string,
  prompt: string,
  jsonMode: boolean,
): Promise<string> {
  const response = await client.chat({
    model: tag,
    messages: [{ role: 'user', content: prompt }],
    ...(jsonMode ? { format: 'json' } : {}),
  });
  return response.message.content;
}
