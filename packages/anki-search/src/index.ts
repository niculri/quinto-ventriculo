/**
 * @qv/anki-search — Anki's search syntax (25.9) over cards in memory: `parseSearch` builds the tree (or
 * throws a SearchError with a message in Spanish), `compileSearch` turns it into a predicate once, and
 * `searchTerm` writes sidebar terms the way Anki does. See README.md for what differs from Anki.
 */
export { SearchError } from './errors';
export type { SearchErrorKind } from './errors';
export type { CardStateFilter, CompareOp, PropKind, SearchNode } from './ast';
export type {
  SearchAnswer,
  SearchCard,
  SearchContext,
  SearchDeck,
  SearchNoteType,
  SearchTiming,
} from './types';
export { parseSearch } from './parser';
export { compileSearch, searchNeeds } from './compile';
export { searchTerm } from './term';
