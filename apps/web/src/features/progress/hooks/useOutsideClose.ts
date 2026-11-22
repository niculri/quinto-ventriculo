// Closes a popover on a touch outside its box: a phone does not focus a button, so it never gets a blur.
import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export function useOutsideClose(open: boolean, setOpen: Dispatch<SetStateAction<boolean>>) {
  const boxRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open, setOpen]);
  return boxRef;
}
