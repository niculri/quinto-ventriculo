// ⌘K / Ctrl+K anywhere, or «/» outside a text field, opens the quick search.
import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export function useSearchShortcut(setSearching: Dispatch<SetStateAction<boolean>>) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable]');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setSearching]);
}
