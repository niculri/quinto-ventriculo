import { useEffect, useState } from 'react';
import { usePreferences, useSavePreferences } from '../study/queries';

/**
 * One-time tips (plan step 3.2, EXP-C7): at most one a visit, and only after doing what it is about (after answering a
 * card, «Ver apunte»; after reading a note, the search). It is shown once on each device; closed, it does not come back
 * on any (`study_preferences.dismissed`).
 */
export type TipId = 'tip-material' | 'tip-search';

const SESSION_KEY = 'qv-tip';
const SHOWN_KEY = 'qv-tips-shown';

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

/** `done`: the student already did the action the tip follows. */
export function useTip(id: TipId, done: boolean) {
  const { prefs } = usePreferences();
  const save = useSavePreferences();
  const [show, setShow] = useState(false);
  const [slot, setSlot] = useState(false);
  // Shown once in this visit: where it was keeps its room after it is closed (review of 3.2).
  const [shown, setShown] = useState(false);
  if (show && !shown) setShown(true);
  const eligible =
    !!prefs &&
    !prefs.dismissed.includes(id) &&
    (storage('session')?.getItem(SESSION_KEY) ?? id) === id &&
    (!shownOnThisDevice().includes(id) || storage('session')?.getItem(SESSION_KEY) === id);
  // Once it can be shown, its room stays for the visit (closing it moves nothing).
  if (eligible && !slot) setSlot(true);
  if (done && eligible && !show) setShow(true);
  // Shown: not again in this visit for another tip, nor on this device.
  useEffect(() => {
    if (!show) return;
    try {
      storage('session')?.setItem(SESSION_KEY, id);
      const shown = shownOnThisDevice();
      if (!shown.includes(id)) storage('local')?.setItem(SHOWN_KEY, JSON.stringify([...shown, id]));
    } catch {
      // blocked storage: it may show again another time
    }
  }, [id, show]);
  return {
    /** The tip can come in this visit: where it goes in the page keeps its room from the start. */
    slot,
    /** It was shown in this visit (closed or not): a tip that comes into a line keeps its room until the visit ends. */
    shown,
    show: show && !!prefs && !prefs.dismissed.includes(id),
    close: () => {
      setShow(false);
      if (prefs && !prefs.dismissed.includes(id)) {
        save.mutate({ ...prefs, dismissed: [...prefs.dismissed, id] });
      }
    },
  };
}
