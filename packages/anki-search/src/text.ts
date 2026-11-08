// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * Text helpers ported from Anki's rslib (text.rs, search/parser.rs, storage/sqlite.rs): Anki's wildcard
 * text («foo*bar», «a_b», «\*»), SQLite LIKE, combining-mark stripping, Unicode case folding, f32 rounding
 * and a translator from Rust regular expressions to JavaScript ones.
 */
import { errors } from './errors';

// ---------------------------------------------------------------------------------------------------------
// The parser's escapes (parser.rs: unescape, invalid_escape_sequence, is_parser_escape, unescape_quotes)

const INVALID_ESCAPE = /(?:^|[^\\])(?:\\\\)*(\\(?:[^\\":*_()-]|$))/u;
const PARSER_ESCAPE = /(?:^|[^\\])(?:\\\\)*\\[":()-]/u;

/** Unescape the characters with a meaning for the parser (`\" \: \( \) \-`), keeping `\\ \* \_`. */
export function unescape(txt: string): string {
  const invalid = INVALID_ESCAPE.exec(txt);
  if (invalid) throw errors.unknownEscape(invalid[1]!);
  if (!PARSER_ESCAPE.test(txt)) return txt;
  return txt.replace(/\\[\\":()-]/g, (m) => (m === '\\\\' ? m : m[1]!));
}

/** For strings without unescaped `"`: `\"` → `"` (regular expressions keep everything else raw). */
export function unescapeQuotes(s: string): string {
  return s.includes('"') ? s.replaceAll('\\"', '"') : s;
}

// ---------------------------------------------------------------------------------------------------------
// Anki's wildcard text (text.rs: is_glob, to_re, to_custom_re, to_sql, to_text, escape_anki_wildcards)

const GLOB = /(?:^|[^\\])(?:\\\\)*[*_]/u;

/** Whether the text has an unescaped `*` or `_`. */
export function isGlob(txt: string): boolean {
  return GLOB.test(txt);
}

/** Escape a string for a JavaScript regular expression with the `u` flag. */
export function escapeRegex(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
}

/** Rust's `.` (any character but \n). */
export const ANY_BUT_NEWLINE = '[^\\n]';

/**
 * Anki text → JavaScript regular expression source (`*` → `wildcard*`, `_` → `wildcard`, the rest
 * literal). Like Anki's `to_custom_re`, a newline is never a token, so it stays a literal newline.
 */
export function toRe(txt: string, wildcard = ANY_BUT_NEWLINE): string {
  return txt.replace(/\\?[^\n]/gu, (tok) => {
    switch (tok) {
      case '\\\\':
      case '\\*':
        return tok;
      case '\\_':
        return '_';
      case '*':
        return `${wildcard}*`;
      case '_':
        return wildcard;
      default:
        return escapeRegex(tok);
    }
  });
}

/** Anki text → SQL LIKE pattern with `\` as the escape character. */
export function toSql(txt: string): string {
  return txt.replace(/\\[\\*]|[*%]/g, (m) => {
    switch (m) {
      case '\\\\':
        return '\\\\';
      case '\\*':
        return '*';
      case '*':
        return '%';
      default:
        return '\\%';
    }
  });
}

/** Unescape everything (`\x` → `x`). */
export function toText(txt: string): string {
  return txt.replace(/\\([^\n])/gu, '$1');
}

/** Escape `\`, `*` and `_` so that the text matches literally. */
export function escapeAnkiWildcards(txt: string): string {
  return txt.replace(/[\\*_]/g, '\\$&');
}

// ---------------------------------------------------------------------------------------------------------
// SQLite LIKE (case-insensitive only for ASCII letters, `%` any run, `_` one character, `\` escapes)

/** Lowercase ASCII letters only, like SQLite's LIKE folds case. */
export function asciiLower(s: string): string {
  return /[A-Z]/.test(s) ? s.replace(/[A-Z]+/g, (m) => m.toLowerCase()) : s;
}

export type TextMatcher = (text: string) => boolean;

const never: TextMatcher = () => false;

/**
 * A LIKE pattern → matcher over text that is already ASCII-lowercased (see `asciiLower`). Compiled once:
 * plain substrings use `includes`, the rest one regular expression.
 */
export function likeMatcher(pattern: string): TextMatcher {
  type Piece = { any: true } | { one: true } | { lit: string };
  const pieces: Piece[] = [];
  const chars = Array.from(pattern);
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (c === '\\') {
      const next = chars[++i];
      // SQLite: an escape character at the end of the pattern never matches.
      if (next === undefined) return never;
      pieces.push({ lit: asciiLower(next) });
    } else if (c === '%') pieces.push({ any: true });
    else if (c === '_') pieces.push({ one: true });
    else pieces.push({ lit: asciiLower(c) });
  }
  let start = 0;
  let end = pieces.length;
  while (start < end && 'any' in pieces[start]!) start++;
  while (end > start && 'any' in pieces[end - 1]!) end--;
  const anchoredStart = start === 0;
  const anchoredEnd = end === pieces.length;
  const body = pieces.slice(start, end);
  if (body.length === 0) {
    // '' matches only ''; '%…%' matches anything.
    return anchoredStart && anchoredEnd ? (t) => t === '' : () => true;
  }
  if (body.every((p) => 'lit' in p)) {
    const lit = body.map((p) => (p as { lit: string }).lit).join('');
    if (anchoredStart && anchoredEnd) return (t) => t === lit;
    if (anchoredStart) return (t) => t.startsWith(lit);
    if (anchoredEnd) return (t) => t.endsWith(lit);
    return (t) => t.includes(lit);
  }
  const source = body
    .map((p) => ('any' in p ? '[^]*' : 'one' in p ? '[^]' : escapeRegex(p.lit)))
    .join('');
  const re = new RegExp(`${anchoredStart ? '^' : ''}${source}${anchoredEnd ? '$' : ''}`, 'u');
  return (t) => re.test(t);
}

// ---------------------------------------------------------------------------------------------------------
// Accents, case folding and clozes

const EXTRA_NO_COMBINING: Record<string, string> = {
  '€': 'E',
  Æ: 'AE',
  Ð: 'D',
  Ø: 'O',
  Þ: 'TH',
  ß: 's',
  æ: 'ae',
  ð: 'd',
  ø: 'o',
  þ: 'th',
  Đ: 'D',
  đ: 'd',
  Ħ: 'H',
  ħ: 'h',
  ı: 'i',
  ĸ: 'k',
  Ł: 'L',
  ł: 'l',
  Ŋ: 'N',
  ŋ: 'n',
  Œ: 'OE',
  œ: 'oe',
  Ŧ: 'T',
  ŧ: 't',
  Ə: 'E',
  ǝ: 'e',
  ɑ: 'a',
};
const EXTRA_NO_COMBINING_RE = new RegExp(`[${Object.keys(EXTRA_NO_COMBINING).join('')}]`, 'gu');

/** Anki's `without_combining`: NFKD, drop the combining marks and replace a few letters (ß → s…). */
export function withoutCombining(s: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7f]*$/.test(s)) return s;
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(EXTRA_NO_COMBINING_RE, (c) => EXTRA_NO_COMBINING[c]!);
}

/** Unicode case folding for comparisons (SQLite's `unicase` collation, `unicase::eq`). */
export function foldCase(s: string): string {
  return s.toUpperCase().toLowerCase();
}

const CLOZE = /\{\{c\p{Nd}+::([^]*?)(?:::[^]*?)?\}\}/gu;

/** Anki's `strip_clozes`: `{{c1::text::hint}}` → `text`. */
export function stripClozes(s: string): string {
  return s.includes('{{') ? s.replace(CLOZE, '$1') : s;
}

/** Rust's `char::is_whitespace` (Unicode White_Space), used by `str::trim`. */
export function trimUnicode(s: string): string {
  return s.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '');
}

// ---------------------------------------------------------------------------------------------------------
// Numbers parsed and printed like Rust

const UNSIGNED = /^\+?[0-9]+$/;
const SIGNED = /^[+-]?[0-9]+$/;
const FLOAT = /^[+-]?(?:inf|infinity|nan|(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)$/i;

/** `str::parse::<uN>()`: an optional `+`, digits, at most `max`. */
export function parseUnsigned(s: string, max: number): number | null {
  if (!UNSIGNED.test(s)) return null;
  const n = Number(s);
  return n <= max ? n : null;
}

/** `str::parse::<iN>()`. */
export function parseSigned(s: string, min: number, max: number): number | null {
  if (!SIGNED.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

/** `str::parse::<f32>()`, already rounded to f32. */
export function parseF32(s: string): number | null {
  if (!FLOAT.test(s)) return null;
  const lower = s.toLowerCase().replace(/^\+/, '');
  if (lower.endsWith('nan')) return NaN;
  if (lower.endsWith('inf') || lower.endsWith('infinity')) {
    return lower.startsWith('-') ? -Infinity : Infinity;
  }
  return Math.fround(Number(s));
}

/**
 * The f64 that SQLite reads from Rust's `Display` of an f32 (the shortest decimal that rounds back to the
 * same f32): Anki writes `prop:s>…` values into the SQL that way.
 */
export function f32AsWritten(x: number): number {
  const f = Math.fround(x);
  if (!Number.isFinite(f) || f === 0) return f;
  for (let p = 1; p <= 9; p++) {
    const n = Number(f.toPrecision(p));
    if (Math.fround(n) === f) return n;
  }
  return f;
}

/** `i64 as u32` (wraps). */
export function asU32(n: number): number {
  return ((n % 4294967296) + 4294967296) % 4294967296;
}

// ---------------------------------------------------------------------------------------------------------
// Rust regular expressions → JavaScript

/** Rust's Unicode `\w`. */
const WORD = '\\p{Alphabetic}\\p{M}\\p{Nd}\\p{Pc}\\p{Join_Control}';
const WORD_BOUNDARY = `(?:(?<=[${WORD}])(?![${WORD}])|(?<![${WORD}])(?=[${WORD}]))`;
const NOT_WORD_BOUNDARY = `(?:(?<=[${WORD}])(?=[${WORD}])|(?<![${WORD}])(?![${WORD}]))`;
export { WORD_BOUNDARY };

const POSIX: Record<string, string> = {
  alnum: '0-9A-Za-z',
  alpha: 'A-Za-z',
  ascii: '\\x00-\\x7F',
  blank: '\\t ',
  cntrl: '\\x00-\\x1F\\x7F',
  digit: '0-9',
  graph: '!-~',
  lower: 'a-z',
  print: ' -~',
  punct: '!-\\/:-@\\[-`{-~',
  space: '\\t\\n\\v\\f\\r ',
  upper: 'A-Z',
  word: '0-9A-Za-z_',
  xdigit: '0-9A-Fa-f',
};

const SYNTAX_CHARS = '^$\\.*+?()[]{}|/';

function unicodeProperty(name: string): string {
  for (const candidate of [name, `Script=${name}`]) {
    try {
      new RegExp(`\\p{${candidate}}`, 'u');
      return candidate;
    } catch {
      // try the next form
    }
  }
  throw new Error(`propiedad Unicode desconocida: ${name}`);
}

/** One escape sequence at `i` (which is a backslash). Returns the JavaScript text and its length. */
function translateEscape(src: string, i: number, inClass: boolean): [string, number] {
  const c = src[i + 1];
  if (c === undefined) throw new Error('barra invertida al final');
  switch (c) {
    case 'd':
      return ['\\p{Nd}', 2];
    case 'D':
      return ['\\P{Nd}', 2];
    case 's':
      return ['\\p{White_Space}', 2];
    case 'S':
      return ['\\P{White_Space}', 2];
    case 'w':
      return [inClass ? WORD : `[${WORD}]`, 2];
    case 'W':
      if (inClass) throw new Error('\\W dentro de una clase');
      return [`[^${WORD}]`, 2];
    case 'b':
      if (inClass) throw new Error('\\b dentro de una clase');
      return [WORD_BOUNDARY, 2];
    case 'B':
      if (inClass) throw new Error('\\B dentro de una clase');
      return [NOT_WORD_BOUNDARY, 2];
    case 'A':
      return ['(?<![^])', 2];
    case 'z':
      return ['(?![^])', 2];
    case 'n':
    case 't':
    case 'r':
    case 'f':
    case 'v':
      return [`\\${c}`, 2];
    case 'a':
      return ['\\x07', 2];
    case 'e':
      return ['\\x1B', 2];
    case 'p':
    case 'P': {
      if (src[i + 2] === '{') {
        const close = src.indexOf('}', i + 3);
        if (close < 0) throw new Error('\\p sin cerrar');
        const name = src.slice(i + 3, close).replace(/\s+/g, '');
        return [`\\${c}{${unicodeProperty(name)}}`, close - i + 1];
      }
      const letter = src[i + 2];
      if (letter === undefined) throw new Error('\\p incompleto');
      return [`\\${c}{${unicodeProperty(letter)}}`, 3];
    }
    case 'x':
    case 'u':
    case 'U': {
      if (src[i + 2] === '{') {
        const close = src.indexOf('}', i + 3);
        if (close < 0) throw new Error('escape hexadecimal sin cerrar');
        const hex = src.slice(i + 3, close);
        if (!/^[0-9a-fA-F]{1,8}$/.test(hex)) throw new Error('escape hexadecimal no válido');
        return [`\\u{${hex}}`, close - i + 1];
      }
      const len = c === 'x' ? 2 : c === 'u' ? 4 : 8;
      const hex = src.slice(i + 2, i + 2 + len);
      if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(hex)) {
        throw new Error('escape hexadecimal no válido');
      }
      return [`\\u{${hex}}`, 2 + len];
    }
    default: {
      if (/[0-9A-Za-z]/.test(c)) throw new Error(`escape \\${c} no admitido`);
      const cp = src.codePointAt(i + 1)!;
      const ch = String.fromCodePoint(cp);
      if (SYNTAX_CHARS.includes(ch) || (inClass && ch === '-')) return [`\\${ch}`, 1 + ch.length];
      return [ch, 1 + ch.length];
    }
  }
}

/** A character class at `i` (which is `[`). */
function translateClass(src: string, i: number): [string, number] {
  let out = '[';
  let j = i + 1;
  if (src[j] === '^') {
    out += '^';
    j++;
  }
  let first = true;
  while (j < src.length) {
    const c = src[j]!;
    if (c === ']' && !first) return [`${out}]`, j - i + 1];
    first = false;
    if (c === '\\') {
      const [piece, len] = translateEscape(src, j, true);
      out += piece;
      j += len;
    } else if (c === '[') {
      const posix = /^\[:(\^?)([a-z]+):\]/.exec(src.slice(j));
      if (!posix || POSIX[posix[2]!] === undefined) throw new Error('clases anidadas no admitidas');
      if (posix[1]) throw new Error('clases POSIX negadas no admitidas');
      out += POSIX[posix[2]!];
      j += posix[0].length;
    } else if (
      (c === '&' && src[j + 1] === '&') ||
      (c === '~' && src[j + 1] === '~') ||
      (c === '-' && src[j + 1] === '-')
    ) {
      throw new Error('operaciones entre clases no admitidas');
    } else if (c === ']') {
      out += '\\]';
      j++;
    } else if (c === '/' || c === '(' || c === ')' || c === '{' || c === '}' || c === '|') {
      out += `\\${c}`;
      j++;
    } else {
      const cp = src.codePointAt(j)!;
      const ch = String.fromCodePoint(cp);
      out += ch;
      j += ch.length;
    }
  }
  throw new Error('clase sin cerrar');
}

interface Flags {
  i: boolean;
  m: boolean;
  s: boolean;
}

function parseFlags(spec: string, base: Flags): Flags {
  const next = { ...base };
  let on = true;
  for (const f of spec) {
    if (f === '-') on = false;
    else if (f === 'i' || f === 'm' || f === 's') next[f] = on;
    else if (f === 'u' && on) continue;
    else throw new Error(`la opción (?${f}) no está admitida`);
  }
  return next;
}

function modifierSpec(from: Flags, to: Flags): string {
  let on = '';
  let off = '';
  for (const f of ['i', 'm'] as const) {
    if (to[f] && !from[f]) on += f;
    if (!to[f] && from[f]) off += f;
  }
  return off ? `${on}-${off}` : on;
}

/**
 * Translate a Rust regular expression (the `regex` crate, as Anki uses it) into a JavaScript one with the
 * same meaning for the common syntax: Unicode `\w \d \s \b`, `.` without `\n`, inline flags `(?i)`,
 * `(?s)`, `(?m)` (also in the middle, through JavaScript's modifier groups), `(?P<name>…)`, POSIX classes
 * and `\x{…}`. Throws a SearchError if the expression is invalid or uses something not supported.
 */
export function rustRegex(pattern: string, shownAs = pattern): RegExp {
  try {
    let flags: Flags = { i: false, m: false, s: false };
    let base: Flags | null = null;
    let out = '';
    let i = 0;
    // Inline flags in the middle of a group become modifier groups that last until the group ends; an
    // alternation `|` closes and reopens them, because in Rust they reach every later alternative.
    const stack: { flags: Flags; pending: string[] }[] = [];
    let pending: string[] = [];
    while (i < pattern.length) {
      const c = pattern[i]!;
      if (c === '\\') {
        const [piece, len] = translateEscape(pattern, i, false);
        out += piece;
        i += len;
      } else if (c === '[') {
        const [piece, len] = translateClass(pattern, i);
        out += piece;
        i += len;
      } else if (c === '(') {
        const flagGroup = /^\(\?([a-zA-Z-]*)([:)])/.exec(pattern.slice(i));
        if (flagGroup) {
          const next = parseFlags(flagGroup[1]!, flags);
          if (flagGroup[2] === ')') {
            if (out === '' && stack.length === 0) {
              base = next;
            } else {
              const spec = modifierSpec(flags, next);
              if (spec) {
                out += `(?${spec}:`;
                pending.push(spec);
              }
            }
            flags = next;
          } else {
            const spec = modifierSpec(flags, next);
            out += spec ? `(?${spec}:` : '(?:';
            stack.push({ flags, pending });
            pending = [];
            flags = next;
          }
          i += flagGroup[0].length;
        } else {
          if (pattern.startsWith('(?P<', i)) {
            out += '(?<';
            i += 4;
          } else if (pattern.startsWith('(?<', i) && !/^\(\?<[=!]/.test(pattern.slice(i))) {
            out += '(?<';
            i += 3;
          } else if (pattern.startsWith('(?', i)) {
            throw new Error('grupo no admitido');
          } else {
            out += '(';
            i++;
          }
          stack.push({ flags, pending });
          pending = [];
        }
      } else if (c === ')') {
        out += ')'.repeat(pending.length);
        const top = stack.pop();
        if (!top) throw new Error('paréntesis sin abrir');
        flags = top.flags;
        pending = top.pending;
        out += ')';
        i++;
      } else if (c === '|') {
        out += `${')'.repeat(pending.length)}|${pending.map((spec) => `(?${spec}:`).join('')}`;
        i++;
      } else if (c === '.') {
        out += flags.s ? '[^]' : ANY_BUT_NEWLINE;
        i++;
      } else {
        const cp = pattern.codePointAt(i)!;
        const ch = String.fromCodePoint(cp);
        out += ch === '/' ? '\\/' : ch;
        i += ch.length;
      }
    }
    if (stack.length > 0) throw new Error('paréntesis sin cerrar');
    out += ')'.repeat(pending.length);
    const top = base ?? { i: false, m: false, s: false };
    return new RegExp(out, `u${top.i ? 'i' : ''}${top.m ? 'm' : ''}`);
  } catch (e) {
    throw errors.invalidRegex(shownAs, e instanceof Error ? e.message : undefined);
  }
}
