// The table's columns: their names and widths, what each cell of a card says and what it sorts by.
import { timeSpan } from '@qv/srs';
import type { SchedTiming } from '@qv/srs';
import { columnsStrings } from './strings/columns.strings';
import type { BrowseCard } from './browseCards';

export type ColumnKey =
  | 'sortField'
  | 'code'
  | 'deck'
  | 'card'
  | 'due'
  | 'interval'
  | 'difficulty'
  | 'stability'
  | 'retrievability'
  | 'reps'
  | 'lapses'
  | 'created'
  | 'noteType'
  | 'tags';

export const COLUMNS: { key: ColumnKey; label: string; width: string; numeric?: boolean }[] = [
  {
    key: 'sortField',
    label: columnsStrings.table.columnNames.sortField,
    width: 'minmax(12rem, 3fr)',
  },
  { key: 'code', label: columnsStrings.table.columnNames.code, width: 'minmax(8rem, 1.2fr)' },
  { key: 'deck', label: columnsStrings.table.columnNames.deck, width: 'minmax(8rem, 1.4fr)' },
  { key: 'card', label: columnsStrings.table.columnNames.card, width: 'minmax(6rem, 0.9fr)' },
  { key: 'due', label: columnsStrings.table.columnNames.due, width: 'minmax(7rem, 1fr)' },
  {
    key: 'interval',
    label: columnsStrings.table.columnNames.interval,
    width: 'minmax(5rem, 0.8fr)',
    numeric: true,
  },
  {
    key: 'difficulty',
    label: columnsStrings.table.columnNames.difficulty,
    width: 'minmax(5rem, 0.7fr)',
    numeric: true,
  },
  {
    key: 'stability',
    label: columnsStrings.table.columnNames.stability,
    width: 'minmax(5rem, 0.8fr)',
    numeric: true,
  },
  {
    key: 'retrievability',
    label: columnsStrings.table.columnNames.retrievability,
    width: 'minmax(6rem, 0.8fr)',
    numeric: true,
  },
  {
    key: 'reps',
    label: columnsStrings.table.columnNames.reps,
    width: 'minmax(4rem, 0.6fr)',
    numeric: true,
  },
  {
    key: 'lapses',
    label: columnsStrings.table.columnNames.lapses,
    width: 'minmax(4rem, 0.6fr)',
    numeric: true,
  },
  { key: 'created', label: columnsStrings.table.columnNames.created, width: 'minmax(6rem, 0.9fr)' },
  { key: 'noteType', label: columnsStrings.table.columnNames.noteType, width: 'minmax(7rem, 1fr)' },
  { key: 'tags', label: columnsStrings.table.columnNames.tags, width: 'minmax(7rem, 1.2fr)' },
];

export const DEFAULT_COLUMNS: ColumnKey[] = ['sortField', 'code', 'card', 'due', 'deck'];

const SHORT_DATE = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const TIME = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit' });

export const shortDate = (ms: number) => SHORT_DATE.format(new Date(ms));

export function recall(c: BrowseCard, timing: SchedTiming): number | null {
  if (c.stability === null || c.difficulty === null || c.lastReview === null) return null;
  const days = Math.max(0, timing.now - c.lastReview) / 86_400;
  const decay = c.decay ?? 0.5;
  const factor = Math.pow(0.9, -1 / decay) - 1;
  return Math.pow(1 + (factor * days) / c.stability, -decay);
}

const codeText = (c: BrowseCard) =>
  c.note.code ? `${c.note.code}${c.note.version ? `.${c.note.version}` : ''}` : '';

function dueText(c: BrowseCard): string {
  if (c.dueAt === null) return columnsStrings.table.newCard(c.position);
  const at = new Date(c.dueAt * 1000);
  return c.intraday ? `${SHORT_DATE.format(at)}, ${TIME.format(at)}` : SHORT_DATE.format(at);
}

function intervalText(c: BrowseCard): string {
  if (c.type === 'new') return columnsStrings.table.newInterval;
  if (c.type === 'learn') return columnsStrings.table.learning;
  return timeSpan(c.interval * 86_400);
}

const percent = (x: number | null) => (x === null ? '' : `${Math.round(x * 100)} %`);

export function cellText(c: BrowseCard, column: ColumnKey, timing: SchedTiming): string {
  const wrap = (t: string) => (c.queue === 'suspended' || c.queue === 'buried' ? `(${t})` : t);
  switch (column) {
    case 'sortField':
      return c.note.sortField;
    case 'code':
      return codeText(c);
    case 'deck':
      return c.deck?.label ?? '';
    case 'card':
      return c.template;
    case 'due':
      return wrap(dueText(c));
    case 'interval':
      return intervalText(c);
    case 'difficulty':
      return c.difficulty === null ? '' : percent((c.difficulty - 1) / 9);
    case 'stability':
      return c.stability === null ? '' : timeSpan(c.stability * 86_400);
    case 'retrievability':
      return percent(recall(c, timing));
    case 'reps':
      return String(c.reps);
    case 'lapses':
      return String(c.lapses);
    case 'created':
      return c.createdMs === null ? '' : shortDate(c.createdMs);
    case 'noteType':
      return c.noteType?.name ?? '';
    case 'tags':
      return c.tags.join(' ');
  }
}

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/** The value a column sorts by (Anki's sort: the due column puts the new ones last, by position). */
function sortValue(c: BrowseCard, column: ColumnKey, timing: SchedTiming): number | string {
  switch (column) {
    case 'sortField':
      return c.note.sortField;
    case 'code':
      return c.note.code ?? '￿';
    case 'deck':
      return c.deck?.name ?? '';
    case 'card':
      return c.template;
    case 'due':
      return c.dueAt ?? 1e13 + c.position;
    case 'interval':
      return c.type === 'review' || c.type === 'relearn' ? c.interval : -1;
    case 'difficulty':
      return c.difficulty ?? -1;
    case 'stability':
      return c.stability ?? -1;
    case 'retrievability':
      return recall(c, timing) ?? -1;
    case 'reps':
      return c.reps;
    case 'lapses':
      return c.lapses;
    case 'created':
      return c.createdMs ?? 0;
    case 'noteType':
      return c.noteType?.name ?? '';
    case 'tags':
      return c.tags.join(' ');
  }
}

export function sortCards<T extends BrowseCard>(
  cards: T[],
  column: ColumnKey,
  descending: boolean,
  timing: SchedTiming,
  value: (c: T) => number | string = (c) => sortValue(c, column, timing),
): T[] {
  const keyed = cards.map((c, i) => ({ c, v: value(c), i }));
  keyed.sort((a, b) => {
    const d =
      typeof a.v === 'number' && typeof b.v === 'number'
        ? a.v - b.v
        : collator.compare(String(a.v), String(b.v));
    // Ties keep the order of the notes (by code) and the card's number.
    return (descending ? -d : d) || a.i - b.i;
  });
  return keyed.map((x) => x.c);
}
