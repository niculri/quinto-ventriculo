// The browser's rows: each card or note as Anki's search and table see it, with its columns, cell texts and sorting.

import { dayStartsAt, fillParameters, timeSpan } from '@qv/srs';
import type { SchedTiming } from '@qv/srs';
import type { SearchCard } from '@qv/anki-search';
import type { BrowseNote, CardKind, NoteTypeSummary } from '@qv/schema';
import type { StoredCard, StudyPreferences } from '@qv/schema/user';
import { cardKey, isHidden, toRecord } from '@qv/study';
import type { DeckNode } from '../../catalog/model/tree';
import { cardsStrings } from '../strings';

export interface BrowseCard extends SearchCard {
  key: string;
  note: BrowseNote;
  noteType: NoteTypeSummary | undefined;
  kind: CardKind;
  deck: DeckNode | undefined;
  template: string;
  position: number;
  row: StoredCard | undefined;
  dueAt: number | null;
  intraday: boolean;
}

export type DecayOf = (deckId: string) => number;

function kindOf(t: NoteTypeSummary | undefined): CardKind {
  if (t?.occlusion) return 'occlusion';
  return t?.kind === 'cloze' ? 'cloze' : 'basic';
}

export function decayFromParams(params: readonly number[]): number {
  return fillParameters(params)[20]!;
}

interface CardSources {
  rows: Map<string, StoredCard>;
  decks: Map<string, DeckNode>;
  prefs: StudyPreferences;
  decayOf: DecayOf;
  nowMs: number;
}

const TYPES = { new: 'new', learning: 'learn', review: 'review', relearning: 'relearn' } as const;

function dueOf(record: ReturnType<typeof toRecord>, prefs: StudyPreferences): number | null {
  if (record === null) return null;
  return record.queue === 'learn'
    ? record.due
    : dayStartsAt(record.due, prefs.timeZone, prefs.dayStartsAt);
}

function browseCard(
  note: BrowseNote,
  index: number,
  type: NoteTypeSummary | undefined,
  c: BrowseNote['cards'][number],
  { rows, decks, prefs, decayOf, nowMs }: CardSources,
): BrowseCard {
  const createdMs = note.createdAt ? Date.parse(note.createdAt) : null;
  const key = cardKey({ noteGuid: note.guid, ord: c.ord });
  const row = rows.get(key);
  const record = toRecord(row, prefs);
  const hidden = isHidden(row, nowMs);
  const phase = record?.phase ?? 'new';
  const queue: SearchCard['queue'] = row?.suspended
    ? 'suspended'
    : hidden
      ? 'buried'
      : (record?.queue ?? 'new');
  const name = type?.templates[type.kind === 'cloze' ? 0 : c.ord] ?? '';
  return {
    key,
    note,
    noteType: type,
    kind: kindOf(type),
    deck: decks.get(c.deckId),
    template: type?.kind === 'cloze' ? `${name} ${c.ord + 1}` : name,
    position: index + 1,
    row,
    intraday: record?.queue === 'learn',
    dueAt: dueOf(record, prefs),
    noteGuid: note.guid,
    ord: c.ord,
    deckId: c.deckId,
    noteTypeId: note.noteTypeId,
    tags: note.tags,
    fields: note.fields,
    createdMs,
    type: TYPES[phase],
    queue,
    due: record === null ? null : record.due,
    interval: record?.interval ?? 0,
    reps: row?.reps ?? 0,
    lapses: row?.lapses ?? 0,
    flag: row?.flag ?? 0,
    stability: record?.stability ?? null,
    difficulty: record?.difficulty ?? null,
    lastReview: record?.lastReview ?? null,
    decay: record?.stability ? decayOf(c.deckId) : null,
  };
}

export function buildBrowseCards(
  notes: BrowseNote[],
  noteTypes: NoteTypeSummary[],
  decks: Map<string, DeckNode>,
  rows: Map<string, StoredCard>,
  prefs: StudyPreferences,
  decayOf: DecayOf,
  nowMs: number,
): BrowseCard[] {
  const types = new Map(noteTypes.map((t) => [t.id, t]));
  const sources: CardSources = { rows, decks, prefs, decayOf, nowMs };
  return notes.flatMap((note, index) =>
    note.cards.map((c) => browseCard(note, index, types.get(note.noteTypeId), c, sources)),
  );
}

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
    label: cardsStrings.table.columnNames.sortField,
    width: 'minmax(12rem, 3fr)',
  },
  { key: 'code', label: cardsStrings.table.columnNames.code, width: 'minmax(8rem, 1.2fr)' },
  { key: 'deck', label: cardsStrings.table.columnNames.deck, width: 'minmax(8rem, 1.4fr)' },
  { key: 'card', label: cardsStrings.table.columnNames.card, width: 'minmax(6rem, 0.9fr)' },
  { key: 'due', label: cardsStrings.table.columnNames.due, width: 'minmax(7rem, 1fr)' },
  {
    key: 'interval',
    label: cardsStrings.table.columnNames.interval,
    width: 'minmax(5rem, 0.8fr)',
    numeric: true,
  },
  {
    key: 'difficulty',
    label: cardsStrings.table.columnNames.difficulty,
    width: 'minmax(5rem, 0.7fr)',
    numeric: true,
  },
  {
    key: 'stability',
    label: cardsStrings.table.columnNames.stability,
    width: 'minmax(5rem, 0.8fr)',
    numeric: true,
  },
  {
    key: 'retrievability',
    label: cardsStrings.table.columnNames.retrievability,
    width: 'minmax(6rem, 0.8fr)',
    numeric: true,
  },
  {
    key: 'reps',
    label: cardsStrings.table.columnNames.reps,
    width: 'minmax(4rem, 0.6fr)',
    numeric: true,
  },
  {
    key: 'lapses',
    label: cardsStrings.table.columnNames.lapses,
    width: 'minmax(4rem, 0.6fr)',
    numeric: true,
  },
  { key: 'created', label: cardsStrings.table.columnNames.created, width: 'minmax(6rem, 0.9fr)' },
  { key: 'noteType', label: cardsStrings.table.columnNames.noteType, width: 'minmax(7rem, 1fr)' },
  { key: 'tags', label: cardsStrings.table.columnNames.tags, width: 'minmax(7rem, 1.2fr)' },
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
  if (c.dueAt === null) return cardsStrings.table.newCard(c.position);
  const at = new Date(c.dueAt * 1000);
  return c.intraday ? `${SHORT_DATE.format(at)}, ${TIME.format(at)}` : SHORT_DATE.format(at);
}

function intervalText(c: BrowseCard): string {
  if (c.type === 'new') return cardsStrings.table.newInterval;
  if (c.type === 'learn') return cardsStrings.table.learning;
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
      return c.dueAt === null ? 1e13 + c.position : c.dueAt;
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

/** As Anki's «Notas» mode: repetitions and lapses add up, interval, difficulty and stability average, due is the earliest. */
export interface BrowseNoteRow extends BrowseCard {
  cards: BrowseCard[];
}

export function notesOf(cards: BrowseCard[]): BrowseNoteRow[] {
  const byNote = new Map<string, BrowseCard[]>();
  for (const c of cards) byNote.set(c.noteGuid, [...(byNote.get(c.noteGuid) ?? []), c]);
  return [...byNote.values()].map((list) => {
    const first = list[0]!;
    const avg = (xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => x !== null);
      return v.length ? v.reduce((t, x) => t + x, 0) / v.length : null;
    };
    const dues = list.map((c) => c.dueAt).filter((x): x is number => x !== null);
    return {
      ...first,
      key: `note:${first.noteGuid}`,
      cards: list,
      template: cardsStrings.table.cardsOfNote(list.length),
      reps: list.reduce((t, c) => t + c.reps, 0),
      lapses: list.reduce((t, c) => t + c.lapses, 0),
      interval: Math.round(avg(list.map((c) => (c.type === 'new' ? null : c.interval))) ?? 0),
      stability: avg(list.map((c) => c.stability)),
      difficulty: avg(list.map((c) => c.difficulty)),
      dueAt: dues.length ? Math.min(...dues) : null,
      type: list.some((c) => c.type !== 'new') ? 'review' : 'new',
    };
  });
}

/** The cards of the table's rows: in «Notas», every card of each note. */
export const cardsOfRows = (rows: BrowseCard[], mode: 'cards' | 'notes'): BrowseCard[] =>
  mode === 'notes' ? rows.flatMap((n) => (n as BrowseNoteRow).cards) : rows;

/** What the big viewer shows of the table's rows: every card, in the table's order. */
export const viewerSummaries = (cards: BrowseCard[]) =>
  cards.map((c) => ({
    noteGuid: c.noteGuid,
    ord: c.ord,
    deckId: c.deckId,
    code: c.note.code,
    version: c.note.version,
    kind: c.kind,
    text: c.note.sortField,
  }));
