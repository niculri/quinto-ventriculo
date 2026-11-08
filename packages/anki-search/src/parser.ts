// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * Anki's search parser (rslib/src/search/parser.rs, 25.9), ported combinator by combinator so that the same
 * strings parse, fail and nest the same way. Anki keeps a flat list `a AND b OR c` and leaves the precedence
 * to SQL (AND before OR); here it becomes an `or` of `and`s.
 */
import type { CardStateFilter, CompareOp, PropKind, SearchNode } from './ast';
import { SearchError, errors } from './errors';
import {
  f32AsWritten,
  parseF32,
  parseSigned,
  parseUnsigned,
  rustRegex,
  trimUnicode,
  unescape,
  unescapeQuotes,
} from './text';

const U32_MAX = 4294967295;
const I32_MIN = -2147483648;
const I32_MAX = 2147483647;

/** A recoverable failure (nom's `Err::Error`): the caller tries something else. Failures throw. */
const NO = null;
type Result<T> = { rest: number; value: T } | typeof NO;

/** The flat list Anki builds: nodes with explicit or implicit AND/OR between them. */
type RawNode = 'and' | 'or' | { not: RawNode } | { group: RawNode[] } | SearchNode;

const ESCAPE_ERROR = -1;
const NONE_OF_ERROR = -2;

function isSpace(c: string | undefined): boolean {
  return c === ' ' || c === '\u3000';
}

function charLen(s: string, i: number): number {
  const code = s.charCodeAt(i);
  return code >= 0xd800 && code <= 0xdbff && i + 1 < s.length ? 2 : 1;
}

/**
 * nom's `escaped(is_not(stop), '\\', escapable)` from `start`: the end of the run, or ESCAPE_ERROR (nothing
 * to read, or a backslash at the end) or NONE_OF_ERROR (a backslash before a character `escapable` rejects).
 */
function escapedRun(
  s: string,
  start: number,
  stop: string,
  escapable: (c: string) => boolean,
): number {
  let i = start;
  while (i < s.length) {
    let j = i;
    while (j < s.length && !stop.includes(s[j]!)) j += charLen(s, j);
    if (j > i) {
      i = j;
      continue;
    }
    if (s[i] === '\\') {
      if (i + 1 >= s.length) return ESCAPE_ERROR;
      if (!escapable(s[i + 1]!)) return NONE_OF_ERROR;
      i += 1 + charLen(s, i + 1);
      continue;
    }
    return i === start ? ESCAPE_ERROR : i;
  }
  return i;
}

const notSpace = (c: string) => !isSpace(c);
const anyChar = () => true;

function skipSpaces(s: string, i: number): number {
  while (isSpace(s[i])) i++;
  return i;
}

/** Parse a search into its tree. An empty search (or only spaces) is every card. */
export function parseSearch(query: string): SearchNode {
  const input = trimUnicode(query.normalize('NFC'));
  if (input === '') return { type: 'all' };
  const { rest, nodes } = groupInner(input, 0);
  if (rest !== input.length) throw errors.unopenedGroup();
  return toTree(nodes);
}

function groupInner(s: string, start: number): { rest: number; nodes: RawNode[] } {
  let rest = start;
  const nodes: RawNode[] = [];
  for (;;) {
    const r = node(s, rest);
    if (r === NO) break;
    rest = r.rest;
    const n = r.value;
    if (nodes.length % 2 === 0) {
      if (n === 'and') throw errors.misplacedAnd();
      if (n === 'or') throw errors.misplacedOr();
    } else if (n !== 'and' && n !== 'or') {
      nodes.push('and');
    }
    nodes.push(n);
  }
  const last = nodes.at(-1);
  if (last === 'and') throw errors.misplacedAnd();
  if (last === 'or') throw errors.misplacedOr();
  return { rest: skipSpaces(s, rest), nodes };
}

function node(s: string, start: number): Result<RawNode> {
  const i = skipSpaces(s, start);
  return negatedNode(s, i) ?? group(s, i) ?? text(s, i);
}

function negatedNode(s: string, i: number): Result<RawNode> {
  if (s[i] !== '-') return NO;
  const r = group(s, i + 1) ?? text(s, i + 1);
  return r === NO ? NO : { rest: r.rest, value: { not: r.value } };
}

function group(s: string, i: number): Result<RawNode> {
  if (s[i] !== '(') return NO;
  const { rest, nodes } = groupInner(s, i + 1);
  if (s[rest] !== ')') throw errors.unclosedGroup();
  if (nodes.length === 0) throw errors.emptyGroup();
  return { rest: rest + 1, value: { group: nodes } };
}

function text(s: string, i: number): Result<RawNode> {
  return quotedTerm(s, i) ?? partiallyQuotedTerm(s, i) ?? unquotedTerm(s, i);
}

/** `"…"`: the inside (still escaped) and where it ends. */
function quotedTermStr(s: string, i: number): Result<string> {
  if (s[i] !== '"') return NO;
  const opened = i + 1;
  const end = escapedRun(s, opened, '"\\', anyChar);
  if (end >= 0) {
    if (s[end] === '"') return { rest: end + 1, value: s.slice(opened, end) };
    throw errors.unclosedQuote();
  }
  throw s[opened] === '"' ? errors.emptyQuote() : errors.unclosedQuote();
}

function quotedTerm(s: string, i: number): Result<RawNode> {
  const r = quotedTermStr(s, i);
  return r === NO ? NO : { rest: r.rest, value: searchNodeForText(r.value) };
}

/** `deck:"foo bar"`: the quotes come after the colon. */
function partiallyQuotedTerm(s: string, i: number): Result<RawNode> {
  const keyEnd = escapedRun(s, i, '"(): \u3000\\', notSpace);
  if (keyEnd < 0 || s[keyEnd] !== ':') return NO;
  const val = quotedTermStr(s, keyEnd + 1);
  if (val === NO) return NO;
  return { rest: val.rest, value: searchNodeWithArgument(s.slice(i, keyEnd), val.value) };
}

/** Text up to a space or an unescaped `"`, `(` or `)`; `and` and `or` are operators. */
function unquotedTerm(s: string, i: number): Result<RawNode> {
  const end = escapedRun(s, i, '"() \u3000\\', notSpace);
  if (end === NONE_OF_ERROR) {
    const at = s.indexOf('\\', i);
    throw errors.unknownEscape(`\\${s.slice(at + 1, at + 2)}`);
  }
  if (end === ESCAPE_ERROR) {
    if ('"() \u3000'.includes(s[i]!)) return NO;
    throw errors.unknownEscape('\\');
  }
  const term = s.slice(i, end);
  if (term === '') return NO;
  const lower = asciiLowerKey(term);
  if (lower === 'and') return { rest: end, value: 'and' };
  if (lower === 'or') return { rest: end, value: 'or' };
  return { rest: end, value: searchNodeForText(term) };
}

/** Text with or without a `key:`. */
function searchNodeForText(t: string): SearchNode {
  const end = escapedRun(t, 0, ':\\', anyChar);
  if (end <= 0) throw errors.missingKey();
  if (end === t.length) return { type: 'text', text: unescape(t) };
  return searchNodeWithArgument(t.slice(0, end), t.slice(end + 1));
}

function asciiLowerKey(key: string): string {
  return key.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

function searchNodeWithArgument(key: string, val: string): SearchNode {
  switch (asciiLowerKey(key)) {
    case 'deck': {
      const name = unescape(val);
      // No «current deck» here.
      if (name === 'current') throw errors.unsupported('deck:current');
      return { type: 'deck', name };
    }
    case 'note':
      return { type: 'noteType', name: unescape(val) };
    case 'tag':
      return val.startsWith('re:')
        ? { type: 'tag', tag: checkedRegex(unescapeQuotes(val.slice(3))), regex: true }
        : { type: 'tag', tag: unescape(val), regex: false };
    case 'card': {
      const ord = parseUnsigned(val, 65535);
      return ord === null
        ? { type: 'cardName', name: unescape(val) }
        : { type: 'cardOrd', ord: Math.max(ord, 1) - 1 };
    }
    case 'flag': {
      const flag = parseUnsigned(val, 255);
      if (flag === null || flag > 7) throw errors.invalidFlag();
      return { type: 'flag', flag };
    }
    case 'prop':
      return parseProp(val);
    case 'added':
      return { type: 'added', days: Math.max(u32(val, 'added:'), 1) };
    case 'introduced':
      return { type: 'introduced', days: Math.max(u32(val, 'introduced:'), 1) };
    case 'rated':
      return parseRated(val);
    case 'is':
      return { type: 'state', state: parseState(val) };
    case 're':
      return { type: 'regex', pattern: checkedRegex(unescapeQuotes(val)) };
    case 'nc':
      return { type: 'noCombining', text: unescape(val) };
    case 'sc':
      return { type: 'stripClozes', text: unescape(val) };
    case 'w':
      return { type: 'wordBoundary', text: unescape(val) };
    // Keywords that Anki has and this app doesn't: validated like Anki, then refused.
    case 'resched':
      u32(val, 'resched:');
      throw errors.unsupported('resched:');
    case 'edited':
      u32(val, 'edited:');
      throw errors.unsupported('edited:');
    case 'did':
    case 'nid':
    case 'cid':
      if (!/^(?:[0-9]+,)*[0-9]+$/.test(val)) {
        throw new SearchError(
          `Búsqueda no válida: \`${key}:\` lleva solo números separados por comas.`,
          'other',
        );
      }
      throw errors.unsupported(`${asciiLowerKey(key)}:`);
    case 'mid':
      i64(val, 'mid:');
      throw errors.unsupported('mid:');
    case 'dupe': {
      i64(val.split(',')[0]!, val);
      if (!val.includes(',')) {
        throw new SearchError('Búsqueda no válida: `dupe:` lleva un id y un texto.', 'other');
      }
      throw errors.unsupported('dupe:');
    }
    case 'has-cd':
      unescape(val);
      throw errors.unsupported('has-cd:');
    case 'preset':
      throw errors.unsupported('preset:');
    default:
      return parseSingleField(key, val);
  }
}

function parseSingleField(key: string, val: string): SearchNode {
  if (val.startsWith('re:')) {
    const value = checkedRegex(unescapeQuotes(val.slice(3)));
    return { type: 'field', field: unescape(key), value, mode: 'regex' };
  }
  if (val.startsWith('nc:')) {
    return {
      type: 'field',
      field: unescape(key),
      value: unescapeQuotes(val.slice(3)),
      mode: 'noCombining',
    };
  }
  return { type: 'field', field: unescape(key), value: unescape(val), mode: 'normal' };
}

/** A regular expression is checked while parsing, so that a bad one is a parse error. */
function checkedRegex(pattern: string): string {
  rustRegex(`(?i)${pattern}`, pattern);
  return pattern;
}

function u32(num: string, context: string): number {
  const n = parseUnsigned(num, U32_MAX);
  if (n === null) throw errors.invalidPositiveWholeNumber(context, num);
  return n;
}

function i64(num: string, context: string): number {
  const n = parseSigned(num, -Infinity, Infinity);
  if (n === null) throw errors.invalidWholeNumber(context, num);
  return n;
}

function answerButton(num: string | undefined, context: string): 1 | 2 | 3 | 4 | null {
  if (num === undefined) return null;
  const n = parseUnsigned(num, 255);
  if (n === null || n < 1 || n > 4) throw errors.invalidAnswerButton(context, num);
  return n as 1 | 2 | 3 | 4;
}

function splitOnce(s: string, sep: string): [string, string | undefined] {
  const at = s.indexOf(sep);
  return at < 0 ? [s, undefined] : [s.slice(0, at), s.slice(at + sep.length)];
}

function parseRated(s: string): SearchNode {
  const [days, button] = splitOnce(s, ':');
  return { type: 'rated', days: Math.max(u32(days, 'rated:'), 1), rating: answerButton(button, s) };
}

const STATES: Record<string, CardStateFilter> = {
  new: 'new',
  review: 'review',
  learn: 'learn',
  due: 'due',
  buried: 'buried',
  // Not told apart here (the cards only say «buried»): both are is:buried.
  'buried-manually': 'buried',
  'buried-sibling': 'buried',
  suspended: 'suspended',
};

function parseState(s: string): CardStateFilter {
  const state = Object.hasOwn(STATES, s) ? STATES[s] : undefined;
  if (!state) throw errors.invalidState(s);
  return state;
}

const PROPS = [
  'ivl',
  'due',
  'reps',
  'lapses',
  'ease',
  'pos',
  'rated',
  'resched',
  's',
  'd',
  'r',
] as const;
const OPERATORS: CompareOp[] = ['<=', '>=', '!=', '=', '<', '>'];

function parseProp(clause: string): SearchNode {
  let prop: string | undefined = PROPS.find((p) => clause.startsWith(p));
  if (prop === undefined) {
    const custom = /^cd[ns]:[A-Za-z0-9]+/.exec(clause);
    if (!custom) throw errors.invalidPropProperty(clause);
    prop = custom[0];
  }
  const tail = clause.slice(prop.length);
  const op = OPERATORS.find((o) => tail.startsWith(o));
  if (op === undefined) throw errors.invalidPropOperator(prop);
  const num = tail.slice(op.length);
  const f32 = () => {
    const n = parseF32(num);
    if (n === null) throw errors.invalidNumber(clause, num);
    if (!Number.isFinite(n)) throw errors.invalidNumber(clause, num);
    return n;
  };
  const value = (kind: PropKind, n: number): SearchNode => ({
    type: 'prop',
    prop: kind,
    op,
    value: n,
  });
  switch (prop) {
    case 'due': {
      const n = parseSigned(num, I32_MIN, I32_MAX);
      if (n === null) throw errors.invalidWholeNumber(clause, num);
      return value('due', n);
    }
    case 'ivl':
    case 'reps':
    case 'lapses': {
      const n = parseUnsigned(num, U32_MAX);
      if (n === null) throw errors.invalidPositiveWholeNumber(clause, num);
      return value(prop, n);
    }
    case 's':
      return value('s', f32AsWritten(f32()));
    case 'd':
      // Anki compares the stored difficulty (1–10) with d·9 + 1, computed in f32.
      return value('d', f32AsWritten(Math.fround(Math.fround(f32() * 9) + 1)));
    case 'r':
      return value('r', f32AsWritten(f32()));
    case 'ease':
      f32();
      throw errors.unsupported('prop:ease');
    case 'pos':
      if (parseUnsigned(num, U32_MAX) === null) {
        throw errors.invalidPositiveWholeNumber(clause, num);
      }
      throw errors.unsupported('prop:pos');
    case 'rated':
    case 'resched': {
      const [days, button] = splitOnce(num, ':');
      const n = parseSigned(days, I32_MIN, I32_MAX);
      if (n === null || n > 0) throw errors.invalidNegativeWholeNumber(clause, days);
      if (prop === 'rated') answerButton(button, clause);
      throw errors.unsupported(`prop:${prop}`);
    }
    default:
      if (prop.startsWith('cdn:')) f32();
      throw errors.unsupported(`prop:${prop.slice(0, 4)}`);
  }
}

/** The flat list → a tree: AND binds tighter than OR, as in Anki's SQL. */
function toTree(nodes: RawNode[]): SearchNode {
  const ors: SearchNode[][] = [[]];
  for (const n of nodes) {
    if (n === 'and') continue;
    if (n === 'or') ors.push([]);
    else ors.at(-1)!.push(convert(n));
  }
  const ands = ors.map((list) =>
    list.length === 1 ? list[0]! : { type: 'and' as const, nodes: list },
  );
  return ands.length === 1 ? ands[0]! : { type: 'or', nodes: ands };
}

function convert(n: RawNode): SearchNode {
  if (n === 'and' || n === 'or') throw errors.other();
  if ('not' in n) return { type: 'not', node: convert(n.not) };
  if ('group' in n) return toTree(n.group);
  return n;
}
