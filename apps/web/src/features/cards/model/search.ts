// Anki's search over the cards: reading the text, the context it is matched in, and how the sidebar adds a term.

import { SearchError, compileSearch, parseSearch } from '@qv/anki-search';
import type { SearchContext, SearchNode } from '@qv/anki-search';
import type { SchedTiming } from '@qv/srs';
import type { NoteTypeSummary } from '@qv/schema';
import type { RatedAnswer } from '@qv/schema/user';
import { cardKey } from '@qv/study';
import type { BrowseCard } from './browseCards';

export function parseQuery(query: string): { node: SearchNode | null; error: string | null } {
  try {
    return { node: parseSearch(query), error: null };
  } catch (e) {
    return { node: null, error: e instanceof SearchError ? e.message : String(e) };
  }
}

export function searchContext(
  decks: readonly { id: string; name: string }[],
  noteTypes: readonly NoteTypeSummary[],
  timing: SchedTiming,
  learnAheadMinutes: number,
  rated: readonly RatedAnswer[] | undefined,
  introduced: readonly { noteGuid: string; ord: number; at: string }[] | undefined,
): SearchContext {
  return {
    decks: decks.map((n) => ({ id: n.id, name: n.name })),
    noteTypes: noteTypes.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      fields: t.fields,
      templates: t.templates,
    })),
    timing,
    learnAheadSecs: learnAheadMinutes * 60,
    // «vertebra» finds «vértebra» (Anki's «Ignore accents in search», on here).
    ignoreAccents: true,
    answers: (rated ?? []).map((a) => ({
      noteGuid: a.noteGuid,
      ord: a.ord,
      rating: a.rating,
      atMs: Date.parse(a.reviewedAt),
    })),
    firstAnswerMs: new Map((introduced ?? []).map((a) => [cardKey(a), Date.parse(a.at)] as const)),
  };
}

/** The cards a search finds, or the error of a search that only fails against these cards. */
export function matchCards(
  node: SearchNode,
  ctx: SearchContext,
  cards: readonly BrowseCard[],
): BrowseCard[] | SearchError {
  let match: (c: BrowseCard) => boolean;
  try {
    match = compileSearch(node, ctx);
  } catch (e) {
    return e instanceof SearchError ? e : [];
  }
  return cards.filter(match);
}

// As in Anki, a click replaces the search; with Ctrl/⌘ it adds the term («y»), with Mayús it is an alternative
// («o»), with Alt it negates it.
export type Combine = 'replace' | 'and' | 'or';

export function combineSearch(current: string, term: string, how: Combine, negate: boolean) {
  const t = negate ? `-${term}` : term;
  const base = current.trim();
  if (how === 'replace' || !base) return t;
  return how === 'and' ? `(${base}) ${t}` : `(${base}) OR ${t}`;
}
