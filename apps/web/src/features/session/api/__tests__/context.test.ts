// Tests that the auth service needs its provider: without it, the code's mistake is said at once.
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGoogleIdentity, useSessionService } from '../context';

afterEach(() => vi.restoreAllMocks());

describe('useSessionService', () => {
  it('outside <ServicesProvider> throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useSessionService())).toThrow(
      'useSessionService outside <ServicesProvider>',
    );
  });
});

describe('useGoogleIdentity', () => {
  it('without a provider there is no Google button', () => {
    expect(renderHook(() => useGoogleIdentity()).result.current).toBeNull();
  });
});
