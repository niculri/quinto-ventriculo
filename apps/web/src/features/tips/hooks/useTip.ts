// One-time tips: at most one a visit, shown after the action it is about, once per device, and never again once closed.
import { useEffect, useState } from 'react';
import { usePreferences, useSavePreferences } from '../../progress/queries';
import { storageKeys } from '../../../shared/lib/storage';

export type TipId = 'tip-material' | 'tip-search';

const SESSION_KEY = storageKeys.tipThisVisit;
const SHOWN_KEY = storageKeys.tipsShown;

function storage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function shownOnThisDevice(): string[] {
  try {
    const v = JSON.parse(storage('local')?.getItem(SHOWN_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Outside the hook: React Compiler does not compile a conditional inside `try`.
function rememberTip(id: TipId) {
  try {
    storage('session')?.setItem(SESSION_KEY, id);
    const shown = shownOnThisDevice();
    if (!shown.includes(id)) storage('local')?.setItem(SHOWN_KEY, JSON.stringify([...shown, id]));
  } catch {
    // may show again
  }
}

export function useTip(id: TipId, done: boolean) {
  const { prefs } = usePreferences();
  const save = useSavePreferences();
  const [show, setShow] = useState(false);
  const [slot, setSlot] = useState(false);
  const [shown, setShown] = useState(false);
  if (show && !shown) setShown(true);
  const eligible =
    !!prefs &&
    !prefs.dismissed.includes(id) &&
    (storage('session')?.getItem(SESSION_KEY) ?? id) === id &&
    (!shownOnThisDevice().includes(id) || storage('session')?.getItem(SESSION_KEY) === id);
  if (eligible && !slot) setSlot(true);
  if (done && eligible && !show) setShow(true);
  useEffect(() => {
    if (show) rememberTip(id);
  }, [id, show]);
  return {
    // Both keep the tip's room in the page for the whole visit, so closing it moves nothing.
    slot,
    shown,
    show: show && !!prefs && !prefs.dismissed.includes(id),
    close: () => {
      setShow(false);
      if (prefs && !prefs.dismissed.includes(id)) {
        save.mutate({ from: prefs, to: { ...prefs, dismissed: [...prefs.dismissed, id] } });
      }
    },
  };
}
