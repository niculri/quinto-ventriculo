// Anki's shortcuts on the study screen: space or Enter shows the answer and answers «Bien», the numbers answer, and
// Ctrl+Z, Ctrl+1–7 and - = @ ! undo, flag, bury and suspend; with two buttons, 1 is «Otra vez» and 2 is «Bien».
import { useEffect, useEffectEvent } from 'react';
import type { Rating } from '@qv/srs';
import type { HideAction } from '@qv/study';
import type { StudyActions } from './useStudySession';
import { keyOrigin, pressesControl, typedInto } from './keyOrigin';

const HIDE_KEYS: Record<string, HideAction> = {
  '-': 'bury_card',
  '=': 'bury_note',
  '@': 'suspend_card',
  '!': 'suspend_note',
};

const SIMPLE_HIDE_KEYS: Record<string, HideAction> = { '-': 'bury_note', '@': 'suspend_card' };

// Undo, a flag, or burying and suspending: whether the key was one of them.
function command(e: KeyboardEvent, act: StudyActions, full: boolean): boolean {
  const mod = e.ctrlKey || e.metaKey;
  const hideKeys = full ? HIDE_KEYS : SIMPLE_HIDE_KEYS;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    act.undo();
  } else if (mod && /^[1-7]$/.test(e.key) && full) {
    e.preventDefault();
    act.flag(Number(e.key));
  } else if (Object.hasOwn(hideKeys, e.key) && !e.metaKey && (!e.ctrlKey || e.altKey)) {
    // By the character: on Spanish keyboards «@» is Alt+2 (Mac) or AltGr (Ctrl+Alt on Windows). Ctrl
    // alone is left to the browser (Ctrl+- and Ctrl+= are its zoom).
    act.hide(hideKeys[e.key]!);
  } else {
    return false;
  }
  return true;
}

function answer(
  e: KeyboardEvent,
  act: StudyActions,
  revealed: boolean,
  reveals: boolean,
  fourButtons: boolean,
) {
  if (reveals) {
    e.preventDefault();
    if (!revealed) act.reveal();
    else act.answer(3);
  } else if (fourButtons && /^[1-4]$/.test(e.key) && revealed) {
    e.preventDefault();
    act.answer(Number(e.key) as Rating);
  } else if (!fourButtons && /^[12]$/.test(e.key) && revealed) {
    e.preventDefault();
    act.answer(e.key === '1' ? 1 : 3);
  }
}

export function useStudyShortcuts(
  act: StudyActions,
  revealed: boolean,
  full: boolean,
  fourButtons: boolean,
) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const origin = keyOrigin(e);
    if (typedInto(origin)) return;
    const mod = e.ctrlKey || e.metaKey;
    const reveals =
      (e.key === ' ' || e.key === 'Enter') && !pressesControl(origin) && !mod && !e.altKey;
    // A key held down repeats: it must not answer, bury or undo card after card.
    if (e.repeat) {
      if (reveals) e.preventDefault();
      return;
    }
    if (command(e, act, full) || mod || e.altKey) return;
    answer(e, act, revealed, reveals, fourButtons);
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
