import { useEffect, useRef, useState } from 'react';
import { masteryPercent } from './mastery';

const EXPLAINED =
  'Dominio: cuánto recordarías hoy de esta materia, según tus repasos. Lo que no has visto cuenta como 0.';

/**
 * Dominio: a small bar and «62 %», always as wide. With the pointer over it or with a touch, what it means (also
 * inside a link: the touch does not follow it).
 */
export function MasteryMeter({
  value,
  align = 'right',
  className = '',
}: {
  value: number;
  /** The side the explanation hangs from, and whether it opens upwards (at the bottom of a card that clips it). */
  align?: 'left' | 'right' | 'above';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const percent = masteryPercent(value);
  const place =
    align === 'above'
      ? 'bottom-full left-0 mb-1'
      : align === 'left'
        ? 'top-full left-0 mt-1'
        : 'top-full right-0 mt-1';
  return (
    <span
      ref={box}
      data-mastery
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => !o);
      }}
      className={`group/mastery relative inline-flex flex-none cursor-help items-center gap-1.5 ${className}`}
    >
      <span
        aria-hidden="true"
        className="block h-1.5 w-10 flex-none overflow-hidden rounded-full bg-border"
      >
        <span className="block h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </span>
      <span className="w-9 flex-none text-left text-xs font-normal text-muted tabular-nums">
        {percent} %<span className="sr-only"> de dominio</span>
      </span>
      <span
        role="tooltip"
        className={`absolute ${place} z-30 w-56 rounded-lg border border-border bg-surface p-2.5 text-left text-xs font-normal text-ink shadow-soft group-hover/mastery:block ${open ? 'block' : 'hidden'}`}
      >
        {EXPLAINED}
      </span>
    </span>
  );
}
