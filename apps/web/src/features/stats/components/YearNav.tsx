// The heatmap's year and, once there are several years with something, its buttons: back, to this year and ahead.

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Circle } from 'lucide-react';
import { button } from '../../../shared/ui/styles';
import { yearNavStrings as s } from './strings/YearNav.strings';

function YearButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`${button.base} ${button.ghost} size-8 px-0 py-0`}
    >
      {children}
    </button>
  );
}

export function YearNav({
  year,
  thisYear,
  range,
  onChoose,
}: {
  year: number;
  thisYear: number;
  range: { from: number; to: number } | null;
  onChoose: (year: number | null) => void;
}) {
  // With one year there is nowhere to go: only the year. The buttons come on its left, so the year stays where it was.
  const severalYears = !!range && range.from < range.to;
  return (
    <div className="flex flex-none items-center gap-1" role="group" aria-label={s.year}>
      {severalYears ? (
        <>
          <YearButton
            label={s.previousYear}
            disabled={year <= range.from}
            onClick={() => onChoose(year - 1)}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </YearButton>
          <YearButton
            label={s.backToToday}
            disabled={year === thisYear}
            onClick={() => onChoose(null)}
          >
            <Circle className="size-2.5" style={{ fill: 'currentColor' }} aria-hidden="true" />
          </YearButton>
          <YearButton
            label={s.nextYear}
            disabled={year >= range.to}
            onClick={() => onChoose(year + 1)}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </YearButton>
        </>
      ) : null}
      <span className="w-10 text-center text-sm font-medium tabular-nums" aria-live="polite">
        {year}
      </span>
    </div>
  );
}
