import type { CardIndexNote, CardOrigin } from '@qv/schema';
import { ORIGIN_TAGS } from '@qv/schema';
import type { CardRef, StoredCard } from '../study/repository';
import { cardKey } from '../study/scheduler';
import { apartSiblings, isHard } from '../study/final-review';

/**
 * The cards page (plan step 3.3, ANK-9 to ANK-12), without React: what each card is for the student, the filters with
 * their counts, the groups of the list (by lecture, then by topic) and the cards of «Practicar estas».
 */

/** What a card is for the student: not seen yet, seen, one that costs them (`isHard()`), or under «No mostrar más». */
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

/** «Falladas hace poco»: an «Otra vez» in the last days. */
export const FAILED_DAYS = 7;

export const parseState = (v: string | null): StateFilter =>
  STATE_FILTERS.some((s) => s.value === v) ? (v as StateFilter) : 'all';
export const parseKind = (v: string | null): KindFilter =>
  v === 'text' || v === 'image' ? v : 'all';
export const parseOrigins = (v: string | null): CardOrigin[] => {
  const on = new Set((v ?? '').split(','));
  return ORIGIN_TAGS.filter((o) => on.has(o));
};

export function cardStatus(row: StoredCard | undefined): CardStatus {
  if (!row) return 'new';
  if (row.suspended) return 'hidden';
  if (row.phase === 'new') return 'new';
  return isHard(row) ? 'hard' : 'seen';
}

export interface ExplorerCard extends CardRef {
  key: string;
  status: CardStatus;
  /** With a mark («Marcar para revisar», or any flag of the full mode). */
  marked: boolean;
}

export interface ExplorerNote {
  note: CardIndexNote;
  assessmentId: string;
  /** Its lecture's deck (or the week's, the assessment's…): the deck of its first card, without «Extras». */
  lectureId: string;
  /** An occlusion or a photo: the list shows its thumbnail. */
  image: boolean;
  cards: ExplorerCard[];
  /** Its place in the scope: the order of the class (by code), assessment by assessment. */
  index: number;
}

/**
 * The notes of the scope with what each card is for the student. `indexes` in the order of the assessments;
 * `lectureOf` gives the deck a card's deck belongs to in the list («01 - Columna vertebral» for its Extras too).
 */
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
  /** The decks of the week or lecture chosen (null: the whole scope). */
  unitDecks: ReadonlySet<string> | null;
  /** The cards the text finds (null: no text). */
  text: ReadonlySet<string> | null;
  /** The cards of a day of the heatmap (null: no day). */
  day: ReadonlySet<string> | null;
  /** The cards with an «Otra vez» in the last FAILED_DAYS days. */
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

/** A note of the list and its cards that the filters find (at least one). */
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

/**
 * The notes the filters find, and how many each option of the filters would find with the others as they are
 * (notes, as the list counts them): one pass over the cards.
 */
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

/** A group of the list: a topic of a lecture, or its images; `title` null: the notes of the lecture without a topic. */
export interface Group {
  key: string;
  lectureId: string;
  title: string | null;
  /** Mostly photos: a grid of thumbnails. */
  grid: boolean;
  items: Matched[];
}

export interface Lecture {
  id: string;
  groups: Group[];
  notes: number;
}

/** The images of a lecture go in one group: their «Encabezado» is a title per figure, not a topic. */
export const IMAGES_TITLE = 'Imágenes';
/** «Si casi todo es foto»: from this share of photos, the group is a grid. */
const GRID_SHARE = 0.8;

/**
 * The list's groups, in the order of the class: lectures by their first note, and inside each lecture its topics
 * (and its images, together) by their first note. The text notes group by their «Tema»; the images of a lecture, all
 * in one group.
 */
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

/** The sizes of the list (px), by the screen's width. */
export interface ListMetrics {
  lecture: number;
  topic: number;
  row: number;
  /** A cell of the grid: its width is the list's divided by `columns`. */
  columns: number;
  cell: number;
}

export function listMetrics(width: number, wide: boolean): ListMetrics {
  const columns = Math.max(2, Math.floor(width / (wide ? 168 : 150)));
  const cellWidth = width / columns;
  return {
    lecture: 48,
    topic: 36,
    row: wide ? 76 : 100,
    columns,
    // The thumbnail (4:3) and a line for its name.
    cell: Math.round(cellWidth * 0.75) + 36,
  };
}

export type ListItem =
  | { kind: 'lecture'; key: string; lectureId: string; notes: number; top: number; height: number }
  | {
      kind: 'topic';
      key: string;
      lectureId: string;
      title: string;
      notes: number;
      top: number;
      height: number;
    }
  | { kind: 'row'; key: string; item: Matched; position: number; top: number; height: number }
  | { kind: 'cells'; key: string; items: Matched[]; position: number; top: number; height: number };

/**
 * The rows of the virtual list, each with its place: every height is known before anything is drawn, so nothing
 * moves when the rows come into view. `position` is the note's place among the notes of the list (the keyboard).
 */
export function listItems(lectures: readonly Lecture[], m: ListMetrics) {
  const items: ListItem[] = [];
  let top = 0;
  let position = 0;
  const push = (item: ListItem) => {
    items.push(item);
    top += item.height;
  };
  for (const l of lectures) {
    push({
      kind: 'lecture',
      key: `l:${l.id}`,
      lectureId: l.id,
      notes: l.notes,
      top,
      height: m.lecture,
    });
    for (const g of l.groups) {
      if (g.title !== null) {
        push({
          kind: 'topic',
          key: `t:${g.key}`,
          lectureId: l.id,
          title: g.title,
          notes: g.items.length,
          top,
          height: m.topic,
        });
      }
      if (g.grid) {
        for (let i = 0; i < g.items.length; i += m.columns) {
          const chunk = g.items.slice(i, i + m.columns);
          push({
            kind: 'cells',
            key: `c:${g.key}:${i}`,
            items: chunk,
            position,
            top,
            height: m.cell,
          });
          position += chunk.length;
        }
      } else {
        for (const item of g.items) {
          push({
            kind: 'row',
            key: `r:${item.note.note.guid}`,
            item,
            position,
            top,
            height: m.row,
          });
          position++;
        }
      }
    }
  }
  return { items, total: top };
}

/** The first item whose bottom is below `y` (binary search: the items are in order). */
export function itemAt(items: readonly ListItem[], y: number): number {
  let lo = 0;
  let hi = items.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const it = items[mid]!;
    if (it.top + it.height <= y) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo);
}

/** What the title fixed on top says at `y`: the lecture and the topic of the rows there. */
export function headingAt(
  items: readonly ListItem[],
  y: number,
): { lectureId: string; topic: string | null } | null {
  if (!items.length) return null;
  let lectureId: string | null = null;
  let topic: string | null = null;
  for (let i = itemAt(items, y); i >= 0; i--) {
    const it = items[i]!;
    if (it.kind === 'topic' && topic === null && lectureId === null) topic = it.title;
    if (it.kind === 'lecture') {
      lectureId = it.lectureId;
      break;
    }
  }
  return lectureId === null ? null : { lectureId, topic };
}

/** «T-BC-C2-10-094», «BC-C2-10-094.3»: a code pasted in the search box. */
const CODE = /^(?:t-)?([a-z0-9]+(?:-[a-z0-9]+){2,})(?:\.\d+)?$/i;

const bareCode = (code: string) => code.replace(/^t-/i, '').toUpperCase();

/** The note a code pasted in the search box is, if one of the scope has it. */
export function noteByCode(notes: readonly ExplorerNote[], text: string): ExplorerNote | null {
  const m = CODE.exec(text.trim());
  if (!m) return null;
  const wanted = m[1]!.toUpperCase();
  return notes.find((n) => n.note.code !== null && bareCode(n.note.code) === wanted) ?? null;
}

/**
 * The search box's text for @qv/anki-search: as it is in «Modo avanzado» (Anki's syntax); in the simple mode, every
 * word as plain text (no `tag:`, `-`, `*`, `_` or quotes with a meaning).
 */
export function searchQuery(text: string, syntax: boolean): string {
  const t = text.trim();
  if (syntax || !t) return t;
  return t
    .split(/\s+/)
    .map((w) => `"${w.replace(/[\\*_:"]/g, (c) => `\\${c}`)}"`)
    .join(' ');
}

/** Where an inner hole opens and closes, inside an outer one's text. */
const OPEN = '\u0001';
const CLOSE = '\u0002';

/** A part of a cloze's text: plain text, or a hole with its answer and hint. */
export type ClozePart =
  { text: string; hole: null } | { text: string; hole: { hint: string | null } };

/**
 * A cloze's row text (`{{c1::answer::hint}}`, nested or cut at the row's length) in parts: each outer hole is its
 * answer, without the markers of the holes inside it.
 */
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

/** A hole's text: its hint after the last «::» outside the holes inside it. */
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

/**
 * «Practicar estas»: the cards the list found, in its order, without two of a note in a row. Those under «No mostrar
 * más» only when the filter is «Ocultas».
 */
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

/** The matched cards, counted. */
export const cardCount = (matched: readonly Matched[]) =>
  matched.reduce((t, m) => t + m.cards.length, 0);
