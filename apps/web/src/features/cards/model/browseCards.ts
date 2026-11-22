// The table's rows: each card or note as Anki's search and table see it, and what the big viewer shows of them.

import { dayStartsAt, fillParameters } from '@qv/srs';
import type { SearchCard } from '@qv/anki-search';
import type { BrowseNote, CardKind, NoteTypeSummary } from '@qv/schema';
import type { StoredCard, StudyPreferences } from '@qv/schema/user';
import { cardKey, isHidden, toRecord } from '@qv/study';
import type { DeckNode } from '../../catalog/model/tree';
import { columnsStrings } from './strings/columns.strings';

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
  /** Only the draft has it (admin mode): it is looked at, and nothing is done to it. */
  draftOnly: boolean;
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
  draftOnly: ReadonlySet<string>;
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
  { rows, decks, prefs, decayOf, nowMs, draftOnly }: CardSources,
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
    draftOnly: draftOnly.has(key),
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
  draftOnly: ReadonlySet<string>,
): BrowseCard[] {
  const types = new Map(noteTypes.map((t) => [t.id, t]));
  const sources: CardSources = { rows, decks, prefs, decayOf, nowMs, draftOnly };
  return notes.flatMap((note, index) =>
    note.cards.map((c) => browseCard(note, index, types.get(note.noteTypeId), c, sources)),
  );
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
      draftOnly: list.some((c) => c.draftOnly),
      template: columnsStrings.table.cardsOfNote(list.length),
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
