// The heatmap's day box: placed above or below its day before it is painted, focused when opened with the keyboard,
// and, while pinned, closed by Escape, a press outside, a scroll or a resize.

import { useEffect, useId, useLayoutEffect, useMemo, useRef } from 'react';
import type { CellValue, HeatmapData } from '@qv/study';
import { dayParts } from '../model/dayParts';
import { boxTop } from '../model/layout';
import type { OpenDay } from './useHeatmapGrid';

export function useDayBox({
  open,
  cell,
  data,
  groupOf,
  onClose,
  onOutside,
}: {
  open: OpenDay;
  cell: CellValue;
  data: HeatmapData;
  groupOf: (deckId: string) => string;
  onClose: () => void;
  onOutside: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useLayoutEffect(() => {
    const el = box.current!;
    el.style.top = `${boxTop(open.rect, el.offsetHeight, window.innerHeight)}px`;
  });
  useEffect(() => {
    if (open.pinned && open.keyboard) box.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open.pinned) return;
    const down = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (box.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-day]')) return;
      onOutside();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const away = () => onOutside();
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', away);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', away);
    };
  }, [open.pinned, onClose, onOutside]);

  const parts = useMemo(
    () => dayParts(cell, data.days, groupOf, open.day),
    [cell, data.days, groupOf, open.day],
  );
  return { box, titleId, bodyId, parts };
}
