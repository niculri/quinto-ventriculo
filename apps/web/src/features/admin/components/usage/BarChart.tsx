// A column chart with an axis of round marks and the data of the column under the pointer, the finger or the keyboard:
// in a box beside it, or on a phone in a strip kept above the bars; the whole height of a day answers, also at 0.
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

/** `line` keeps each line to one in the strip, which has a fixed height; the box, narrower, wraps them. */
function TipLines({ column, line = '' }: { column: ChartColumn; line?: string }) {
  return (
    <>
      <p className={`${line} font-medium text-ink first-letter:uppercase`}>{column.when}</p>
      <p className={`${line} mt-0.5 font-semibold text-ink tabular-nums`}>{column.figure}</p>
      {column.detail ? (
        <p className={`${line} mt-0.5 text-muted tabular-nums`}>{column.detail}</p>
      ) : null}
    </>
  );
}

/** Wide screens: a box floating beside the column. */
function Tip({ column, i, n }: { column: ChartColumn; i: number; n: number }) {
  return (
    <div
      aria-hidden="true"
      data-chart-tip="box"
      className="pointer-events-none absolute top-1 z-10 hidden rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md sm:block"
      style={{ width: TIP_WIDTH, ...tipPlace(i, n) }}
    >
      <TipLines column={column} />
    </div>
  );
}

/** Phones: beside a middle column the box would cover it, so the data goes above the bars, in a strip as tall as its
 * three lines whether a column is shown or not. */
function TipStrip({ column }: { column: ChartColumn | null }) {
  return (
    <div
      aria-hidden="true"
      data-chart-tip="strip"
      className="col-start-2 mb-2 h-13 text-xs sm:hidden"
    >
      {column ? <TipLines column={column} line="truncate" /> : null}
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
      <TipStrip column={shown !== null ? columns[shown]! : null} />
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
