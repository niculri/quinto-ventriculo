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
  /** The empty search: every card. */
  | { type: 'all' }
  | { type: 'and'; nodes: SearchNode[] }
  | { type: 'or'; nodes: SearchNode[] }
  | { type: 'not'; node: SearchNode }
  /** Loose text: a substring of the note's fields (`*`, `_` wildcards; ASCII-only case folding). */
  | { type: 'text'; text: string }
  /** `nc:` loose text ignoring combining marks (accents). */
  | { type: 'noCombining'; text: string }
  /** `sc:` loose text in cloze notes, with the cloze markup removed. */
  | { type: 'stripClozes'; text: string }
  /** `w:` a whole word. */
  | { type: 'wordBoundary'; text: string }
  /** `re:` a regular expression (Rust syntax, raw) over the fields joined with \x1f. */
  | { type: 'regex'; pattern: string }
  /**
   * `field:value`. `mode` normal: the whole field, `value` in text form; regex: `value` is a raw regular
   * expression; noCombining: `value` is raw (only `\"` unescaped), as Anki keeps it.
   */
  | { type: 'field'; field: string; value: string; mode: 'normal' | 'regex' | 'noCombining' }
  | { type: 'deck'; name: string }
  | { type: 'tag'; tag: string; regex: boolean }
  | { type: 'noteType'; name: string }
  | { type: 'cardOrd'; ord: number }
  | { type: 'cardName'; name: string }
  | { type: 'state'; state: CardStateFilter }
  | { type: 'flag'; flag: number }
  /** `value` is the number as typed (for s, d and r, already rounded like Anki rounds it). */
  | { type: 'prop'; prop: PropKind; op: CompareOp; value: number }
  | { type: 'rated'; days: number; rating: 1 | 2 | 3 | 4 | null }
  | { type: 'introduced'; days: number }
  | { type: 'added'; days: number };
