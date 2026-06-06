import { describe, it, expect } from 'vitest';
import { handleSubmitInput } from './main-handler';

describe('handleSubmitInput', () => {
  it('echoes input prefixed with "> "', () => {
    const result = handleSubmitInput('hello');
    expect(result).toEqual({ narrative: ['> hello'] });
  });

  it('handles empty string', () => {
    const result = handleSubmitInput('');
    expect(result).toEqual({ narrative: ['> '] });
  });

  it('preserves whitespace in input', () => {
    const result = handleSubmitInput('go north');
    expect(result).toEqual({ narrative: ['> go north'] });
  });
});
