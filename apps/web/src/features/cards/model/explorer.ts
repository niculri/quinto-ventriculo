// The cards page without React: what each card is for the student, the filters with their counts, the list's
// groups (by lecture, then by topic) and the cards of «Practicar estas».

import type { CardIndexNote, CardOrigin } from '@qv/schema';
import { ORIGIN_TAGS } from '@qv/schema';
import type { CardRef, StoredCard } from '@qv/schema/user';
import { apartSiblings, cardKey, isHard } from '@qv/study';

export type CardStatus = 'new' | 'seen' | 'hard' | 'hidden';

export type StateFilter = 'all' | 'new' | 'seen' | 'hard' | 'failed' | 'marked' | 'hidden';
export type KindFilter = 'all' | 'text' | 'image';

export const STATE_FILTERS: { value: StateFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'new', label: 'Sin ver' },
  { value: 'seen', label: 'Vistas' },
  { value: 'hard', label: 'Me cuestan' },
  { value: 'failed', label: 'Falladas hace poco' },
  { value: 'marked', label: 'Marcadas' },
  { value: 'hidden', label: 'Ocultas' },
];

export const ORIGIN_FILTERS: { value: CardOrigin; label: string }[] = [
  { value: 'profe', label: 'Lo recalcó el profe' },
  { value: 'control', label: 'Salió en un control' },
  { value: 'clinica', label: 'Clínica' },
  { value: 'complemento', label: 'Del libro' },
];

export const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'text', label: 'Texto' },
  { value: 'image', label: 'Imagen' },
];

export const FAILED_DAYS = 7;

export const parseState = (v: string | null): StateFilter =>
  STATE_FILTERS.some((s) => s.value === v) ? (v as StateFilter) : 'all';
export const parseKind = (v: string | null): KindFilter =>
  v === 'text' || v === 'image' ? v : 'all';
export const parseOrigins = (v: string | null): CardOrigin[] => {
  const on = new Set((v ?? '').split(','));
  return ORIGIN_TAGS.filter((o) => on.has(o));
};

function cardStatus(row: StoredCard | undefined): CardStatus {
  if (!row) return 'new';
  if (row.suspended) return 'hidden';
  if (row.phase === 'new') return 'new';
  return isHard(row) ? 'hard' : 'seen';
}

export interface ExplorerCard extends CardRef {
  key: string;
  status: CardStatus;
  marked: boolean;
}

export interface ExplorerNote {
  note: CardIndexNote;
  assessmentId: string;
  lectureId: string;
  image: boolean;
  cards: ExplorerCard[];
  index: number;
}

export function explorerNotes(
  indexes: readonly { assessmentId: string; notes: readonly CardIndexNote[] }[],
  lectureOf: (deckId: string) => string,
  rows: ReadonlyMap<string, StoredCard>,
): ExplorerNote[] {
  const out: ExplorerNote[] = [];
  for (const index of indexes) {
    for (const note of index.notes) {
      if (!note.cards.length) continue;
      out.push({
        note,
        assessmentId: index.assessmentId,
        lectureId: lectureOf(note.cards[0]!.deckId),
        image: note.kind === 'occlusion' || note.kind === 'photo',
        index: out.length,
        cards: note.cards.map((c) => {
          const key = cardKey({ noteGuid: note.guid, ord: c.ord });
          const row = rows.get(key);
          return {
            key,
            noteGuid: note.guid,
            ord: c.ord,
            deckId: c.deckId,
            status: cardStatus(row),
            marked: !!row?.flag,
          };
        }),
      });
    }
  }
  return out;
}

export interface Filters {
  unitDecks: ReadonlySet<string> | null;
  text: ReadonlySet<string> | null;
  day: ReadonlySet<string> | null;
  failed: ReadonlySet<string>;
  state: StateFilter;
  origins: readonly CardOrigin[];
  kind: KindFilter;
}

export const NO_FILTERS: Filters = {
  unitDecks: null,
  text: null,
  day: null,
  failed: new Set(),
  state: 'all',
  origins: [],
  kind: 'all',
};

function stateMatches(card: ExplorerCard, state: StateFilter, failed: ReadonlySet<string>) {
  switch (state) {
    case 'all':
      return true;
    case 'new':
      return card.status === 'new';
    case 'seen':
      return card.status === 'seen' || card.status === 'hard';
    case 'hard':
      return card.status === 'hard';
    case 'failed':
      return card.status !== 'hidden' && failed.has(card.key);
    case 'marked':
      return card.marked;
    case 'hidden':
      return card.status === 'hidden';
  }
}

const kindMatches = (n: ExplorerNote, kind: KindFilter) =>
  kind === 'all' || (kind === 'image') === n.image;
const originMatches = (n: ExplorerNote, origins: readonly CardOrigin[]) =>
  !origins.length || origins.some((o) => n.note.origin.includes(o));

export interface Matched {
  note: ExplorerNote;
  cards: ExplorerCard[];
}

export interface Facets {
  state: Record<StateFilter, number>;
  origin: Record<CardOrigin, number>;
  kind: Record<KindFilter, number>;
}

const zero = <K extends string>(keys: readonly { value: K }[]) =>
  Object.fromEntries(keys.map((k) => [k.value, 0])) as Record<K, number>;

export function applyFilters(
  notes: readonly ExplorerNote[],
  f: Filters,
): { matched: Matched[]; facets: Facets } {
  const facets: Facets = {
    state: zero(STATE_FILTERS),
    origin: zero(ORIGIN_FILTERS),
    kind: zero(KIND_FILTERS),
  };
  const matched: Matched[] = [];
  const states = STATE_FILTERS.map((s) => s.value);
  const hits = new Set<StateFilter>();
  for (const n of notes) {
    hits.clear();
    const mine: ExplorerCard[] = [];
    for (const c of n.cards) {
      if (f.unitDecks && !f.unitDecks.has(c.deckId)) continue;
      if (f.text && !f.text.has(c.key)) continue;
      if (f.day && !f.day.has(c.key)) continue;
      for (const s of states) if (!hits.has(s) && stateMatches(c, s, f.failed)) hits.add(s);
      if (stateMatches(c, f.state, f.failed)) mine.push(c);
    }
    if (!hits.size) continue;
    const kindOk = kindMatches(n, f.kind);
    const originOk = originMatches(n, f.origins);
    if (kindOk && originOk) for (const s of hits) facets.state[s]++;
    if (hits.has(f.state)) {
      if (kindOk) for (const o of n.note.origin) facets.origin[o]++;
      if (originOk) {
        facets.kind.all++;
        facets.kind[n.image ? 'image' : 'text']++;
      }
    }
    if (mine.length && kindOk && originOk) matched.push({ note: n, cards: mine });
  }
  return { matched, facets };
}

interface Group {
  key: string;
  lectureId: string;
  title: string | null;
  grid: boolean;
  items: Matched[];
}

export interface Lecture {
  id: string;
  groups: Group[];
  notes: number;
}

/** The images of a lecture go in one group: their «Encabezado» is a title per figure, not a topic. */
const IMAGES_TITLE = 'Imágenes';
const GRID_SHARE = 0.8;

export function groupNotes(matched: readonly Matched[]): Lecture[] {
  const lectures = new Map<string, Lecture & { byKey: Map<string, Group> }>();
  for (const m of matched) {
    const id = m.note.lectureId;
    let lecture = lectures.get(id);
    if (!lecture) {
      lecture = { id, groups: [], notes: 0, byKey: new Map() };
      lectures.set(id, lecture);
    }
    const title = m.note.image ? IMAGES_TITLE : m.note.note.topic || null;
    const key = `${id}\u001f${m.note.image ? '\u0000images' : (title ?? '')}`;
    let group = lecture.byKey.get(key);
    if (!group) {
      group = { key, lectureId: id, title, grid: false, items: [] };
      lecture.byKey.set(key, group);
      lecture.groups.push(group);
    }
    group.items.push(m);
    lecture.notes++;
  }
  return [...lectures.values()].map(({ id, groups, notes }) => {
    for (const g of groups) {
      if (g.title !== IMAGES_TITLE) continue;
      const photos = g.items.filter((m) => m.note.note.kind === 'photo').length;
      g.grid = photos >= GRID_SHARE * g.items.length;
    }
    return { id, groups, notes };
  });
}

const CODE = /^(?:t-)?([a-z0-9]+(?:-[a-z0-9]+){2,})(?:\.\d+)?$/i;

const bareCode = (code: string) => code.replace(/^t-/i, '').toUpperCase();

export function noteByCode(notes: readonly ExplorerNote[], text: string): ExplorerNote | null {
  const m = CODE.exec(text.trim());
  if (!m) return null;
  const wanted = m[1]!.toUpperCase();
  return notes.find((n) => n.note.code !== null && bareCode(n.note.code) === wanted) ?? null;
}

/** In the simple mode every word is plain text: no `tag:`, `-`, `*`, `_` or quotes with a meaning. */
export function searchQuery(text: string, syntax: boolean): string {
  const t = text.trim();
  if (syntax || !t) return t;
  return t
    .split(/\s+/)
    .map((w) => `"${w.replace(/[\\*_:"]/g, (c) => `\\${c}`)}"`)
    .join(' ');
}

const OPEN = '\u0001';
const CLOSE = '\u0002';

export type ClozePart =
  { text: string; hole: null } | { text: string; hole: { hint: string | null } };

/** Each outer hole of `{{c1::answer::hint}}` (nested, or cut at the row's length) is its answer without inner markers. */
export function clozeParts(text: string): ClozePart[] {
  const out: ClozePart[] = [];
  let plain = '';
  let depth = 0;
  let inner = '';
  const open = /^\{\{c\d+::/;
  for (let i = 0; i < text.length;) {
    const rest = text.slice(i);
    const start = open.exec(rest);
    if (start) {
      if (depth === 0) {
        if (plain) out.push({ text: plain, hole: null });
        plain = '';
        inner = '';
      } else inner += OPEN;
      depth++;
      i += start[0].length;
      continue;
    }
    if (depth > 0 && rest.startsWith('}}')) {
      depth--;
      i += 2;
      if (depth === 0) {
        out.push(hole(inner));
        inner = '';
      } else inner += CLOSE;
      continue;
    }
    if (depth > 0) inner += text[i];
    else plain += text[i];
    i++;
  }
  if (depth > 0) out.push(hole(inner));
  if (plain) out.push({ text: plain, hole: null });
  return out;
}

function hole(raw: string): ClozePart {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === OPEN) depth++;
    else if (raw[i] === CLOSE) depth--;
    else if (depth === 0 && raw.startsWith('::', i)) cut = i;
  }
  const clean = (s: string) => s.replaceAll(OPEN, '').replaceAll(CLOSE, '');
  return cut < 0
    ? { text: clean(raw), hole: { hint: null } }
    : { text: clean(raw.slice(0, cut)), hole: { hint: clean(raw.slice(cut + 2)) || null } };
}

export function practiceCards(lectures: readonly Lecture[], state: StateFilter): CardRef[] {
  const cards: { ref: CardRef }[] = [];
  for (const l of lectures) {
    for (const g of l.groups) {
      for (const m of g.items) {
        for (const c of m.cards) {
          if (c.status === 'hidden' && state !== 'hidden') continue;
          cards.push({ ref: { noteGuid: c.noteGuid, ord: c.ord, deckId: c.deckId } });
        }
      }
    }
  }
  return apartSiblings(cards).map((c) => c.ref);
}

export const cardCount = (matched: readonly Matched[]) =>
  matched.reduce((t, m) => t + m.cards.length, 0);
