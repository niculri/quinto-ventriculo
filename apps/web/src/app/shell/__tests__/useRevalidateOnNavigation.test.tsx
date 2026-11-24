// Tests that a new page checks again the material already read, and nothing else: not the same page, not the student's
// progress, not what was read a moment ago, and never in the admin mode.
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_QUERY } from '../../../shared/lib/contentQuery';
import { RECHECK_AFTER_MS, useRevalidateOnNavigation } from '../useRevalidateOnNavigation';

// Only the clock the reads are dated with: React Query's own timers and waitFor's go on as usual.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

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

const settle = () => new Promise((r) => setTimeout(r, 20));

describe('useRevalidateOnNavigation', () => {
  it('another page reads the material again, even if it never goes stale; the progress, not', async () => {
    const { view, material, progress } = setup();
    await waitFor(() => expect(material).toHaveBeenCalledTimes(1));
    later(RECHECK_AFTER_MS);
    view.rerender({ pathname: '/a', admin: false });
    view.rerender({ pathname: '/b', admin: false });
    await waitFor(() => expect(material).toHaveBeenCalledTimes(2));
    expect(progress).toHaveBeenCalledTimes(1);
  });

  it('what was read or checked a moment ago is not asked again: a few clicks in a row are one check', async () => {
    const { view, material } = setup();
    await waitFor(() => expect(material).toHaveBeenCalledTimes(1));
    later(RECHECK_AFTER_MS - 1);
    view.rerender({ pathname: '/b', admin: false });
    await settle();
    expect(material).toHaveBeenCalledTimes(1);
    later(1);
    view.rerender({ pathname: '/c', admin: false });
    await waitFor(() => expect(material).toHaveBeenCalledTimes(2));
    later(RECHECK_AFTER_MS / 2);
    view.rerender({ pathname: '/d', admin: false });
    await settle();
    expect(material).toHaveBeenCalledTimes(2);
  });

  it('in the admin mode a new page reads nothing again', async () => {
    const { view, material } = setup();
    await waitFor(() => expect(material).toHaveBeenCalledTimes(1));
    later(RECHECK_AFTER_MS);
    view.rerender({ pathname: '/b', admin: true });
    await settle();
    expect(material).toHaveBeenCalledTimes(1);
  });
});
