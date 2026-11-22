// The table's shortcuts on the whole page; none while typing in a field or while an action runs, except going to the
// search box.

import { useEffect, useEffectEvent } from 'react';
import type { RefObject } from 'react';
import { tableCommand } from '../model/shortcuts';

export function useTableShortcuts({
  full,
  busy,
  searchBoxRef,
  undo,
  toggleSuspend,
  toggleBury,
  flag,
  forget,
}: {
  full: boolean;
  busy: boolean;
  searchBoxRef: RefObject<HTMLInputElement | null>;
  undo: () => void;
  toggleSuspend: () => void;
  toggleBury: () => void;
  flag: (n: number) => void;
  forget: () => void;
}) {
  const onKey = useEffectEvent((e: globalThis.KeyboardEvent) => {
    const command = tableCommand(e, full);
    const origin = (e.composedPath()[0] ?? e.target) as Element | null;
    const typing =
      origin instanceof Element && origin.closest('input, textarea, select, [contenteditable]');
    if (command?.kind === 'search') {
      e.preventDefault();
      searchBoxRef.current?.focus();
      return;
    }
    if (typing || busy || !command) return;
    e.preventDefault();
    if (command.kind === 'undo') undo();
    else if (command.kind === 'bury') toggleBury();
    else if (command.kind === 'suspend') toggleSuspend();
    else if (command.kind === 'flag') flag(command.flag);
    else forget();
  });
  useEffect(() => {
    const listener = (e: globalThis.KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
