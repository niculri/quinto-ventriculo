// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * The parsed search. Text values keep Anki's own escaping after the parser's unescape step: `*` and `_` are
 * wildcards and `\*`, `\_` and `\\` are literals (Anki's «text» form), except where noted.
 */
export type CompareOp = '=' | '!=' | '<' | '>' | '<=' | '>=';

export type CardStateFilter = 'new' | 'learn' | 'review' | 'due' | 'buried' | 'suspended';

export type PropKind = 'due' | 'ivl' | 'reps' | 'lapses' | 's' | 'd' | 'r';

export type SearchNode =
  | { type: 'all' }
  | { type: 'and'; nodes: SearchNode[] }
  | { type: 'or'; nodes: SearchNode[] }
  | { type: 'not'; node: SearchNode }
  | { type: 'text'; text: string }
  /** `nc:` */
  | { type: 'noCombining'; text: string }
  /** `sc:` */
  | { type: 'stripClozes'; text: string }
  /** `w:` */
  | { type: 'wordBoundary'; text: string }
  /** `re:`, raw Rust syntax. */
  | { type: 'regex'; pattern: string }
  /** `value` is in text form in mode normal, raw in regex, and raw with only `\"` unescaped in noCombining. */
  | { type: 'field'; field: string; value: string; mode: 'normal' | 'regex' | 'noCombining' }
  | { type: 'deck'; name: string }
  | { type: 'tag'; tag: string; regex: boolean }
  | { type: 'noteType'; name: string }
  | { type: 'cardOrd'; ord: number }
  | { type: 'cardName'; name: string }
  | { type: 'state'; state: CardStateFilter }
  | { type: 'flag'; flag: number }
  /** For s, d and r, `value` is already rounded like Anki rounds it. */
  | { type: 'prop'; prop: PropKind; op: CompareOp; value: number }
  | { type: 'rated'; days: number; rating: 1 | 2 | 3 | 4 | null }
  | { type: 'introduced'; days: number }
  | { type: 'added'; days: number };
