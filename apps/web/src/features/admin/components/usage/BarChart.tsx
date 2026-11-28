// A column chart with an axis of round marks and a box with the data of the column under the pointer, the finger or
// the keyboard; the whole height of a day answers, also when its bar is short or 0.
import { FEW } from '@qv/schema';
import { NUMBER, barHeight } from '../../model/usage';
import { WIDEST_MARK } from '../../model/usageChart';
import type { ChartColumn } from '../../model/usageChart';
import { useBarFocus } from '../../hooks/useBarFocus';
const TIP_WIDTH = '12rem';

/** Beside its column, on the side with more room, and never past the chart's edges. */
function tipPlace(i: number, n: number) {
  const gap = '0.375rem';
  const room = `calc(100% - ${TIP_WIDTH})`;
  return i < n / 2
    ? { left: `min(calc(${String((100 * (i + 1)) / n)}% + ${gap}), ${room})` }
    : { right: `min(calc(${String((100 * (n - i)) / n)}% + ${gap}), ${room})` };
}

function Tip({ column, i, n }: { column: ChartColumn; i: number; n: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-1 z-10 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md"
      style={{ width: TIP_WIDTH, ...tipPlace(i, n) }}
    >
      <p className="font-medium text-ink first-letter:uppercase">{column.when}</p>
      <p className="mt-0.5 font-semibold text-ink tabular-nums">{column.figure}</p>
      {column.detail ? <p className="mt-0.5 text-muted tabular-nums">{column.detail}</p> : null}
    </div>
  );
}

function Axis({ ticks }: { ticks: readonly number[] }) {
  const top = ticks.at(-1)!;
  return (
    <div aria-hidden="true" className="relative h-40 text-right text-xs text-muted tabular-nums">
      <span className="invisible block h-0 overflow-hidden">{WIDEST_MARK}</span>
      {ticks.map((t) => (
        <span
          key={t}
          className="absolute right-0 translate-y-1/2 leading-none"
          style={{ bottom: `${String((100 * t) / top)}%` }}
        >
          {NUMBER.format(t)}
        </span>
      ))}
    </div>
  );
}

export function BarChart({
  label,
  columns,
  ticks,
}: {
  label: string;
  columns: readonly ChartColumn[];
  ticks: readonly number[];
}) {
  const n = columns.length;
  const top = ticks.at(-1)!;
  const { listRef, shown, stop, pick, onKeyDown, onBlur, onEnter, onLeave } = useBarFocus(n);
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
      <Axis ticks={ticks} />
      <div className="relative h-40">
        {ticks.map((t) => (
          <div
            key={t}
            aria-hidden="true"
            className={`absolute inset-x-0 border-t ${t === 0 ? 'border-border-strong' : 'border-border'}`}
            style={{ bottom: `${String((100 * t) / top)}%` }}
          />
        ))}
        <ol
          ref={listRef}
          aria-label={label}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          onPointerLeave={onLeave}
          className="relative flex h-full items-end gap-[2px] sm:gap-1"
        >
          {columns.map((c, i) => (
            <li key={c.key} className="flex h-full min-w-0 flex-1">
              <button
                type="button"
                tabIndex={i === stop ? 0 : -1}
                onPointerEnter={(e) => {
                  onEnter(e, i);
                }}
                onFocus={() => {
                  pick(i);
                }}
                onClick={() => {
                  pick(i);
                }}
                className={`flex h-full w-full items-end rounded-t-sm ${i === shown ? 'bg-brand-soft' : ''}`}
              >
                <span className="sr-only">{c.name}</span>
                <span
                  aria-hidden="true"
                  className={`block w-full rounded-t-sm ${c.value === FEW ? 'bg-border-strong' : 'bg-brand'}`}
                  style={{ height: barHeight(c.value, top) }}
                />
              </button>
            </li>
          ))}
        </ol>
        {shown !== null ? <Tip column={columns[shown]!} i={shown} n={n} /> : null}
      </div>
    </div>
  );
}
