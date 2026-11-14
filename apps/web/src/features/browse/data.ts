// The browser's rows: each card or note as Anki's search and table see it, with its columns, cell texts and sorting.

import { dayStartsAt, fillParameters, timeSpan } from '@qv/srs';
import type { SchedTiming } from '@qv/srs';
import type { SearchCard } from '@qv/anki-search';
import type { BrowseNote, CardKind, NoteTypeSummary } from '@qv/schema';
import type { StoredCard, StudyPreferences } from '../progress/api/repository';
import { cardKey, isHidden, toRecord } from '@qv/study';
import type { DeckNode } from '../catalog/model/tree';

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
  const out: BrowseCard[] = [];
  notes.forEach((note, index) => {
    const type = types.get(note.noteTypeId);
    const createdMs = note.createdAt ? Date.parse(note.createdAt) : null;
    for (const c of note.cards) {
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
      out.push({
        key,
        note,
        noteType: type,
        kind: kindOf(type),
        deck: decks.get(c.deckId),
        template: type?.kind === 'cloze' ? `${name} ${c.ord + 1}` : name,
        position: index + 1,
        row,
        intraday: record?.queue === 'learn',
        dueAt:
          record === null
            ? null
            : record.queue === 'learn'
              ? record.due
              : dayStartsAt(record.due, prefs.timeZone, prefs.dayStartsAt),
        noteGuid: note.guid,
        ord: c.ord,
        deckId: c.deckId,
        noteTypeId: note.noteTypeId,
        tags: note.tags,
        fields: note.fields,
        createdMs,
        type: ({ new: 'new', learning: 'learn', review: 'review', relearning: 'relearn' } as const)[
          phase
        ],
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
      });
    }
  });
  return out;
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
  { key: 'sortField', label: 'Campo de orden', width: 'minmax(12rem, 3fr)' },
  { key: 'code', label: 'Código', width: 'minmax(8rem, 1.2fr)' },
  { key: 'deck', label: 'Mazo', width: 'minmax(8rem, 1.4fr)' },
  { key: 'card', label: 'Tarjeta', width: 'minmax(6rem, 0.9fr)' },
  { key: 'due', label: 'Vencimiento', width: 'minmax(7rem, 1fr)' },
  { key: 'interval', label: 'Intervalo', width: 'minmax(5rem, 0.8fr)', numeric: true },
  { key: 'difficulty', label: 'Dificultad', width: 'minmax(5rem, 0.7fr)', numeric: true },
  { key: 'stability', label: 'Estabilidad', width: 'minmax(5rem, 0.8fr)', numeric: true },
  {
    key: 'retrievability',
    label: 'Recuperabilidad',
    width: 'minmax(6rem, 0.8fr)',
    numeric: true,
  },
  { key: 'reps', label: 'Repasos', width: 'minmax(4rem, 0.6fr)', numeric: true },
  { key: 'lapses', label: 'Olvidos', width: 'minmax(4rem, 0.6fr)', numeric: true },
  { key: 'created', label: 'Creada', width: 'minmax(6rem, 0.9fr)' },
  { key: 'noteType', label: 'Tipo de nota', width: 'minmax(7rem, 1fr)' },
  { key: 'tags', label: 'Etiquetas', width: 'minmax(7rem, 1.2fr)' },
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

export function cellText(c: BrowseCard, column: ColumnKey, timing: SchedTiming): string {
  const wrap = (t: string) => (c.queue === 'suspended' || c.queue === 'buried' ? `(${t})` : t);
  switch (column) {
    case 'sortField':
      return c.note.sortField;
    case 'code':
      return c.note.code ? `${c.note.code}${c.note.version ? `.${c.note.version}` : ''}` : '';
    case 'deck':
      return c.deck?.label ?? '';
    case 'card':
      return c.template;
    case 'due': {
      if (c.dueAt === null) return wrap(`Nueva #${c.position}`);
      const at = new Date(c.dueAt * 1000);
      return wrap(
        c.intraday ? `${SHORT_DATE.format(at)}, ${TIME.format(at)}` : SHORT_DATE.format(at),
      );
    }
    case 'interval':
      if (c.type === 'new') return '(nueva)';
      if (c.type === 'learn') return '(aprendiendo)';
      return timeSpan(c.interval * 86_400);
    case 'difficulty':
      return c.difficulty === null ? '' : `${Math.round(((c.difficulty - 1) / 9) * 100)} %`;
    case 'stability':
      return c.stability === null ? '' : timeSpan(c.stability * 86_400);
    case 'retrievability': {
      const r = recall(c, timing);
      return r === null ? '' : `${Math.round(r * 100)} %`;
    }
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
      template: `${list.length} ${list.length === 1 ? 'tarjeta' : 'tarjetas'}`,
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
