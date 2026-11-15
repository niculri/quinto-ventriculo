// The table's shortcuts, as in Anki's browser: which command a key with Ctrl/⌘ is, or none.

export type TableCommand =
  | { kind: 'search' }
  | { kind: 'undo' }
  | { kind: 'bury' }
  | { kind: 'suspend' }
  | { kind: 'flag'; flag: number }
  | { kind: 'forget' };

interface Key {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Ctrl/⌘+F, Z, J (with Mayús, bury), 1–7 and Alt+N; the last two only in «Modo avanzado». */
export function tableCommand(e: Key, full: boolean): TableCommand | null {
  if (!(e.ctrlKey || e.metaKey)) return null;
  const key = e.key.toLowerCase();
  if (key === 'f') return { kind: 'search' };
  if (key === 'z' && !e.shiftKey) return { kind: 'undo' };
  if (key === 'j') return { kind: e.shiftKey ? 'bury' : 'suspend' };
  if (/^[1-7]$/.test(e.key) && !e.altKey && full) return { kind: 'flag', flag: Number(e.key) };
  if (e.altKey && e.code === 'KeyN' && full) return { kind: 'forget' };
  return null;
}
