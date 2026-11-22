// Tests where the reader is in an article: the heading that crossed the reading line, the last one in sight at the
// bottom, and how much has been read, measured once a frame.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useActiveSection } from '../useActiveSection';

const tops = new Map<string, number>();
let article = { top: 0, height: 0 };
let frames: FrameRequestCallback[] = [];

function setWindow(width: number, height: number, scrollY: number, pageHeight: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: scrollY });
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: pageHeight,
  });
}

function page() {
  const el = document.createElement('div');
  el.innerHTML = '<h2 id="a">A</h2><h3 id="b">B</h3><h3>Sin id</h3><h2 id="c">C</h2>';
  document.body.append(el);
  return { current: el };
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const top = this.id ? (tops.get(this.id) ?? 0) : article.top;
    const height = this.id ? 30 : article.height;
    return {
      top,
      height,
      bottom: top + height,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: top,
    } as DOMRect;
  });
  setWindow(1280, 800, 0, 5000);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const scroll = () =>
  act(() => {
    window.dispatchEvent(new Event('scroll'));
    for (const f of frames.splice(0)) f(0);
  });

describe('useActiveSection', () => {
  it('until the article is ready, nothing is read', () => {
    tops.set('a', 0);
    const { result } = renderHook(() => useActiveSection(page(), false));
    expect(result.current).toEqual({ active: null, progress: 0 });
  });

  it('the section is the last heading at or above the reading line: 120px wide, 150px on a narrow screen', () => {
    tops.set('a', -400).set('b', 120).set('c', 140);
    article = { top: -500, height: 3000 };
    const ref = page();
    const wide = renderHook(() => useActiveSection(ref, true));
    expect(wide.result.current.active).toBe('b');
    setWindow(800, 800, 0, 5000);
    const narrow = renderHook(() => useActiveSection(ref, true));
    expect(narrow.result.current.active).toBe('c');
  });

  it('before the first heading there is no section, and the progress counts from the reading line', () => {
    tops.set('a', 300).set('b', 600).set('c', 900);
    article = { top: 120, height: 2280 };
    const { result } = renderHook(() => useActiveSection(page(), true));
    expect(result.current).toEqual({ active: null, progress: 0 });
    article = { top: -880, height: 2280 };
    tops.set('a', -500);
    scroll();
    expect(result.current).toEqual({ active: 'a', progress: 0.625 });
  });

  it('at the bottom of the page the last heading in sight is the one being read, and all is read', () => {
    tops.set('a', -900).set('b', 500).set('c', 700);
    article = { top: -1000, height: 1600 };
    setWindow(1280, 800, 4200, 5000);
    const { result } = renderHook(() => useActiveSection(page(), true));
    expect(result.current).toEqual({ active: 'c', progress: 1 });
  });

  it('at the bottom with no heading in sight, the one above the line stays', () => {
    tops.set('a', -900).set('b', -100).set('c', 900);
    article = { top: -1000, height: 1600 };
    setWindow(1280, 800, 4200, 5000);
    const { result } = renderHook(() => useActiveSection(page(), true));
    expect(result.current.active).toBe('b');
  });

  it('an article shorter than the screen is all read', () => {
    tops.set('a', 400).set('b', 500).set('c', 600);
    article = { top: 300, height: 400 };
    const { result } = renderHook(() => useActiveSection(page(), true));
    expect(result.current).toEqual({ active: null, progress: 1 });
  });

  it('many scroll events in a frame measure once, and a change too small to see keeps the same position', () => {
    tops.set('a', -400).set('b', 300).set('c', 900);
    article = { top: -1000, height: 10_680 };
    const { result } = renderHook(() => useActiveSection(page(), true));
    const first = result.current;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    });
    expect(frames).toHaveLength(1);
    article = { top: -1010, height: 10_680 };
    act(() => frames.splice(0)[0]!(0));
    expect(result.current).toBe(first);
    article = { top: -1100, height: 10_680 };
    scroll();
    expect(result.current).not.toBe(first);
    expect(result.current.progress).toBeCloseTo(0.122);
  });

  it('leaving the page cancels the pending frame and stops listening', () => {
    tops.set('a', 0);
    article = { top: 0, height: 4000 };
    const { unmount } = renderHook(() => useActiveSection(page(), true));
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    window.dispatchEvent(new Event('scroll'));
    expect(frames).toHaveLength(1);
  });
});
