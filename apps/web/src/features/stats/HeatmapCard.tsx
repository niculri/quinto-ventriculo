import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Circle, X } from 'lucide-react';
import type { Catalog } from '@qv/schema';
import { Skeleton } from '../../ui/Loading';
import { button, card } from '../../ui/styles';
import { usePreferences, useToday } from '../study/queries';
import {
  COLUMNS,
  SHORT_MONTHS,
  answersText,
  cellLabel,
  cellValue,
  countsByDay,
  dateText,
  dueByDay,
  dueText,
  heatmapStats,
  yearGrid,
  yearOf,
  yearRange,
} from './heatmap';
import type { CellValue, HeatmapData, HeatmapStats } from './heatmap';
import { useHeatmapData } from './queries';

/**
 * The study heatmap (plan step 3.1), on the home page (every deck) and on a course's page (only its decks, with their
 * own scale). A calendar year, a cell a day; ◀ ● ▶ change the year and come back to today; below, the four figures.
 * Nothing moves: the grid always has 54 weeks of 12 px cells, and loading, an empty history and an error keep the same
 * box. On a narrow screen the grid scrolls inside its box, starting at today. A click (or Enter) on a day opens a box
 * that floats over the page with its total and what it was, by course or by assessment.
 */

/** Cell and gap (px): 54 weeks × 14 + the weekdays' 28 = 784, inside the 800 of a card on the page. */
const CELL = 12;
const GAP = 2;
const PITCH = CELL + GAP;
const LABELS = 26;
const GRID_WIDTH = GAP + LABELS + GAP + COLUMNS * PITCH;

/** Shades of the site's turquoise for what was studied, of gray for what is due; with the theme's own colors. */
const STUDIED = [12, 22, 32, 42, 52, 62, 72, 82, 91, 100];
const DUE = [16, 24, 32, 40, 48, 56, 64, 72, 80, 88];
function shade(cell: CellValue | null): string {
  if (!cell || cell.level === 0) return 'var(--surface-2)';
  const [color, base, steps] =
    cell.kind === 'past'
      ? ['var(--heat)', 'var(--brand-soft)', STUDIED]
      : ['var(--muted)', 'var(--surface-2)', DUE];
  return `color-mix(in oklab, ${color} ${steps[cell.level - 1]}%, ${base})`;
}

const WEEKDAY_LABELS = ['Lu', '', 'Mi', '', 'Vi', '', ''];

/** The day's box keeps this far from the day and from the window's edges (px). */
const MARGIN = 8;

export interface HeatmapProps {
  /** The query's scope: 'all', or the course's id. */
  scope: string;
  /** The decks it counts (null: all of the student's). */
  deckIds: string[] | null;
  catalog: Catalog;
  /** What the box of a day splits its total by. */
  groupBy: 'course' | 'assessment';
  title?: string;
  className?: string;
}

export function Heatmap({
  scope,
  deckIds,
  catalog,
  groupBy,
  title = 'Días de estudio',
  className = '',
}: HeatmapProps) {
  const headingId = useId();
  const query = useHeatmapData(scope, deckIds);
  const { prefs } = usePreferences();
  const today = useToday(prefs);
  const data = query.data;
  const ready = !!data && today !== null;

  const studied = useMemo(
    () => (data && today !== null ? countsByDay(data.days, today) : new Map<number, number>()),
    [data, today],
  );
  const due = useMemo(
    () => (data && today !== null ? dueByDay(data.due, today) : new Map<number, number>()),
    [data, today],
  );
  const stats = useMemo(
    () => (today !== null ? heatmapStats(studied, today) : null),
    [studied, today],
  );
  const range = today !== null ? yearRange(studied, due, today) : null;
  const thisYear = today !== null ? yearOf(today) : new Date().getFullYear();
  const [chosen, setChosen] = useState<number | null>(null);
  const year = chosen ?? thisYear;

  const groupOf = useGroups(catalog, groupBy);

  return (
    <section className={`${card} p-4 sm:p-6 ${className}`} aria-labelledby={headingId}>
      {/* One line of a fixed height: a web font arriving late cannot wrap the title and move the grid. */}
      <div className="flex h-9 items-center justify-between gap-2">
        <h2 id={headingId} className="min-w-0 truncate font-serif text-lg font-semibold sm:text-xl">
          {title}
        </h2>
        <div className="flex flex-none items-center gap-1" role="group" aria-label="Año">
          <span className="w-10 text-center text-sm font-medium tabular-nums" aria-live="polite">
            {year}
          </span>
          <YearButton
            label="Año anterior"
            disabled={!range || year <= range.from}
            onClick={() => setChosen(year - 1)}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </YearButton>
          <YearButton
            label="Volver a hoy"
            disabled={year === thisYear}
            onClick={() => setChosen(null)}
          >
            <Circle className="size-2.5" style={{ fill: 'currentColor' }} aria-hidden="true" />
          </YearButton>
          <YearButton
            label="Año siguiente"
            disabled={!range || year >= range.to}
            onClick={() => setChosen(year + 1)}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </YearButton>
        </div>
      </div>
      {/* Another year is another grid: the focus and an open day do not carry over. */}
      <Grid
        key={year}
        year={year}
        today={today}
        ready={ready}
        studied={studied}
        due={due}
        scale={stats?.scale ?? 20}
        data={data}
        groupOf={groupOf}
        error={query.isError && !data}
        onRetry={() => void query.refetch()}
      />
      <Figures stats={ready ? stats : null} />
    </section>
  );
}

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

/** What a deck counts under in a day's box: its course (home) or its assessment (a course's page). */
function useGroups(catalog: Catalog, groupBy: 'course' | 'assessment') {
  return useMemo(() => {
    const courses = new Map(
      catalog.semesters.flatMap((s) => s.courses.map((c) => [c.id, c] as const)),
    );
    const assessments = new Map(
      [...courses.values()].flatMap((c) => c.assessments.map((a) => [a.id, a.name] as const)),
    );
    const byDeck = new Map<string, string>();
    for (const d of catalog.anki.decks) {
      const course = d.courseId ? courses.get(d.courseId) : undefined;
      if (!course) continue;
      const label =
        groupBy === 'course'
          ? `${course.emoji} ${course.name}`
          : ((d.assessmentId && assessments.get(d.assessmentId)) ?? course.name);
      byDeck.set(d.id, label);
    }
    return (deckId: string) => byDeck.get(deckId) ?? 'Otros mazos';
  }, [catalog, groupBy]);
}

interface Open {
  day: number;
  rect: DOMRect;
  /** Opened by a click or Enter: it stays until closed. Else it follows the pointer. */
  pinned: boolean;
  /** Opened with the keyboard: the focus goes into the box, so that a screen reader reads it all. */
  keyboard?: boolean;
}

function Grid({
  year,
  today,
  ready,
  studied,
  due,
  scale,
  data,
  groupOf,
  error,
  onRetry,
}: {
  year: number;
  today: number | null;
  ready: boolean;
  studied: ReadonlyMap<number, number>;
  due: ReadonlyMap<number, number>;
  scale: number;
  data: HeatmapData | undefined;
  groupOf: (deckId: string) => string;
  error: boolean;
  onRetry: () => void;
}) {
  const grid = useMemo(() => yearGrid(year), [year]);
  const scroller = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const [focusDay, setFocusDay] = useState<number | null>(null);
  const [open, setOpen] = useState<Open | null>(null);
  const inYear = (d: number) => d >= grid.first && d <= grid.last;
  const current =
    focusDay !== null && inYear(focusDay)
      ? focusDay
      : today !== null && inYear(today)
        ? today
        : grid.first;

  // Starts showing today (or the end of a past year, the start of a future one), before it is painted.
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const max = box.scrollWidth - box.clientWidth;
    if (max <= 0) return;
    if (today !== null && inYear(today)) {
      const column = Math.floor((today - grid.columns[0]![0]!) / 7);
      const x = GAP + LABELS + GAP + column * PITCH;
      box.scrollLeft = Math.min(max, Math.max(0, x - box.clientWidth + 4 * PITCH));
    } else {
      box.scrollLeft = today !== null && grid.first > today ? 0 : max;
    }
    // Only when the year or today change: not while the student scrolls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, today, ready]);

  const valueOf = (day: number): CellValue | null =>
    ready && today !== null ? cellValue(day, today, studied, due, scale) : null;

  const cellOf = (day: number) =>
    table.current?.querySelector<HTMLElement>(`[data-day="${day}"]`) ?? null;

  const show = (day: number, pinned: boolean, keyboard = false) => {
    const el = cellOf(day);
    if (!el || !ready) return;
    setOpen({ day, rect: el.getBoundingClientRect(), pinned, keyboard });
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTableElement>) => {
    const moves: Record<string, number> = {
      ArrowLeft: -7,
      ArrowRight: 7,
      ArrowUp: -1,
      ArrowDown: 1,
    };
    let next: number | null = null;
    if (e.key in moves) next = current + moves[e.key]!;
    else if (e.key === 'Home') next = grid.first;
    else if (e.key === 'End') next = grid.last;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open?.pinned && open.day === current) setOpen(null);
      else show(current, true, true);
      return;
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(null);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    next = Math.min(grid.last, Math.max(grid.first, next));
    setFocusDay(next);
    if (open) setOpen(null);
    cellOf(next)?.focus();
  };

  return (
    <div className="relative mt-3">
      <div
        ref={scroller}
        className="overflow-x-auto overscroll-x-contain pb-1"
        onScroll={() => open && setOpen(null)}
      >
        <div style={{ width: GRID_WIDTH }} className="relative">
          <div className="relative h-4 text-[0.6875rem] leading-4 text-muted" aria-hidden="true">
            {grid.months.map(({ month, column }) => (
              <span
                key={month}
                className="absolute top-0"
                style={{ left: GAP + LABELS + GAP + column * PITCH }}
              >
                {SHORT_MONTHS[month]}
              </span>
            ))}
          </div>
          <table
            ref={table}
            role="grid"
            aria-label={`Días de estudio de ${year}`}
            aria-busy={!ready}
            onKeyDown={onKeyDown}
            onMouseLeave={() => setOpen((o) => (o?.pinned ? o : null))}
            className="table-fixed border-separate"
            style={{ borderSpacing: GAP, width: GRID_WIDTH }}
          >
            <tbody>
              {WEEKDAY_LABELS.map((label, row) => (
                <tr key={row}>
                  <th
                    scope="row"
                    // The weekdays stay in view while the grid scrolls (the phone).
                    className="sticky left-0 z-10 bg-surface p-0 text-left text-[0.6875rem] leading-3 font-normal text-muted"
                    // Its shadows cover the gaps before and after it, where the scrolled cells would show.
                    style={{
                      width: LABELS,
                      height: CELL,
                      boxShadow: `${GAP}px 0 0 var(--surface), -${GAP}px 0 0 var(--surface)`,
                    }}
                  >
                    <span aria-hidden="true">{label}</span>
                  </th>
                  {grid.columns.map((week, c) => {
                    const day = week[row]!;
                    if (day === null) {
                      return (
                        <td
                          key={c}
                          aria-hidden="true"
                          className="p-0"
                          style={{ width: CELL, height: CELL }}
                        />
                      );
                    }
                    const cell = valueOf(day);
                    const isToday = day === today;
                    return (
                      <td
                        key={c}
                        role="gridcell"
                        data-day={day}
                        tabIndex={day === current ? 0 : -1}
                        aria-label={
                          cell && today !== null ? cellLabel(day, cell, today) : dateText(day)
                        }
                        aria-current={isToday ? 'date' : undefined}
                        onClick={() => {
                          setFocusDay(day);
                          if (open?.pinned && open.day === day) setOpen(null);
                          else show(day, true);
                        }}
                        onMouseEnter={() => {
                          if (!open?.pinned) show(day, false);
                        }}
                        onFocus={() => setFocusDay(day)}
                        className={`p-0 ${ready ? '' : 'animate-pulse'} cursor-pointer rounded-[2px] focus-visible:outline-offset-1`}
                        style={{
                          width: CELL,
                          height: CELL,
                          background: shade(cell),
                          boxShadow: isToday ? '0 0 0 1.5px var(--ink)' : undefined,
                        }}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center gap-3 rounded-lg bg-surface/85 text-sm">
          <span className="text-muted">No se pudieron cargar tus días de estudio.</span>
          <button type="button" onClick={onRetry} className={`${button.base} ${button.secondary}`}>
            Reintentar
          </button>
        </div>
      ) : null}
      {open && data && today !== null ? (
        <DayBox
          open={open}
          today={today}
          cell={cellValue(open.day, today, studied, due, scale)}
          data={data}
          groupOf={groupOf}
          onClose={() => {
            const day = open.day;
            setOpen(null);
            cellOf(day)?.focus();
          }}
          onOutside={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

/** The box of a day: floats over the page (a portal, fixed), so it pushes nothing. */
function DayBox({
  open,
  today,
  cell,
  data,
  groupOf,
  onClose,
  onOutside,
}: {
  open: Open;
  today: number;
  cell: CellValue;
  data: HeatmapData;
  groupOf: (deckId: string) => string;
  onClose: () => void;
  onOutside: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  // Above the day if it fits, else below; always inside the window, whatever its height (many courses in a day).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const height = el.offsetHeight;
    const { rect } = open;
    let top = rect.top - MARGIN - height;
    if (top < MARGIN) top = rect.bottom + MARGIN;
    el.style.top = `${Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN))}px`;
  });
  // Opened with the keyboard, the focus goes into it (Escape brings it back to the day).
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

  const parts = useMemo(() => {
    if (cell.kind !== 'past' || cell.value === 0) return [];
    const by = new Map<string, number>();
    for (const d of data.days) {
      if (d.day !== open.day) continue;
      const label = groupOf(d.deckId);
      by.set(label, (by.get(label) ?? 0) + d.answers + d.practice);
    }
    return [...by].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [cell, data.days, groupOf, open.day]);

  const WIDTH = 288;
  const { rect } = open;
  const left = Math.min(
    Math.max(MARGIN, rect.left + rect.width / 2 - WIDTH / 2),
    Math.max(MARGIN, window.innerWidth - WIDTH - MARGIN),
  );
  const date = dateText(open.day, true);
  return createPortal(
    <div
      ref={box}
      // A box to read and close when it stays; while it follows the pointer, a tooltip.
      role={open.pinned ? 'dialog' : 'tooltip'}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      tabIndex={-1}
      className={`fixed z-50 rounded-xl border border-border bg-surface p-3 text-sm shadow-soft focus:outline-none ${
        open.pinned ? '' : 'pointer-events-none'
      }`}
      // Its top, measured once it has its height (the layout effect above, before it is painted).
      style={{ width: WIDTH, left, top: rect.bottom + MARGIN }}
    >
      <div className="flex items-start justify-between gap-2">
        <p id={titleId} className="font-medium first-letter:uppercase">
          {date}
          {open.day === today ? ' · hoy' : ''}
        </p>
        {open.pinned ? (
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="-mt-1 -mr-1 rounded p-1 text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div id={bodyId}>
        <p className="mt-0.5 text-muted tabular-nums" aria-live="polite">
          {cell.kind === 'past'
            ? cell.value > 0
              ? answersText(cell.value)
              : 'Sin estudio'
            : cell.value > 0
              ? dueText(cell.value)
              : 'Nada por repasar'}
        </p>
        {parts.length ? (
          <ul className="mt-2 space-y-1 border-t border-border pt-2">
            {parts.map(([label, n]) => (
              <li key={label} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">{label}</span>
                <span className="flex-none text-muted tabular-nums">
                  {n.toLocaleString('es-CL')}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** The four figures, in their places from the first frame (2 × 2 on the phone). */
function Figures({ stats }: { stats: HeatmapStats | null }) {
  const empty = stats !== null && stats.activeDays === 0;
  const days = (n: number) => `${n.toLocaleString('es-CL')} ${n === 1 ? 'día' : 'días'}`;
  const items: [string, string][] = stats
    ? [
        ['Promedio diario', answersText(stats.dailyAverage)],
        ['Días estudiados', `${stats.studiedPercent} %`],
        ['Racha más larga', days(stats.longestStreak)],
        ['Racha actual', days(stats.currentStreak)],
      ]
    : [
        ['Promedio diario', ''],
        ['Días estudiados', ''],
        ['Racha más larga', ''],
        ['Racha actual', ''],
      ];
  return (
    <div className="relative mt-3">
      <dl
        className={`grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 ${empty ? 'invisible' : ''}`}
        aria-hidden={empty}
      >
        {items.map(([label, value]) => (
          <div key={label} className="h-11 min-w-0">
            <dt className="truncate text-xs text-muted">{label}</dt>
            <dd className="mt-0.5 h-6 truncate text-base font-semibold tabular-nums">
              {stats ? value : <Skeleton className="h-5 w-20" />}
            </dd>
          </div>
        ))}
      </dl>
      {empty ? (
        <p className="absolute inset-0 flex items-center text-sm text-muted">
          Tus días de estudio van a aparecer aquí.
        </p>
      ) : null}
    </div>
  );
}
