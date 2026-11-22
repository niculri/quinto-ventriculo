// The passage selected in an article as a store to subscribe to: it stays a moment after the selection clears.
import type { ReportLocation } from '@qv/schema/user';
import { readSelection } from './selection';

/** On a phone the tap on the bar can clear the selection before its click arrives: the bar waits for that click. */
const SELECTION_GRACE_MS = 400;

export function createSelectionStore(root: { current: HTMLElement | null }) {
  let selected: ReportLocation | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const set = (next: ReportLocation | null) => {
    selected = next;
    for (const listener of listeners) listener();
  };
  const update = () => {
    clearTimeout(timer);
    const now = root.current ? readSelection(root.current) : null;
    if (now) set(now);
    else timer = setTimeout(() => set(null), SELECTION_GRACE_MS);
  };
  return {
    getSnapshot: () => selected,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      document.addEventListener('selectionchange', update);
      update();
      return () => {
        clearTimeout(timer);
        document.removeEventListener('selectionchange', update);
        listeners.delete(listener);
        selected = null;
      };
    },
  };
}
