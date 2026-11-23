// Tests that a new page checks again the material already read, and nothing else: not the same page, not the student's
// progress, and never in the admin mode.
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CONTENT_QUERY } from '../../../shared/lib/contentQuery';
import { useRevalidateOnNavigation } from '../useRevalidateOnNavigation';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const material = vi.fn(async () => 'apunte');
  const progress = vi.fn(async () => 'avance');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    ({ pathname, admin }: { pathname: string; admin: boolean }) => {
      useQuery({ queryKey: ['note'], queryFn: material, staleTime: Infinity, meta: CONTENT_QUERY });
      useQuery({ queryKey: ['progress'], queryFn: progress, staleTime: Infinity });
      useRevalidateOnNavigation(pathname, admin);
    },
    { wrapper, initialProps: { pathname: '/a', admin: false } },
  );
  return { view, material, progress };
}

describe('useRevalidateOnNavigation', () => {
  it('another page reads the material again, even if it never goes stale; the progress, not', async () => {
    const { view, material, progress } = setup();
    await waitFor(() => expect(material).toHaveBeenCalledTimes(1));
    view.rerender({ pathname: '/a', admin: false });
    view.rerender({ pathname: '/b', admin: false });
    await waitFor(() => expect(material).toHaveBeenCalledTimes(2));
    expect(progress).toHaveBeenCalledTimes(1);
  });

  it('in the admin mode a new page reads nothing again', async () => {
    const { view, material } = setup();
    await waitFor(() => expect(material).toHaveBeenCalledTimes(1));
    view.rerender({ pathname: '/b', admin: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(material).toHaveBeenCalledTimes(1);
  });
});
