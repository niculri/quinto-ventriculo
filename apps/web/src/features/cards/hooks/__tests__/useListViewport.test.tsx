// Tests where the cards page's list is: measured at once, again one frame after a scroll, a resize or a change of the
// box (only the last of several in a frame), a phone's width where nothing is laid out, and nothing left listening.
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useListViewport } from '../useListViewport';

type Viewport = ReturnType<typeof useListViewport>;

const frames = vi.hoisted(() => ({ next: 1, pending: new Map<number, FrameRequestCallback>() }));
const resize = vi.hoisted(() => ({ callbacks: [] as (() => void)[], disconnected: 0 }));

class FakeResizeObserver {
  constructor(callback: () => void) {
    resize.callbacks.push(callback);
  }
  observe() {
    return undefined;
  }
  disconnect() {
    resize.disconnected++;
  }
}

let rect = { width: 0, top: 0 };
let last: Viewport | undefined;

function Probe() {
  const v = useListViewport();
  last = v;
  return <section ref={v.box} />;
}

const runFrames = () =>
  act(() => {
    const due = [...frames.pending.values()];
    frames.pending.clear();
    for (const f of due) f(0);
  });

beforeEach(() => {
  rect = { width: 0, top: 0 };
  frames.pending.clear();
  resize.callbacks = [];
  resize.disconnected = 0;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ width: rect.width, top: rect.top }) as DOMRect,
  );
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => {
    const id = frames.next++;
    frames.pending.set(id, f);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.pending.delete(id));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the list’s viewport', () => {
  it('is a phone’s width where nothing is laid out, measured at once', () => {
    rect = { width: 0, top: 30 };
    render(<Probe />);
    expect(last!.width).toBe(360);
    expect(last!.view).toEqual({ top: -30, height: window.innerHeight });
  });

  it('is measured again one frame after a scroll, only once for several', () => {
    rect = { width: 500.4, top: -10 };
    render(<Probe />);
    expect(last!.width).toBe(500);
    rect = { width: 500, top: -900 };
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    expect(frames.pending.size).toBe(1);
    expect(last!.view.top).toBe(10);
    runFrames();
    expect(last!.view.top).toBe(900);
  });

  it('follows the box’s own changes, and stops listening when it goes', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    rect = { width: 400, top: 0 };
    const { unmount } = render(<Probe />);
    rect = { width: 700, top: 0 };
    act(() => resize.callbacks[0]!());
    runFrames();
    expect(last!.width).toBe(700);
    act(() => resize.callbacks[0]!());
    unmount();
    expect(resize.disconnected).toBe(1);
    expect(frames.pending.size).toBe(0);
    window.dispatchEvent(new Event('scroll'));
    expect(frames.pending.size).toBe(0);
  });
});
