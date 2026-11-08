import { useState } from 'react';

const KEY = 'qv-anki-collapsed';

/** The decks the user folded (as Anki's «+»/«−» of the deck list; per browser). */
function readCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function useCollapsed() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        // blocked storage: it stays folded for this visit
      }
      return next;
    });
  return { collapsed, toggle };
}
