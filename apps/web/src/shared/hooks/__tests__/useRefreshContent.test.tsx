// Tests that the refresh of the material comes from its provider, and that without one it does nothing.
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { RefreshContentContext, useRefreshContent } from '../useRefreshContent';

describe('useRefreshContent', () => {
  it('is the one provided', () => {
    const refresh = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RefreshContentContext value={refresh}>{children}</RefreshContentContext>
    );
    renderHook(useRefreshContent, { wrapper }).result.current();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('without a provider it does nothing', () => {
    const refresh = renderHook(useRefreshContent).result.current;
    expect(refresh).not.toThrow();
  });
});
