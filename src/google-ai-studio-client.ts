// ---------------------------------------------------------------------------
// GoogleAIStudioClient
//
// Thin wrapper around the @google/genai SDK for use with Google AI Studio
// (free-tier API keys from aistudio.google.com).
// ---------------------------------------------------------------------------

import { GoogleGenAI } from '@google/genai';

const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 2000;

function getStatus(e: unknown): number | undefined {
  if (e instanceof Error && 'status' in e) return (e as { status: unknown }).status as number;
  return undefined;
}

function isRateLimit(e: unknown): boolean {
  const status = getStatus(e);
  const msg = (e instanceof Error ? e.message : String(e)).toUpperCase();
  return status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('RATE_LIMIT');
}

function isTransient(e: unknown): boolean {
  const status = getStatus(e);
  const msg = (e instanceof Error ? e.message : String(e)).toUpperCase();
  return status === 503 || msg.includes('503') || msg.includes('UNAVAILABLE');
}

/**
 * Send a single prompt to a Gemini model and return the response text.
 * Retries up to MAX_RETRIES times on transient 503 errors.
 *
 * @param apiKey    - Google AI Studio API key
 * @param tag       - model identifier, e.g. "gemini-2.5-flash"
 * @param prompt    - user prompt
 * @param jsonMode  - when true, requests JSON-formatted output
 */
export async function callModel(
  apiKey: string,
  tag: string,
  prompt: string,
  jsonMode: boolean,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: tag,
        contents: prompt,
        ...(jsonMode ? { config: { responseMimeType: 'application/json' } } : {}),
      });
      return response.text ?? '';
    } catch (e) {
      if (isRateLimit(e)) {
        throw new Error(
          'The oracles are on a break — they have answered too many questions this hour. ' +
            'Rest a moment and try again.',
        );
      }
      if (isTransient(e) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * 2 ** attempt));
        continue;
      }
      if (isTransient(e)) {
        throw new Error(
          'The oracles are overwhelmed and cannot answer. The distant realm is experiencing high demand. ' +
            'Try again in a moment.',
        );
      }
      throw e;
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error('The oracles gave no answer.');
}
