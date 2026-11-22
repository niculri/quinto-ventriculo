// Tests that the content API client comes from its provider, and that using it without one fails loudly.
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../../lib/api';
import { ApiClientContext, useApi } from '../useApi';

describe('the API client', () => {
  it('is the one provided', () => {
    const api = createApiClient(async () => null);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiClientContext value={api}>{children}</ApiClientContext>
    );
    expect(renderHook(useApi, { wrapper }).result.current).toBe(api);
  });

  it('cannot be used outside its provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(useApi)).toThrow('useApi outside <ServicesProvider>');
    vi.restoreAllMocks();
  });
});
