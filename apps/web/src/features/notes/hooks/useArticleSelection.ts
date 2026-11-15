// The passage selected in an article, kept a moment after the selection clears (the phone's tap on the bar).
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { ReportLocation } from '../../reports/api/repository';
import { readSelection } from '../model/selection';

/** On a phone the tap on the bar can clear the selection before its click arrives: the bar waits for that click. */
const SELECTION_GRACE_MS = 400;

export function useArticleSelection(root: RefObject<HTMLElement | null>, enabled: boolean) {
  const [selected, setSelected] = useState<ReportLocation | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => (root.current ? readSelection(root.current) : null);
    const update = () => {
      clearTimeout(timer);
      const now = read();
      if (now) setSelected(now);
      else timer = setTimeout(() => setSelected(null), SELECTION_GRACE_MS);
    };
    update();
    document.addEventListener('selectionchange', update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('selectionchange', update);
      setSelected(null);
    };
  }, [root, enabled]);
  return enabled ? selected : null;
}
