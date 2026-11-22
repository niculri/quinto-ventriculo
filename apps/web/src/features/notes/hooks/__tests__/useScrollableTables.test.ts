// Tests which of an article's table wrappers take the keyboard and a name: only those that scroll sideways.
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScrollableTables } from '../useScrollableTables';

const widths = new WeakMap<Element, { scroll: number; client: number }>();

function article(...tables: { scroll: number; client: number; caption?: boolean }[]) {
  const root = document.createElement('div');
  for (const t of tables) {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    wrapper.innerHTML = `<table>${t.caption ? '<caption>Valores</caption>' : ''}<tr><td>1</td></tr></table>`;
    widths.set(wrapper, t);
    root.append(wrapper);
  }
  return root;
}

const wrappers = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.table-scroll')];
const marks = (w: HTMLElement) => [
  w.getAttribute('tabindex'),
  w.getAttribute('role'),
  w.getAttribute('aria-label'),
];

Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
  configurable: true,
  get(this: Element) {
    return widths.get(this)?.scroll ?? 0;
  },
});
Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get(this: Element) {
    return widths.get(this)?.client ?? 0;
  },
});

afterEach(() => vi.unstubAllGlobals());

describe('useScrollableTables', () => {
  it('a table wider than its wrapper by more than a pixel is a named region in the Tab order; the rest are not', () => {
    const root = article(
      { scroll: 900, client: 600 },
      { scroll: 601, client: 600 },
      { scroll: 900, client: 600, caption: true },
    );
    renderHook(() => useScrollableTables({ current: root }, 'html'));
    expect(wrappers(root).map(marks)).toEqual([
      ['0', 'region', 'Tabla 1'],
      [null, null, null],
      ['0', 'region', null],
    ]);
  });

  it('when a wrapper is resized it is marked again, and leaving the page stops watching', () => {
    let resized: () => void = () => undefined;
    const observed: Element[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          resized = cb;
        }
        observe(el: Element) {
          observed.push(el);
        }
        disconnect = disconnect;
      },
    );
    const root = article({ scroll: 900, client: 600 });
    const { unmount } = renderHook(() => useScrollableTables({ current: root }, 'html'));
    const [wrapper] = wrappers(root);
    expect(observed).toEqual([wrapper]);
    widths.set(wrapper!, { scroll: 900, client: 900 });
    resized();
    expect(marks(wrapper!)).toEqual([null, null, null]);
    widths.set(wrapper!, { scroll: 900, client: 300 });
    resized();
    expect(marks(wrapper!)).toEqual(['0', 'region', 'Tabla 1']);
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('an article without tables, or not in the page yet, is left alone', () => {
    const construct = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor() {
          construct();
        }
        observe() {}
        disconnect() {}
      },
    );
    renderHook(() => useScrollableTables({ current: document.createElement('div') }, 'html'));
    renderHook(() => useScrollableTables({ current: null }, 'html'));
    expect(construct).not.toHaveBeenCalled();
  });
});
