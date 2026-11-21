// Tests the text told about a failure.
import { describe, expect, it } from 'vitest';
import { errorText } from '../errorText';

describe('errorText', () => {
  it('is the message of an Error', () => {
    expect(errorText(new Error('No se pudo guardar'), 'Falló')).toBe('No se pudo guardar');
    expect(errorText(new TypeError('Failed to fetch'), 'Falló')).toBe('Failed to fetch');
  });

  it('is the fallback for anything that is not an Error, even an empty message', () => {
    expect(errorText('boom', 'Falló')).toBe('Falló');
    expect(errorText(undefined, 'Falló')).toBe('Falló');
    expect(errorText({ message: 'looks like one' }, 'Falló')).toBe('Falló');
    expect(errorText(new Error(''), 'Falló')).toBe('');
  });
});
