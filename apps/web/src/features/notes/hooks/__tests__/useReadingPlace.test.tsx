// Tests that an article keeps its reading place while one scrolls and comes back to it on returning to the same entry
// of the history, for a while if the page is still too short, until the reader scrolls on their own.
import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readingPlace, saveReadingPlace } from '../../api/readingPlace';
import { useReadingPlace } from '../useReadingPlace';

const PATH = '/apunte';
/** Each block of the article is 200 px tall, the first one 100 px below the top of the page. */
const BLOCK = 200;
let scrollY = 0;
/** How far the page can scroll: a page still too short stops there. */
let maxScroll = 10_000;
let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;

function Article({ attached = true }: { attached?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useReadingPlace(ref);
  return (
    <div ref={attached ? ref : undefined} data-testid="body">
      {Array.from({ length: 6 }, (_, i) => (
        <p key={i} data-i={i} />
      ))}
    </div>
  );
}

function open(attached = true) {
  const router = createMemoryRouter(
    [
      { path: PATH, element: <Article attached={attached} /> },
      { path: '/otra', element: <p /> },
    ],
    { initialEntries: [PATH] },
  );
  const view = render(<RouterProvider router={router} />);
  return { router, view, key: router.state.location.key };
}

const runFrames = () => {
  const now = [...frames.values()];
  frames = new Map();
  for (const f of now) f(0);
};

const scrollTo = (y: number) => {
  scrollY = Math.min(y, maxScroll);
  window.dispatchEvent(new Event('scroll'));
};

beforeEach(() => {
  scrollY = 0;
  maxScroll = 10_000;
  frames = new Map();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(++nextFrame, cb);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });
  vi.spyOn(window, 'scrollBy').mockImplementation((_x: number, y: number) => {
    scrollY = Math.min(scrollY + y, maxScroll);
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const i = Number(this.getAttribute('data-i') ?? -1);
    return DOMRect.fromRect({ y: 100 + i * BLOCK - scrollY, height: BLOCK });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe('the reading place of an article', () => {
  it('is kept on the next frame after scrolling, once', () => {
    const { key } = open();
    scrollTo(450);
    scrollTo(460);
    expect(readingPlace(key)).toBeNull();
    runFrames();
    // The line at 460 + 72 = 532 of the page: block 2 starts at 500.
    expect(readingPlace(key)).toEqual({ path: PATH, block: 2, within: 0.16, past: 0 });
    scrollTo(0);
    runFrames();
    expect(readingPlace(key)).toBeNull();
  });

  it('comes back on returning to the same entry, and a new visit starts at the top', async () => {
    const { router, key } = open();
    scrollTo(460);
    runFrames();
    await act(() => router.navigate('/otra'));
    scrollY = 0;
    await act(() => router.navigate(-1));
    expect(router.state.location.key).toBe(key);
    expect(scrollY).toBe(460);
    scrollY = 0;
    await act(() => router.navigate('/otra'));
    await act(() => router.navigate(PATH));
    expect(scrollY).toBe(0);
  });

  it('keeps trying while the page is too short, keeps nothing meanwhile, and the reader stops it', () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    saveReadingPlace('default', { path: PATH, block: 4, within: 0.5, past: 0 });
    maxScroll = 300;
    const first = open();
    // On the reload of the first entry of a tab: the router calls it «default».
    expect(first.key).toBe('default');
    expect(scrollY).toBe(300);
    scrollTo(300);
    runFrames();
    expect(readingPlace('default')).toEqual({ path: PATH, block: 4, within: 0.5, past: 0 });
    maxScroll = 10_000;
    runFrames();
    expect(scrollY).toBe(100 + 4 * BLOCK + 100 - 72);
    window.dispatchEvent(new Event('wheel'));
    scrollTo(900);
    runFrames();
    expect(readingPlace('default')?.block).toBe(4);
    expect(readingPlace('default')?.within).toBeCloseTo(0.36, 2);
    first.view.unmount();
  });

  it('stops trying after a while', () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    saveReadingPlace('default', { path: PATH, block: 9, within: 0, past: 0 });
    open();
    expect(frames.size).toBe(1);
    vi.advanceTimersByTime(2000);
    runFrames();
    expect(frames.size).toBe(0);
    expect(scrollY).toBe(0);
  });

  it('keeps nothing once the article is gone, nor without its body', () => {
    const { key, view } = open();
    scrollTo(460);
    view.container.remove();
    runFrames();
    expect(readingPlace(key)).toBeNull();
    view.unmount();
    const without = open(false);
    scrollTo(460);
    runFrames();
    expect(readingPlace(without.key)).toBeNull();
  });
});
