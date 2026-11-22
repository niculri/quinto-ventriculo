// Tests the selection store: it reads the passage when watched, follows the selection and keeps it a moment once cleared.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSelectionStore } from '../selectionStore';

let root: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement('div');
  root.innerHTML = '<p>Texto del apunte</p>';
  document.body.append(root);
});

afterEach(() => {
  vi.useRealTimers();
  document.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

function select(el: Element | null) {
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  if (el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.addRange(range);
  }
  document.dispatchEvent(new Event('selectionchange'));
}

describe('createSelectionStore', () => {
  it('reads what is selected when it starts being watched, and tells the one who watches', () => {
    select(root.firstElementChild);
    const store = createSelectionStore({ current: root });
    const listener = vi.fn();
    expect(store.getSnapshot()).toBeNull();
    store.subscribe(listener);
    expect(store.getSnapshot()?.quote?.exact).toBe('Texto del apunte');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('follows each change of the selection, and keeps the passage 400 ms once it is cleared', () => {
    const store = createSelectionStore({ current: root });
    store.subscribe(() => undefined);
    select(root.firstElementChild);
    expect(store.getSnapshot()?.quote?.exact).toBe('Texto del apunte');
    select(null);
    vi.advanceTimersByTime(399);
    expect(store.getSnapshot()?.quote?.exact).toBe('Texto del apunte');
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toBeNull();
  });

  it('a new selection before the 400 ms cancels the clearing', () => {
    const store = createSelectionStore({ current: root });
    store.subscribe(() => undefined);
    select(root.firstElementChild);
    select(null);
    vi.advanceTimersByTime(200);
    select(root.firstElementChild);
    vi.advanceTimersByTime(1000);
    expect(store.getSnapshot()?.quote?.exact).toBe('Texto del apunte');
  });

  it('without the article in the page nothing is read', () => {
    const store = createSelectionStore({ current: null });
    store.subscribe(() => undefined);
    select(root.firstElementChild);
    expect(store.getSnapshot()).toBeNull();
  });

  it('stops watching and forgets the passage: watched again, it starts from what is selected then', () => {
    const store = createSelectionStore({ current: root });
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    select(root.firstElementChild);
    expect(store.getSnapshot()).not.toBeNull();
    stop();
    expect(store.getSnapshot()).toBeNull();
    listener.mockClear();
    select(root.firstElementChild);
    vi.advanceTimersByTime(1000);
    expect(listener).not.toHaveBeenCalled();
    select(null);
    const again = vi.fn();
    store.subscribe(again);
    expect(store.getSnapshot()).toBeNull();
    select(root.firstElementChild);
    expect(again).toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
});
