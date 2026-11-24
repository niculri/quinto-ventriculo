// Opens a popover while a mouse rests on its trigger (after a short wait, so running down a list does not flash it)
// and closes it when the mouse leaves; a tap or a key toggles it instead.
import { useEffect, useRef } from 'react';
import type { Dispatch, PointerEvent, SetStateAction } from 'react';

export const HOVER_OPEN_MS = 300;

export function useHoverOpen(setOpen: Dispatch<SetStateAction<boolean>>) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mouseDownRef = useRef(false);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  const isMouse = (e: PointerEvent) => e.pointerType === 'mouse';
  return {
    onPointerEnter: (e: PointerEvent) => {
      if (!isMouse(e)) return;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setOpen(true), HOVER_OPEN_MS);
    },
    onPointerLeave: (e: PointerEvent) => {
      if (!isMouse(e)) return;
      clearTimeout(timerRef.current);
      setOpen(false);
    },
    onPointerDown: (e: PointerEvent) => {
      mouseDownRef.current = isMouse(e);
    },
    // A mouse click only opens it (the hover may have opened it already); a tap or Enter toggles it.
    onClick: () => {
      clearTimeout(timerRef.current);
      setOpen(mouseDownRef.current ? true : (o) => !o);
      mouseDownRef.current = false;
    },
  };
}
