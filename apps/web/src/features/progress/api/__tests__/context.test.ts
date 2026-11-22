// Tests that the study repository needs its provider: without it, the code's mistake is said at once.
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStudyRepository } from '../context';

afterEach(() => vi.restoreAllMocks());

describe('useStudyRepository', () => {
  it('outside <ServicesProvider> throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useStudyRepository())).toThrow(
      'useStudyRepository outside <ServicesProvider>',
    );
  });
});
