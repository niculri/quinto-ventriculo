// Tests useMediaRecovery: an article's or a card's images watched in the element or its Shadow DOM (also one attached
// after it) while the component is there, signed again with a copy of their read, also those of new content.
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_QUERY } from '../../lib/contentQuery';
import { markSanitized } from '../../lib/sanitizedHtml';
import { SafeHtml } from '../../ui/SafeHtml';
import { useMediaRecovery } from '../useMediaRecovery';

const NOW = 1_800_000_000;
/** After the first links expire (30 hours from NOW). */
const LATER = NOW + 31 * 3600;
const NEXT = NOW + 3 * 86_400;
const src = (e: number) => `/api/media/notes/aaaa.webp?e=${e}&amp;s=s${e}`;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let e = NOW + 30 * 3600;
  const read = vi.fn(() => Promise.resolve(`<img src="${src(e)}" alt="a">`));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, read, sign: () => (e = NEXT) };
}

function fillShadow(host: HTMLElement, html: string) {
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  if (!root.firstChild) root.innerHTML = html;
}

function Article({ read, shadow = false }: { read: () => Promise<string>; shadow?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useQuery({ queryKey: ['note'], queryFn: read, meta: CONTENT_QUERY }).data ?? '';
  useMediaRecovery(ref, html, shadow);
  useLayoutEffect(() => {
    if (shadow && html) fillShadow(ref.current!, html);
  }, [html, shadow]);
  return shadow ? (
    <div ref={ref} data-testid="host" />
  ) : (
    <SafeHtml as="div" ref={ref} data-testid="host" html={markSanitized(html)} />
  );
}

const imgIn = (host: HTMLElement) => (host.shadowRoot ?? host).querySelector('img');

afterEach(() => {
  vi.useRealTimers();
});

describe('useMediaRecovery', () => {
  it('signs again an expired image of the article with a copy of its read', async () => {
    const { wrapper, read, sign } = setup();
    const { findByRole, getByTestId } = render(<Article read={read} />, { wrapper });
    const img = await findByRole('img');
    vi.useFakeTimers({ now: LATER * 1000, toFake: ['Date'] });
    sign();
    await act(async () => {
      img.dispatchEvent(new Event('error'));
      await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    });
    await vi.waitFor(() =>
      expect(imgIn(getByTestId('host'))!.getAttribute('src')).toContain(`e=${NEXT}`),
    );
  });

  it('watches a Shadow DOM that the component attaches after it, and nothing once it is gone', async () => {
    const { wrapper, read, sign } = setup();
    const { getByTestId, unmount } = render(<Article read={read} shadow />, { wrapper });
    await vi.waitFor(() => expect(imgIn(getByTestId('host'))).toBeTruthy());
    const img = imgIn(getByTestId('host'))!;
    vi.useFakeTimers({ now: LATER * 1000, toFake: ['Date'] });
    sign();
    await act(async () => {
      img.dispatchEvent(new Event('error'));
      await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    });
    unmount();
    img.dispatchEvent(new Event('error'));
    await new Promise((r) => setTimeout(r, 0));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('an image that comes with the content and expires soon is signed again before it fails', async () => {
    const { wrapper } = setup();
    let e = NOW + 30 * 3600;
    const read = vi.fn(() => Promise.resolve(`<img src="${src(e)}" alt="a">`));
    vi.useFakeTimers({ now: (NOW + 29 * 3600) * 1000, toFake: ['Date'] });
    const { getByTestId } = render(<Article read={read} />, { wrapper });
    e = NEXT;
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(imgIn(getByTestId('host'))!.getAttribute('src')).toContain(`e=${NEXT}`),
    );
  });

  it('a host that is not there is not watched', () => {
    function Detached() {
      const ref = useRef<HTMLDivElement>(null);
      useMediaRecovery(ref, '', true);
      return null;
    }
    const { wrapper } = setup();
    expect(() => render(<Detached />, { wrapper })).not.toThrow();
  });
});
