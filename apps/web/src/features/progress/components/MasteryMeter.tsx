// Dominio as a small bar and «62 %», always as wide, with what it means on hover or touch (also inside a link).

import { useState } from 'react';
import { masteryPercent } from '@qv/study';
import { useOutsideClose } from '../hooks/useOutsideClose';
import { masteryMeterStrings as s } from './strings/MasteryMeter.strings';

export function MasteryMeter({
  value,
  align = 'right',
  className = '',
}: {
  value: number;
  align?: 'left' | 'right' | 'above';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useOutsideClose(open, setOpen);
  const percent = masteryPercent(value);
  const place =
    align === 'above'
      ? 'bottom-full left-0 mb-1'
      : align === 'left'
        ? 'top-full left-0 mt-1'
        : 'top-full right-0 mt-1';
  return (
    <span
      ref={boxRef}
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
        {percent}
        {s.mastery.percent}
        <span className="sr-only">{s.mastery.of}</span>
      </span>
      <span
        role="tooltip"
        className={`absolute ${place} z-30 w-56 rounded-lg border border-border bg-surface p-2.5 text-left text-xs font-normal text-ink shadow-soft group-hover/mastery:block ${open ? 'block' : 'hidden'}`}
      >
        {s.mastery.explained}
      </span>
    </span>
  );
}
