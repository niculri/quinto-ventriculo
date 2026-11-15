// The cards page's filters without React: state, origin and kind, read from the URL, and the notes they leave with
// each option's count.

import type { CardOrigin } from '@qv/schema';
import { ORIGIN_TAGS } from '@qv/schema';
import type { ExplorerCard, ExplorerNote } from './explorer';
import { cardsStrings } from '../strings';

export type StateFilter = 'all' | 'new' | 'seen' | 'hard' | 'failed' | 'marked' | 'hidden';

export type KindFilter = 'all' | 'text' | 'image';

export const STATE_FILTERS: { value: StateFilter; label: string }[] = [
  { value: 'all', label: cardsStrings.filters.states.all },
  { value: 'new', label: cardsStrings.filters.states.new },
  { value: 'seen', label: cardsStrings.filters.states.seen },
  { value: 'hard', label: cardsStrings.filters.states.hard },
  { value: 'failed', label: cardsStrings.filters.states.failed },
  { value: 'marked', label: cardsStrings.filters.states.marked },
  { value: 'hidden', label: cardsStrings.filters.states.hidden },
];

export const ORIGIN_FILTERS: { value: CardOrigin; label: string }[] = [
  { value: 'profe', label: cardsStrings.filters.origins.profe },
  { value: 'control', label: cardsStrings.filters.origins.control },
  { value: 'clinica', label: cardsStrings.filters.origins.clinica },
  { value: 'complemento', label: cardsStrings.filters.origins.complemento },
];

export const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: cardsStrings.filters.kinds.all },
  { value: 'text', label: cardsStrings.filters.kinds.text },
  { value: 'image', label: cardsStrings.filters.kinds.image },
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

const STATES = STATE_FILTERS.map((s) => s.value);

const zero = <K extends string>(keys: readonly { value: K }[]) =>
  Object.fromEntries(keys.map((k) => [k.value, 0])) as Record<K, number>;

const inView = (c: ExplorerCard, f: Filters) =>
  (!f.unitDecks || f.unitDecks.has(c.deckId)) &&
  (!f.text || f.text.has(c.key)) &&
  (!f.day || f.day.has(c.key));

/** The cards of a note left by the filters other than the state; `hits` gets every state some of them has. */
function cardsInView(n: ExplorerNote, f: Filters, hits: Set<StateFilter>): ExplorerCard[] {
  const mine: ExplorerCard[] = [];
  for (const c of n.cards) {
    if (!inView(c, f)) continue;
    for (const s of STATES) if (!hits.has(s) && stateMatches(c, s, f.failed)) hits.add(s);
    if (stateMatches(c, f.state, f.failed)) mine.push(c);
  }
  return mine;
}

/** Each option counts the notes it would leave with the other filters as they are. */
function count(
  facets: Facets,
  n: ExplorerNote,
  f: Filters,
  hits: Set<StateFilter>,
  kindOk: boolean,
  originOk: boolean,
) {
  if (kindOk && originOk) for (const s of hits) facets.state[s]++;
  if (!hits.has(f.state)) return;
  if (kindOk) for (const o of n.note.origin) facets.origin[o]++;
  if (originOk) {
    facets.kind.all++;
    facets.kind[n.image ? 'image' : 'text']++;
  }
}

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
  const hits = new Set<StateFilter>();
  for (const n of notes) {
    hits.clear();
    const mine = cardsInView(n, f, hits);
    if (!hits.size) continue;
    const kindOk = kindMatches(n, f.kind);
    const originOk = originMatches(n, f.origins);
    count(facets, n, f, hits, kindOk, originOk);
    if (mine.length && kindOk && originOk) matched.push({ note: n, cards: mine });
  }
  return { matched, facets };
}
