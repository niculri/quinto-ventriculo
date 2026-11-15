// The cards' searches: Anki's (the text, the context it is matched in, a term the sidebar adds), the simple mode's
// plain text, and a code that finds its note.

import { SearchError, compileSearch, parseSearch } from '@qv/anki-search';
import type { SearchContext, SearchNode } from '@qv/anki-search';
import type { SchedTiming } from '@qv/srs';
import type { NoteTypeSummary } from '@qv/schema';
import type { RatedAnswer } from '@qv/schema/user';
import { cardKey } from '@qv/study';
import type { BrowseCard } from './browseCards';
import type { ExplorerNote } from './explorer';

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

/** The keys of the cards the page's search box finds, or the error of a search these cards cannot run. */
export function textKeys(
  node: SearchNode,
  ctx: SearchContext,
  cards: readonly BrowseCard[],
): { keys: Set<string>; error: string | null } {
  try {
    const match = compileSearch(node, ctx);
    return { keys: new Set(cards.filter(match).map((c) => c.key)), error: null };
  } catch (e) {
    return { keys: new Set<string>(), error: e instanceof SearchError ? e.message : String(e) };
  }
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
