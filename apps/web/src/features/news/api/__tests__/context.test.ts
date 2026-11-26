// Tests that the repository of what was read needs its provider: without it, the code's mistake is said at once.
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNewsRepository } from '../context';

afterEach(() => vi.restoreAllMocks());

describe('useNewsRepository', () => {
  it('outside <ServicesProvider> throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useNewsRepository())).toThrow(
      'useNewsRepository outside <ServicesProvider>',
    );
  });
});
