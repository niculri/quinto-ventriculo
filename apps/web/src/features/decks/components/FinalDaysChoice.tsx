// One choice of the days left only for reviewing: its name, until when new cards come, how many a day and minutes.

import type { PaceOption } from '@qv/study';
import { minutesText, shortDate } from '@qv/study';

export function FinalDaysChoice({
  days,
  name,
  option,
  checked,
  disabled,
  group,
  onChoose,
}: {
  days: number;
  name: string;
  option: PaceOption | null;
  checked: boolean;
  disabled: boolean;
  group: string;
  onChoose: () => void;
}) {
  const label = days === 1 ? '1 día' : `${days} días`;
  const number = option?.newPerDay ?? null;
  return (
    <label
      className={`relative block rounded-lg border px-1.5 py-2 whitespace-nowrap min-[360px]:px-2 sm:px-3 ${
        disabled ? 'opacity-60' : 'cursor-pointer hover:border-border-strong'
      } ${checked && !disabled ? 'border-brand bg-brand-soft' : 'border-border'}`}
    >
      <input
        type="radio"
        name={group}
        checked={checked}
        disabled={disabled}
        onChange={onChoose}
        aria-label={`${label} solo para repasar: ${name}`}
        className="peer absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
      />
      <span className="block text-sm font-medium">
        {label}
        <span className="hidden sm:inline"> · {name}</span>
      </span>
      <span className="block text-xs font-medium sm:hidden">{name}</span>
      <span className="block text-xs text-muted max-[359px]:text-[0.6875rem]">
        {option?.lastNewDate ? (
          <>
            <span className="hidden sm:inline">Nuevas hasta el </span>
            <span className="sm:hidden">Hasta </span>
            {shortDate(option.lastNewDate)}
          </>
        ) : number === null ? (
          '—'
        ) : (
          'Sin nuevas'
        )}
      </span>
      <span className="block text-xs text-muted tabular-nums max-[359px]:text-[0.6875rem]">
        {number === null ? (
          '\u00a0'
        ) : (
          <>
            {number.toLocaleString('es-CL')}
            <span className="hidden sm:inline"> {number === 1 ? 'nueva' : 'nuevas'}</span> al día
          </>
        )}
      </span>
      <span className="block text-xs text-muted tabular-nums max-[359px]:text-[0.6875rem]">
        {option?.minutes === null || option?.minutes === undefined ? (
          '\u00a0'
        ) : (
          <>
            {minutesText(option.minutes)}
            <span className="hidden sm:inline"> al día</span>
          </>
        )}
      </span>
    </label>
  );
}
