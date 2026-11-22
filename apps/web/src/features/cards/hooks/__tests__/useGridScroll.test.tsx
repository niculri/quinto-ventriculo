// Tests the table's scroll: the current row is brought into view from above or below (with a row of margin) and left
// alone when it is in view, and the height follows the box as it is resized.
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROW } from '../../model/grid';
import { useGridScroll } from '../useGridScroll';

type Scroll = ReturnType<typeof useGridScroll>;

const resize = vi.hoisted(() => ({ callbacks: [] as (() => void)[], disconnected: 0 }));

class FakeResizeObserver {
  constructor(private readonly callback: () => void) {
    resize.callbacks.push(callback);
  }
  observe() {
    return undefined;
  }
  disconnect() {
    resize.disconnected++;
  }
}

let box = { clientHeight: 10 * ROW };
let last: Scroll | undefined;

function Probe({ index }: { index: number }) {
  const s = useGridScroll(index);
  last = s;
  return <div ref={s.scroller} />;
}

function grid(index: number, scrollTop = 0) {
  const r = render(<Probe index={-1} />);
  last!.scroller.current!.scrollTop = scrollTop;
  r.rerender(<Probe index={index} />);
  return { ...r, el: () => last!.scroller.current! };
}

beforeEach(() => {
  box = { clientHeight: 10 * ROW };
  resize.callbacks = [];
  resize.disconnected = 0;
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(() => box.clientHeight);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the current row', () => {
  it('above the view scrolls up to its top', () => {
    expect(grid(2, 5 * ROW).el().scrollTop).toBe(2 * ROW);
  });

  it('partly hidden above scrolls up to its top', () => {
    expect(grid(2, 2 * ROW + 10).el().scrollTop).toBe(2 * ROW);
  });

  it('in view, up to the row before the margin, leaves the scroll where it is', () => {
    expect(grid(8, 0).el().scrollTop).toBe(0);
  });

  it('in the last row of the view scrolls down one row, keeping a row of margin below', () => {
    expect(grid(9, 0).el().scrollTop).toBe(9 * ROW + 2 * ROW - 10 * ROW);
  });

  it('none (−1) never moves the scroll', () => {
    expect(grid(-1, 3 * ROW).el().scrollTop).toBe(3 * ROW);
  });
});

describe('the height', () => {
  it('is 600 until a browser that can watch the box measures it', () => {
    grid(0);
    expect(last!.height).toBe(600);
  });

  it('follows the box, and is 600 again when the box has no height', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const { unmount } = grid(0);
    box.clientHeight = 420;
    act(() => resize.callbacks[0]!());
    expect(last!.height).toBe(420);
    box.clientHeight = 0;
    act(() => resize.callbacks[0]!());
    expect(last!.height).toBe(600);
    unmount();
    expect(resize.disconnected).toBe(1);
  });
});
