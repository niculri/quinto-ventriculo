// Tests useSignedImage: a drawn photo kept while only its signature changes, one not drawn signed again before it expires,
// an expired one that fails signed again once, any other failure a notice, and «Reintentar» with the focus back.
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FreshMedia, RenewMedia } from '../../lib/signedMedia';
import { MediaFallback } from '../../ui/MediaFallback';
import { useSignedImage } from '../useSignedImage';

const NOW = 1_800_000_000;
const PATH = '/api/media/tests/aaaa.webp';
const url = (e: number) => `${PATH}?e=${e}&s=s${e}`;
const EXPIRED = url(NOW - 10);
const FRESH = url(NOW + 86_400);
const HOUR = 3600;
const freshWith =
  (found: string | null): FreshMedia =>
  (path) =>
    path === PATH ? found : null;

function Photo({ src, renew }: { src: string | undefined; renew: RenewMedia }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const image = useSignedImage(src, renew, buttonRef);
  const photo = (
    <img
      key={image.attempt}
      src={image.src}
      alt="Gel"
      width={300}
      height={200}
      style={image.failure ? { display: 'none' } : undefined}
      onError={image.onError}
      onLoad={image.onLoad}
    />
  );
  return image.failure ? (
    <MediaFallback
      alt="Gel"
      width={300}
      height={200}
      retrying={image.failure.retrying}
      onRetry={image.retry}
    >
      {image.failure.retrying ? photo : null}
    </MediaFallback>
  ) : (
    <button ref={buttonRef} type="button">
      {photo}
    </button>
  );
}

const img = () => screen.getByRole('img', { hidden: true });
const settle = () => act(() => new Promise((r) => setTimeout(r, 0)));
const visibility = (state: DocumentVisibilityState) => {
  act(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  });
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('a photo that fails', () => {
  it('expired, is signed again once: only its src changes; failing again, the notice', async () => {
    const renew = vi.fn(() => Promise.resolve(freshWith(FRESH)));
    const { rerender } = render(<Photo src={url(NOW + 5 * HOUR)} renew={renew} />);
    await settle();
    vi.setSystemTime((NOW + 6 * HOUR) * 1000);
    fireEvent.error(img());
    await settle();
    expect(renew).toHaveBeenCalledExactlyOnceWith(PATH, NOW + 6 * HOUR);
    expect(img()).toHaveAttribute('src', FRESH);
    fireEvent.error(img());
    await settle();
    expect(renew).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('group', { name: 'Imagen: Gel' })).toBeInTheDocument();
    expect(await screen.findByText('No se pudo cargar la imagen')).toBeInTheDocument();
    // The page brings the new URL itself: a new image, without a failure.
    rerender(<Photo src={url(NOW + 2 * 86_400)} renew={renew} />);
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('still valid, shows the notice at once, without asking for anything', async () => {
    const renew = vi.fn();
    render(<Photo src={FRESH} renew={renew} />);
    fireEvent.error(img());
    await settle();
    expect(renew).not.toHaveBeenCalled();
    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  it.each([
    ['brings no URL', () => Promise.resolve(freshWith(null))],
    ['brings the same URL', () => Promise.resolve(freshWith(EXPIRED))],
    ['brings one already expired', () => Promise.resolve(freshWith(url(NOW - 1)))],
    ['fails', () => Promise.reject(new Error('sin red'))],
  ])('after a renewal that %s, the notice', async (_, renew) => {
    render(<Photo src={EXPIRED} renew={renew} />);
    await settle();
    fireEvent.error(img());
    await settle();
    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  it('a photo that is not a signed image fails without asking for anything', async () => {
    const renew = vi.fn();
    const { result } = renderHook(() => useSignedImage('/logo.svg', renew));
    act(() => {
      result.current.onError();
    });
    await settle();
    expect(result.current.failure).toEqual({ src: '/logo.svg', retrying: false });
    expect(renew).not.toHaveBeenCalled();
  });
});

describe('«Reintentar»', () => {
  it('loads it again hidden behind the notice, and the focus comes back to the photo', async () => {
    render(<Photo src={FRESH} renew={vi.fn()} />);
    fireEvent.error(img());
    await settle();
    const retry = screen.getByRole('button', { name: 'Reintentar' });
    retry.focus();
    fireEvent.click(retry);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando la imagen…');
    expect(img()).toHaveStyle({ display: 'none' });
    fireEvent.error(img());
    await settle();
    expect(await screen.findByText('No se pudo cargar la imagen')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    fireEvent.load(img());
    expect(screen.queryByRole('group')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button'));
  });

  it('on an expired photo signs it again; the hidden photo failing meanwhile changes nothing', async () => {
    let answer: (fresh: FreshMedia) => void = () => undefined;
    const renew = vi
      .fn<RenewMedia>()
      .mockResolvedValueOnce(freshWith(null))
      .mockResolvedValueOnce(freshWith(null))
      .mockImplementationOnce(() => new Promise((r) => (answer = r)));
    render(<Photo src={EXPIRED} renew={renew} />);
    await settle();
    fireEvent.error(img());
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    fireEvent.error(img());
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando la imagen…');
    answer(freshWith(FRESH));
    await settle();
    expect(img()).toHaveAttribute('src', FRESH);
    expect(screen.queryByRole('group')).toBeNull();
    // The focus was not on «Reintentar»: nothing takes it.
    expect(document.activeElement).toBe(document.body);
  });
});

describe('a photo drawn', () => {
  it('keeps its URL, the same element, while the page only signs it again; another image is drawn', async () => {
    const renew = vi.fn();
    const { rerender } = render(<Photo src={FRESH} renew={renew} />);
    const first = img();
    fireEvent.load(first);
    rerender(<Photo src={url(NOW + 2 * 86_400)} renew={renew} />);
    expect(img()).toBe(first);
    expect(first).toHaveAttribute('src', FRESH);
    rerender(<Photo src="/api/media/tests/otra.webp?e=1&s=x" renew={renew} />);
    expect(img()).toHaveAttribute('src', '/api/media/tests/otra.webp?e=1&s=x');
  });

  it('if the URL it kept fails (out of the browser’s memory), the newest one is drawn; if that was the newest, it is recovered', async () => {
    const renew = vi.fn(() => Promise.resolve(freshWith(url(NOW + 3 * 86_400))));
    const { rerender } = render(<Photo src={EXPIRED} renew={renew} />);
    fireEvent.load(img());
    rerender(<Photo src={FRESH} renew={renew} />);
    expect(img()).toHaveAttribute('src', EXPIRED);
    fireEvent.error(img());
    await settle();
    expect(img()).toHaveAttribute('src', FRESH);
    fireEvent.load(img());
    vi.setSystemTime((NOW + 2 * 86_400) * 1000);
    fireEvent.error(img());
    await settle();
    expect(img()).toHaveAttribute('src', url(NOW + 3 * 86_400));
  });

  it('is not signed again ahead', async () => {
    const renew = vi.fn();
    render(<Photo src={url(NOW + HOUR)} renew={renew} />);
    fireEvent.load(img());
    await settle();
    visibility('visible');
    expect(renew).not.toHaveBeenCalled();
  });
});

describe('a photo not drawn yet', () => {
  it('whose link expires within ten minutes is signed again at once, and once', async () => {
    const renew = vi.fn(() => Promise.resolve(freshWith(FRESH)));
    render(<Photo src={url(NOW + 5 * 60)} renew={renew} />);
    await settle();
    expect(renew).toHaveBeenCalledExactlyOnceWith(PATH, NOW + 10 * 60);
    expect(img()).toHaveAttribute('src', FRESH);
  });

  it('a renewal that brings nothing is not asked for again, nor when the page comes back', async () => {
    const renew = vi.fn(() => Promise.resolve(freshWith(url(NOW + 5 * 60))));
    render(<Photo src={url(NOW + 5 * 60)} renew={renew} />);
    await settle();
    visibility('visible');
    await settle();
    expect(renew).toHaveBeenCalledTimes(1);
    expect(img()).toHaveAttribute('src', url(NOW + 5 * 60));
  });

  it('a later one waits until ten minutes before it expires; hidden, until the page comes back', async () => {
    vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const renew = vi.fn(() => Promise.resolve(freshWith(FRESH)));
    render(<Photo src={url(NOW + HOUR)} renew={renew} />);
    await act(() => vi.advanceTimersByTimeAsync(30 * 60 * 1000));
    visibility('visible');
    expect(renew).not.toHaveBeenCalled();
    visibility('hidden');
    await act(() => vi.advanceTimersByTimeAsync(20 * 60 * 1000 + 1000));
    expect(renew).not.toHaveBeenCalled();
    visibility('visible');
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(renew).toHaveBeenCalledExactlyOnceWith(PATH, NOW + HOUR + 1);
    expect(img()).toHaveAttribute('src', FRESH);
  });
});

describe('without a photo', () => {
  it('there is nothing to recover', async () => {
    const renew = vi.fn();
    const { result } = renderHook(() => useSignedImage(undefined, renew));
    act(() => {
      result.current.onError();
      result.current.onLoad();
      result.current.retry(document.body);
    });
    await settle();
    expect(result.current.src).toBeUndefined();
    expect(result.current.failure).toBeNull();
    expect(renew).not.toHaveBeenCalled();
  });
});
