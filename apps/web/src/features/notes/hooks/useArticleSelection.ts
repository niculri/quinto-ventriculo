// The passage selected in an article, kept a moment after the selection clears (the phone's tap on the bar).
import { useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import type { ReportLocation } from '../../reports/api/repository';
import { createSelectionStore } from '../model/selectionStore';

const unsubscribed = () => () => undefined;

export function useArticleSelection(
  root: RefObject<HTMLElement | null>,
  enabled: boolean,
): ReportLocation | null {
  const [store] = useState(() => createSelectionStore(root));
  const selected = useSyncExternalStore(
    enabled ? store.subscribe : unsubscribed,
    store.getSnapshot,
  );
  return enabled ? selected : null;
}
