// ---------------------------------------------------------------------------
// JsonRetryRunner
//
// Takes an injected LLM function, a JSON schema object, and a prompt.
// Validates the LLM response against the schema; retries up to MAX_ATTEMPTS
// total with structured error feedback appended to the prompt on each retry.
// Returns either { ok: true, value: T } or { ok: false, error: string }.
// ---------------------------------------------------------------------------

export type LLMFunction = (prompt: string) => Promise<string>;

export type RetryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface RunWithRetryOptions<T> {
  /** The injected LLM callable. Receives the full prompt string, returns raw text. */
  llmFn: LLMFunction;
  /**
   * A plain JSON Schema object used to validate the LLM's response.
   * Validation is structural — checks required fields and types.
   */
  schema: JsonSchema;
  /** The base prompt sent on the first attempt. */
  prompt: string;
  /** Maximum number of attempts (default: 3). */
  maxAttempts?: number;
  /**
   * Optional semantic/domain validator run after schema validation on each attempt.
   * Return a non-null string describing the error to trigger a retry with that
   * error as feedback; return null to accept the value.
   */
  validate?: (value: T) => string | null;
  /** Called each time a retry is triggered, before the next attempt. */
  onRetry?: (attempt: number, error: string) => void;
}

// ---------------------------------------------------------------------------
// Simple structural JSON-schema validator (no external deps)
// ---------------------------------------------------------------------------

export interface JsonSchema {
  type?: string;
  required?: readonly string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean;
}

function validateAgainstSchema(value: unknown, schema: JsonSchema, path = ''): string | null {
  if (schema.type) {
    const jsType = schema.type === 'integer' ? 'number' : schema.type;
    if (schema.type === 'array') {
      if (!Array.isArray(value)) {
        return `${path || 'root'}: expected array, got ${typeof value}`;
      }
      if (schema.items) {
        for (let i = 0; i < (value as unknown[]).length; i++) {
          const err = validateAgainstSchema((value as unknown[])[i], schema.items, `${path}[${i}]`);
          if (err) return err;
        }
      }
    } else if (typeof value !== jsType) {
      return `${path || 'root'}: expected ${schema.type}, got ${typeof value}`;
    }
  }

  if (schema.required && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const field of schema.required) {
      if (!(field in obj)) {
        return `${path || 'root'}: missing required field "${field}"`;
      }
    }
  }

  if (schema.properties && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const [key, subSchema] of Object.entries(schema.properties)) {
      if (key in obj) {
        const err = validateAgainstSchema(obj[key], subSchema, path ? `${path}.${key}` : key);
        if (err) return err;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 3;

export async function runWithRetry<T>(
  options: RunWithRetryOptions<T>,
): Promise<RetryResult<T>> {
  const { llmFn, schema, maxAttempts = MAX_ATTEMPTS, validate, onRetry } = options;
  let currentPrompt = options.prompt;
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await llmFn(currentPrompt);

    // Try to parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const parseError = e instanceof Error ? e.message : String(e);
      lastError = `JSON parse error: ${parseError}`;

      if (attempt < maxAttempts) {
        onRetry?.(attempt, lastError);
        currentPrompt = buildRetryPrompt(options.prompt, raw, lastError, attempt);
      }
      continue;
    }

    // Validate against schema
    const validationError = validateAgainstSchema(parsed, schema);
    if (validationError) {
      lastError = `Schema validation error: ${validationError}`;

      if (attempt < maxAttempts) {
        onRetry?.(attempt, lastError);
        currentPrompt = buildRetryPrompt(options.prompt, raw, lastError, attempt);
      }
      continue;
    }

    // Run optional semantic/domain validator
    if (validate) {
      const customError = validate(parsed as T);
      if (customError) {
        lastError = customError;

        if (attempt < maxAttempts) {
          onRetry?.(attempt, lastError);
          currentPrompt = buildRetryPrompt(options.prompt, raw, lastError, attempt);
        }
        continue;
      }
    }

    return { ok: true, value: parsed as T };
  }

  return { ok: false, error: `Failed after ${maxAttempts} attempts. Last error: ${lastError}` };
}

function buildRetryPrompt(
  basePrompt: string,
  previousOutput: string,
  errorDescription: string,
  attemptNumber: number,
): string {
  return (
    basePrompt +
    `\n\n--- RETRY (attempt ${attemptNumber + 1}) ---` +
    `\nYour previous response was invalid. Here is the error:\n` +
    `error: ${errorDescription}\n` +
    `\nYour previous response was:\n${previousOutput}\n` +
    `\nPlease produce a valid JSON response that satisfies the schema.`
  );
}
