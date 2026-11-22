// Tests the importer's own errors: they are errors, and say what kind of problem they are.
import { describe, expect, it } from 'vitest';
import { ImportError } from '../ImportError';

describe('ImportError', () => {
  it('is an error with its kind and its message, and keeps the cause', () => {
    const cause = new Error('antes');
    const e = new ImportError('manifest', 'el catálogo está mal', { cause });
    expect(e).toBeInstanceOf(Error);
    expect(e.kind).toBe('manifest');
    expect(e.name).toBe('ImportError');
    expect(e.message).toBe('el catálogo está mal');
    expect(e.cause).toBe(cause);
  });
});
