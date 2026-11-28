// Which column of a chart shows its box: the one under the mouse, or the one focused or tapped, until the focus or the
// finger goes elsewhere or Escape; the arrows, Home and End move between columns, with a single Tab stop.
import { useEffect, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, PointerEvent } from 'react';

const KEYS: Record<string, (i: number, n: number) => number> = {
  ArrowLeft: (i) => Math.max(0, i - 1),
  ArrowRight: (i, n) => Math.min(n - 1, i + 1),
  Home: () => 0,
  End: (_, n) => n - 1,
};

export function useBarFocus(n: number) {
  const listRef = useRef<HTMLOListElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const stop = cursor !== null && cursor < n ? cursor : n - 1;
  const raw = hovered ?? (pinned ? cursor : null);
  const shown = raw !== null && raw < n ? raw : null;

  // A tap shows the box without focusing (Safari does not focus a tapped button): a tap elsewhere hides it.
  useEffect(() => {
    if (!pinned) return;
    const away = (e: Event) => {
      if (!(e.target instanceof Node && listRef.current?.contains(e.target))) setPinned(false);
    };
    document.addEventListener('pointerdown', away);
    return () => {
      document.removeEventListener('pointerdown', away);
    };
  }, [pinned]);

  const pick = (i: number) => {
    setCursor(i);
    setPinned(true);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLOListElement>) => {
    if (e.key === 'Escape') {
      setPinned(false);
      setHovered(null);
      return;
    }
    const move = KEYS[e.key];
    if (!move || n === 0) return;
    e.preventDefault();
    const next = move(stop, n);
    pick(next);
    listRef.current?.querySelectorAll('button')[next]?.focus();
  };
  const onBlur = (e: FocusEvent<HTMLOListElement>) => {
    if (!listRef.current?.contains(e.relatedTarget)) setPinned(false);
  };
  const onEnter = (e: PointerEvent, i: number) => {
    if (e.pointerType === 'mouse') setHovered(i);
  };
  const onLeave = () => {
    setHovered(null);
  };
  return { listRef, shown, stop, pick, onKeyDown, onBlur, onEnter, onLeave };
}
