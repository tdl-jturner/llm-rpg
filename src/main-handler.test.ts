import { describe, it, expect } from 'vitest';
import { handleSubmitInput } from './main-handler';

describe('handleSubmitInput', () => {
  it('echoes input prefixed with "> " when no DB provided', async () => {
    const result = await handleSubmitInput('hello');
    expect(result).toEqual({ narrative: ['> hello'] });
  });

  it('handles empty string', async () => {
    const result = await handleSubmitInput('');
    expect(result).toEqual({ narrative: ['> '] });
  });

  it('preserves whitespace in input', async () => {
    const result = await handleSubmitInput('go north');
    expect(result).toEqual({ narrative: ['> go north'] });
  });
});
