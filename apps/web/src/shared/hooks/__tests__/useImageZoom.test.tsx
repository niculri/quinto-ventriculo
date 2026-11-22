// Tests the image viewer's gestures: wheel, drag, two fingers, taps and double taps, keys, and what happens when the
// stage or the image change; all with synthetic pointer, wheel and key events over a stage of a known size.
import { act, fireEvent, render } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Size } from '../../lib/zoom';
import { useImageZoom } from '../useImageZoom';

// A plate of 2000 × 1500 in a stage of 400 × 300 fits at 0.2, filling it; twice its natural size is the most.
const PLATE: Size = { width: 2000, height: 1500 };
let stageSize: Size = { width: 400, height: 300 };
let zoom: ReturnType<typeof useImageZoom>;

function Harness({
  image,
  onTapOutside = () => {},
  detached = false,
}: {
  image: Size | null;
  onTapOutside?: () => void;
  detached?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const neverRef: RefObject<HTMLDivElement | null> = useRef(null);
  const z = useImageZoom(detached ? neverRef : stageRef, image, onTapOutside);
  useEffect(() => {
    zoom = z;
  });
  return <div ref={stageRef} data-testid="stage" onKeyDown={z.onKeyDown} {...z.handlers} />;
}

const view = () => zoom.view!;
const expectView = (scale: number, x: number, y: number) => {
  expect(view().scale).toBeCloseTo(scale);
  expect(view().x).toBeCloseTo(x);
  expect(view().y).toBeCloseTo(y);
};
const stageEl = () => document.querySelector<HTMLElement>('[data-testid="stage"]')!;

let clock = 1000;
function pointer(
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  x: number,
  y: number,
  {
    id = 1,
    kind = 'touch',
    button = 0,
    after = 0,
  }: { id?: number; kind?: string; button?: number; after?: number } = {},
) {
  clock += after;
  const e = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: id,
    pointerType: kind,
    button,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(e, 'timeStamp', { value: clock });
  fireEvent(stageEl(), e);
}
const tap = (x: number, y: number, options: Parameters<typeof pointer>[3] = {}) => {
  pointer('pointerdown', x, y, options);
  pointer('pointerup', x, y, { ...options, after: 0 });
};
const key = (k: string, mods: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(stageEl(), { key: k, ...mods });

beforeEach(() => {
  stageSize = { width: 400, height: 300 };
  clock = 1000;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => stageSize.width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => stageSize.height);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('before the image has loaded', () => {
  it('there is no view, nothing reacts and the wheel scrolls the page', () => {
    render(<Harness image={null} />);
    expect(zoom).toMatchObject({ view: null, fitted: true, atMax: true, atNatural: false });
    expect(fireEvent.wheel(stageEl(), { deltaY: -100 })).toBe(true);
    pointer('pointerdown', 10, 10);
    pointer('pointermove', 100, 10);
    pointer('pointerup', 100, 10);
    act(() => {
      zoom.zoomIn();
      zoom.toggle();
      zoom.toFit();
    });
    expect(key('+')).toBe(true);
    fireEvent.doubleClick(stageEl(), { clientX: 10, clientY: 10 });
    expect(zoom.view).toBeNull();
  });

  it('a stage that is not on the page yet does nothing', () => {
    render(<Harness image={PLATE} detached />);
    act(() => zoom.toggle());
    expect(zoom.view).toBeNull();
  });
});

describe('the view', () => {
  it('starts fitted, centred, and knows it is not at its natural size', () => {
    render(<Harness image={PLATE} />);
    expect(view()).toEqual({ scale: 0.2, x: 0, y: 0 });
    expect(zoom).toMatchObject({ fitted: true, atMax: false, atNatural: false });
  });

  it('of an image smaller than the stage is at its natural size, and a toggle doubles it', () => {
    render(<Harness image={{ width: 100, height: 50 }} />);
    expect(view()).toEqual({ scale: 1, x: 150, y: 125 });
    expect(zoom.atNatural).toBe(true);
    act(() => zoom.toggle());
    expect(view().scale).toBe(2);
    expect(zoom.fitted).toBe(false);
  });

  it('the buttons zoom around the centre, up to twice the natural size, and back to what fits', () => {
    render(<Harness image={PLATE} />);
    act(() => zoom.zoomIn());
    expectView(0.3, -100, -75);
    for (let i = 0; i < 10; i++) act(() => zoom.zoomIn());
    expect(view().scale).toBe(2);
    expect(zoom.atMax).toBe(true);
    act(() => zoom.zoomOut());
    expect(view().scale).toBeCloseTo(2 / 1.5);
    act(() => zoom.toFit());
    expect(view()).toEqual({ scale: 0.2, x: 0, y: 0 });
    act(() => zoom.toggle());
    expect(view().scale).toBe(1);
    expect(zoom.atMax).toBe(false);
    act(() => zoom.toggle());
    expect(zoom.fitted).toBe(true);
  });
});

describe('the wheel', () => {
  it('adds up several turns that come before the image is drawn again', () => {
    render(<Harness image={PLATE} />);
    act(() => {
      stageEl().dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
      stageEl().dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
    });
    expect(view().scale).toBeCloseTo(0.2 * Math.exp(0.3));
  });

  it('zooms around the pointer and keeps the page from scrolling', () => {
    render(<Harness image={PLATE} />);
    expect(fireEvent.wheel(stageEl(), { deltaY: -200, clientX: 0, clientY: 0 })).toBe(false);
    expect(view().scale).toBeCloseTo(0.2 * Math.exp(0.3));
    expect(view()).toMatchObject({ x: 0, y: 0 });
  });

  it('with ctrl (a trackpad’s pinch) goes faster, and lines count as 16 pixels', () => {
    render(<Harness image={PLATE} />);
    fireEvent.wheel(stageEl(), { deltaY: -10, ctrlKey: true });
    expect(view().scale).toBeCloseTo(0.2 * Math.exp(0.1));
    act(() => zoom.toFit());
    fireEvent.wheel(stageEl(), { deltaY: -10, deltaMode: 1 });
    expect(view().scale).toBeCloseTo(0.2 * Math.exp(10 * 16 * 0.0015));
  });

  it('stops listening when the viewer closes', () => {
    const { unmount } = render(<Harness image={PLATE} />);
    const el = stageEl();
    unmount();
    expect(fireEvent.wheel(el, { deltaY: -100 })).toBe(true);
  });
});

describe('dragging', () => {
  it('a finger that moves less than 10 px does not drag; past that the image follows it from where it started', () => {
    render(<Harness image={PLATE} />);
    act(() => zoom.zoomIn());
    const start = view();
    pointer('pointerdown', 200, 150);
    pointer('pointermove', 206, 150);
    expect(view()).toEqual(start);
    pointer('pointermove', 250, 170);
    expect(view()).toMatchObject({ x: start.x + 50, y: start.y + 20 });
    pointer('pointermove', 260, 150);
    expect(view()).toMatchObject({ x: start.x + 60, y: start.y });
    pointer('pointerup', 260, 150);
  });

  it('never leaves an empty edge: the image stops at the stage’s side', () => {
    render(<Harness image={PLATE} />);
    act(() => zoom.zoomIn());
    pointer('pointerdown', 200, 150);
    pointer('pointermove', 900, 900);
    expect(view()).toMatchObject({ x: 0, y: 0 });
  });

  it('only with the main button of a mouse', () => {
    render(<Harness image={PLATE} />);
    act(() => zoom.zoomIn());
    const start = view();
    pointer('pointerdown', 200, 150, { kind: 'mouse', button: 2 });
    pointer('pointermove', 260, 150, { kind: 'mouse', button: 2 });
    expect(view()).toEqual(start);
    pointer('pointerdown', 200, 150, { kind: 'mouse' });
    pointer('pointermove', 260, 150, { kind: 'mouse' });
    expect(view().x).toBe(start.x + 60);
  });

  it('captures the pointer, so the drag goes on outside the stage, and goes on even if it cannot', () => {
    const capture = vi.fn();
    HTMLElement.prototype.setPointerCapture = capture;
    try {
      render(<Harness image={PLATE} />);
      pointer('pointerdown', 200, 150, { id: 7 });
      expect(capture).toHaveBeenCalledWith(7);
      pointer('pointerup', 200, 150, { id: 7 });
    } finally {
      // @ts-expect-error: jsdom has none, as before the test.
      delete HTMLElement.prototype.setPointerCapture;
    }
    act(() => zoom.zoomIn());
    const start = view();
    pointer('pointerdown', 200, 150, { id: 8 });
    pointer('pointermove', 240, 150, { id: 8 });
    expect(view().x).toBe(start.x + 40);
  });

  it('ignores a pointer that did not start on the stage', () => {
    render(<Harness image={PLATE} />);
    act(() => zoom.zoomIn());
    const start = view();
    pointer('pointerdown', 200, 150, { id: 1 });
    pointer('pointermove', 300, 150, { id: 2 });
    pointer('pointerup', 300, 150, { id: 2 });
    expect(view()).toEqual(start);
    pointer('pointermove', 300, 150, { id: 1 });
    expect(view().x).toBe(start.x + 100);
  });
});

describe('two fingers', () => {
  it('zoom with their distance, and the finger left after one goes up drags from there without a jump', () => {
    render(<Harness image={PLATE} />);
    pointer('pointerdown', 100, 150, { id: 1 });
    pointer('pointerdown', 300, 150, { id: 2 });
    pointer('pointermove', 400, 150, { id: 2 });
    const pinched = view();
    expect(pinched.scale).toBeCloseTo(0.3);
    pointer('pointerup', 400, 150, { id: 2 });
    expect(view()).toEqual(pinched);
    pointer('pointermove', 110, 150, { id: 1 });
    expect(view().x).toBeCloseTo(pinched.x + 10);
    pointer('pointerup', 110, 150, { id: 1 });
  });

  it('a second finger after a drag zooms from where the drag left the image', () => {
    render(<Harness image={PLATE} />);
    act(() => zoom.zoomIn());
    pointer('pointerdown', 200, 150, { id: 1 });
    pointer('pointermove', 150, 150, { id: 1 });
    const dragged = view();
    pointer('pointerdown', 250, 150, { id: 2 });
    pointer('pointermove', 250, 150, { id: 2 });
    expect(view()).toEqual(dragged);
  });

  it('are never a tap, even if no finger moved', () => {
    const outside = vi.fn();
    render(<Harness image={{ width: 400, height: 100 }} onTapOutside={outside} />);
    pointer('pointerdown', 10, 10, { id: 1 });
    pointer('pointerdown', 20, 10, { id: 2 });
    pointer('pointerup', 20, 10, { id: 2 });
    pointer('pointerup', 10, 10, { id: 1 });
    expect(outside).not.toHaveBeenCalled();
  });

  it('lifting one after the image went away keeps the gesture where it was', () => {
    const { rerender } = render(<Harness image={PLATE} />);
    pointer('pointerdown', 100, 150, { id: 1 });
    pointer('pointerdown', 300, 150, { id: 2 });
    rerender(<Harness image={null} />);
    pointer('pointerup', 300, 150, { id: 2 });
    pointer('pointerup', 100, 150, { id: 1 });
    expect(zoom.view).toBeNull();
  });
});

describe('taps', () => {
  // A wide strip, 400 × 100 at its natural size, in the middle of the stage: from y 100 to y 200.
  const STRIP = { width: 400, height: 100 };

  it('outside the image close the viewer; inside, or after a drag or a cancel, do not', () => {
    const outside = vi.fn();
    render(<Harness image={STRIP} onTapOutside={outside} />);
    tap(200, 150);
    expect(outside).not.toHaveBeenCalled();
    pointer('pointerdown', 200, 20);
    pointer('pointermove', 200, 60);
    pointer('pointerup', 200, 60);
    pointer('pointerdown', 200, 20);
    pointer('pointercancel', 200, 20);
    expect(outside).not.toHaveBeenCalled();
    tap(200, 20);
    expect(outside).toHaveBeenCalledTimes(1);
    tap(200, 250, { kind: 'mouse' });
    expect(outside).toHaveBeenCalledTimes(2);
  });

  it('two quick taps close together toggle the zoom where they were', () => {
    render(<Harness image={PLATE} />);
    tap(100, 100);
    expect(zoom.fitted).toBe(true);
    tap(110, 110, { after: 200 });
    expect(view().scale).toBe(1);
    expect(view()).toMatchObject({ x: 110 - 110 * 5, y: 110 - 110 * 5 });
  });

  it('two taps too slow, or too far apart, do not; and a third after a toggle starts again', () => {
    render(<Harness image={PLATE} />);
    tap(100, 100);
    tap(100, 100, { after: 320 });
    expect(zoom.fitted).toBe(true);
    tap(160, 100, { after: 100 });
    expect(zoom.fitted).toBe(true);
    tap(160, 100, { after: 100 });
    expect(zoom.fitted).toBe(false);
    tap(160, 100, { after: 100 });
    expect(zoom.fitted).toBe(false);
  });

  it('a mouse’s clicks are no double tap: its double click toggles, inside the image only', () => {
    render(<Harness image={STRIP} />);
    tap(200, 150, { kind: 'mouse' });
    tap(200, 150, { kind: 'mouse', after: 100 });
    expect(view().scale).toBe(1);
    fireEvent.doubleClick(stageEl(), { clientX: 200, clientY: 20 });
    expect(view().scale).toBe(1);
    fireEvent.doubleClick(stageEl(), { clientX: 200, clientY: 150 });
    expect(view().scale).toBe(2);
  });

  it('a double click that follows a finger’s double tap does not undo it', () => {
    render(<Harness image={PLATE} />);
    tap(100, 100);
    tap(100, 100, { after: 100 });
    expect(view().scale).toBe(1);
    fireEvent.doubleClick(stageEl(), { clientX: 100, clientY: 100 });
    expect(view().scale).toBe(1);
  });
});

describe('the keys', () => {
  it('+ and = zoom in, − zooms out and 0 fits, each instead of what the page would do', () => {
    render(<Harness image={PLATE} />);
    expect(key('+')).toBe(false);
    expect(view().scale).toBeCloseTo(0.3);
    expect(key('=')).toBe(false);
    expect(view().scale).toBeCloseTo(0.45);
    expect(key('-')).toBe(false);
    expect(view().scale).toBeCloseTo(0.3);
    expect(key('0')).toBe(false);
    expect(zoom.fitted).toBe(true);
  });

  it('the arrows move a zoomed image 60 px, and scroll the page when it fits', () => {
    render(<Harness image={PLATE} />);
    expect(key('ArrowLeft')).toBe(true);
    act(() => zoom.zoomIn());
    const start = view();
    expect(key('ArrowLeft')).toBe(false);
    expect(view().x).toBe(start.x + 60);
    key('ArrowRight');
    key('ArrowRight');
    expect(view().x).toBe(start.x - 60);
    key('ArrowUp');
    expect(view().y).toBe(start.y + 60);
    key('ArrowDown');
    key('ArrowDown');
    expect(view().y).toBe(start.y - 60);
  });

  it('with ⌘, Ctrl or Alt, and any other key, are the browser’s', () => {
    render(<Harness image={PLATE} />);
    for (const mods of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
      expect(key('+', mods)).toBe(true);
    }
    expect(key('a')).toBe(true);
    expect(zoom.fitted).toBe(true);
  });
});

describe('when the stage or the image change', () => {
  function observeResizes() {
    const callbacks: (() => void)[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          callbacks.push(cb);
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    return {
      disconnect,
      resize(size: Size) {
        stageSize = size;
        act(() => {
          for (const cb of callbacks) cb();
        });
      },
    };
  }

  it('a fitted image fits the new stage (turning the phone)', () => {
    const stage = observeResizes();
    render(<Harness image={PLATE} />);
    stage.resize({ width: 300, height: 400 });
    expect(view()).toEqual({ scale: 0.15, x: 0, y: (400 - 225) / 2 });
  });

  it('a zoomed image keeps its zoom and stays inside the new stage', () => {
    const stage = observeResizes();
    render(<Harness image={PLATE} />);
    act(() => zoom.zoomIn());
    pointer('pointerdown', 200, 150);
    pointer('pointermove', 0, 0);
    pointer('pointerup', 0, 0);
    expectView(0.3, -200, -150);
    stage.resize({ width: 500, height: 400 });
    expectView(0.3, -100, -50);
    expect(view().scale).toBeCloseTo(0.3);
  });

  it('stops watching the stage when the viewer closes', () => {
    const stage = observeResizes();
    const { unmount } = render(<Harness image={PLATE} />);
    unmount();
    expect(stage.disconnect).toHaveBeenCalled();
  });

  it('another image that fits is fitted, one that was zoomed is kept in bounds', () => {
    const { rerender } = render(<Harness image={PLATE} />);
    rerender(<Harness image={{ width: 800, height: 600 }} />);
    expect(view()).toEqual({ scale: 0.5, x: 0, y: 0 });
    act(() => zoom.zoomIn());
    rerender(<Harness image={{ width: 1600, height: 1200 }} />);
    expect(view().scale).toBeCloseTo(0.75);
  });
});
