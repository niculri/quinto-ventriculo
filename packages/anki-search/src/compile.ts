// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// FSRS formulas and constants from fsrs-rs (BSD-3-Clause) and ts-fsrs (MIT), © Open Spaced Repetition.
/**
 * The search tree → a predicate over cards, following the SQL that Anki 25.9 writes for each node
 * (rslib/src/search/sqlwriter.rs). Everything that depends on the collection (decks, note types, field
 * positions, answers) is resolved once here; the predicate only reads the card.
 *
 * Nodes return true, false or null: Anki's SQL has NULL where a card has no FSRS memory state
 * (`prop:s`, `prop:d`, `prop:r`), and `-prop:s>5` does not match those cards either.
 */
import type { CompareOp, SearchNode } from './ast';
import {
  WORD_BOUNDARY,
  asU32,
  asciiLower,
  foldCase,
  isGlob,
  likeMatcher,
  rustRegex,
  stripClozes,
  toRe,
  toSql,
  toText,
  withoutCombining,
} from './text';
import type { TextMatcher } from './text';
import type { SearchCard, SearchContext, SearchNoteType } from './types';

type Tri = boolean | null;
type Pred = (card: SearchCard) => Tri;

const DAY = 86_400;
/** fsrs-rs FSRS5_DEFAULT_DECAY: what Anki uses for a card without its own decay. */
const DEFAULT_DECAY = 0.5;

// ---------------------------------------------------------------------------------------------------------
// Text derived from a card's fields, cached by the fields array (a later search reuses it).

interface Derived {
  joined?: string;
  low?: string;
  lowFields?: string[];
  nc?: string;
  ncPlain?: string;
  ncFields?: string[];
  sc?: string;
}

const derivedCache = new WeakMap<string[], Derived>();

function derived(card: SearchCard): Derived {
  let d = derivedCache.get(card.fields);
  if (!d) {
    d = {};
    derivedCache.set(card.fields, d);
  }
  return d;
}

/** The fields joined with \x1f, like Anki's `notes.flds`. */
function joined(card: SearchCard): string {
  const d = derived(card);
  return (d.joined ??= card.fields.join('\x1f'));
}

function lowJoined(card: SearchCard): string {
  const d = derived(card);
  return (d.low ??= asciiLower(joined(card)));
}

function lowFields(card: SearchCard): string[] {
  const d = derived(card);
  return (d.lowFields ??= card.fields.map(asciiLower));
}

function ncJoined(card: SearchCard): string {
  const d = derived(card);
  return (d.nc ??= asciiLower(withoutCombining(joined(card))));
}

/** The fields joined, without accents but with their case (for a case-insensitive regex). */
function ncPlain(card: SearchCard): string {
  const d = derived(card);
  return (d.ncPlain ??= withoutCombining(joined(card)));
}

function ncFields(card: SearchCard): string[] {
  const d = derived(card);
  return (d.ncFields ??= card.fields.map((f) => asciiLower(withoutCombining(f))));
}

function scJoined(card: SearchCard): string {
  const d = derived(card);
  return (d.sc ??= asciiLower(stripClozes(joined(card))));
}

// ---------------------------------------------------------------------------------------------------------

interface Env {
  ctx: SearchContext;
  noteTypes: Map<string, SearchNoteType>;
}

export function compileSearch(node: SearchNode, ctx: SearchContext): (card: SearchCard) => boolean {
  const env: Env = { ctx, noteTypes: new Map(ctx.noteTypes.map((nt) => [nt.id, nt])) };
  const pred = compile(node, env);
  return (card) => pred(card) === true;
}

const always: Pred = () => true;
const nothing: Pred = () => false;

function compile(node: SearchNode, env: Env): Pred {
  switch (node.type) {
    case 'all':
      return always;
    case 'and': {
      const preds = node.nodes.map((n) => compile(n, env));
      return (card) => {
        let unknown = false;
        for (const p of preds) {
          const v = p(card);
          if (v === false) return false;
          if (v === null) unknown = true;
        }
        return unknown ? null : true;
      };
    }
    case 'or': {
      const preds = node.nodes.map((n) => compile(n, env));
      return (card) => {
        let unknown = false;
        for (const p of preds) {
          const v = p(card);
          if (v === true) return true;
          if (v === null) unknown = true;
        }
        return unknown ? null : false;
      };
    }
    case 'not': {
      const p = compile(node.node, env);
      return (card) => {
        const v = p(card);
        return v === null ? null : !v;
      };
    }
    case 'text': {
      // Anki's «Ignore accents in search» turns loose text into `nc:` (sqlwriter.rs, `UnqualifiedText`).
      if (env.ctx.ignoreAccents) return compile({ type: 'noCombining', text: node.text }, env);
      const m = likeMatcher(`%${toSql(node.text)}%`);
      return (card) => m(lowJoined(card));
    }
    case 'noCombining': {
      const m = likeMatcher(`%${withoutCombining(toSql(node.text))}%`);
      return (card) => m(ncJoined(card));
    }
    case 'stripClozes': {
      const cloze = new Set(
        env.ctx.noteTypes.filter((nt) => nt.kind === 'cloze').map((nt) => nt.id),
      );
      const m = likeMatcher(`%${toSql(node.text)}%`);
      return (card) => cloze.has(card.noteTypeId) && m(scJoined(card));
    }
    case 'wordBoundary': {
      // With «Ignore accents in search», Anki takes the accents off the word and the fields (`w:vertebra`
      // finds «vértebra», and `w:vértebra` still does).
      if (env.ctx.ignoreAccents) {
        const re = new RegExp(
          `${WORD_BOUNDARY}${toRe(withoutCombining(node.text))}${WORD_BOUNDARY}`,
          'iu',
        );
        return (card) => re.test(ncPlain(card));
      }
      const re = new RegExp(`${WORD_BOUNDARY}${toRe(node.text)}${WORD_BOUNDARY}`, 'iu');
      return (card) => re.test(joined(card));
    }
    case 'regex': {
      const re = rustRegex(`(?i)${node.pattern}`, node.pattern);
      return (card) => re.test(joined(card));
    }
    case 'field':
      return compileField(node, env);
    case 'deck':
      return compileDeck(node.name, env);
    case 'tag':
      return compileTag(node.tag, node.regex);
    case 'noteType': {
      const matches = nameMatcher(node.name);
      const ids = new Set(env.ctx.noteTypes.filter((nt) => matches(nt.name)).map((nt) => nt.id));
      return (card) => ids.has(card.noteTypeId);
    }
    case 'cardOrd': {
      const ord = node.ord;
      return (card) => card.ord === ord;
    }
    case 'cardName': {
      const matches = nameMatcher(node.name);
      const ords = new Map<string, Set<number>>();
      for (const nt of env.ctx.noteTypes) {
        const set = new Set<number>();
        nt.templates.forEach((name, ord) => {
          if (matches(name)) set.add(ord);
        });
        if (set.size > 0) ords.set(nt.id, set);
      }
      return (card) => ords.get(card.noteTypeId)?.has(card.ord) ?? false;
    }
    case 'state':
      return compileState(node.state, env);
    case 'flag': {
      const flag = node.flag;
      return (card) => (card.flag & 7) === flag;
    }
    case 'prop':
      return compileProp(node.prop, node.op, node.value, env);
    case 'rated': {
      const cutoffMs = (env.ctx.timing.nextDayAt - node.days * DAY) * 1000;
      const rating = node.rating;
      const cards = new Map<string, Set<number>>();
      for (const a of env.ctx.answers ?? []) {
        if (a.atMs >= cutoffMs && (rating === null || a.rating === rating)) {
          let set = cards.get(a.noteGuid);
          if (!set) cards.set(a.noteGuid, (set = new Set()));
          set.add(a.ord);
        }
      }
      return (card) => cards.get(card.noteGuid)?.has(card.ord) ?? false;
    }
    case 'introduced': {
      const cutoffMs = (env.ctx.timing.nextDayAt - node.days * DAY) * 1000;
      const first = env.ctx.firstAnswerMs ?? new Map<string, number>();
      return (card) => {
        const at = first.get(`${card.noteGuid}\u001f${card.ord}`);
        return at !== undefined && at > cutoffMs;
      };
    }
    case 'added': {
      const cutoffMs = (env.ctx.timing.nextDayAt - node.days * DAY) * 1000;
      return (card) => card.createdMs !== null && card.createdMs > cutoffMs;
    }
  }
}

/** Note type, template or field name: a glob (case-insensitive regex) or a Unicode-caseless equality. */
function nameMatcher(search: string): (name: string) => boolean {
  if (isGlob(search)) {
    const re = new RegExp(`^${toRe(search)}$`, 'iu');
    return (name) => re.test(name);
  }
  const wanted = foldCase(toText(search));
  return (name) => foldCase(name) === wanted;
}

function isNonEmptyTest(value: string): boolean {
  return value === '*' || value === '_*' || value === '*_';
}

/** Anki's `collect_ranges`: consecutive ords become one range when `join`. */
function collectRanges(ords: number[], join: boolean): [number, number][] {
  const ranges: [number, number][] = [];
  for (const ord of ords) {
    const last = ranges.at(-1);
    if (join && last && last[1] === ord) last[1] = ord + 1;
    else ranges.push([ord, ord + 1]);
  }
  return ranges;
}

function compileField(node: Extract<SearchNode, { type: 'field' }>, env: Env): Pred {
  const { field, value, mode } = node;
  if (field === '*' || field === '_*' || field === '*_') {
    // Every field, as a regular expression (Unicode case folding, unlike LIKE).
    const re =
      mode === 'regex'
        ? rustRegex(`(?i)${value}`, value)
        : new RegExp(`^${toRe(value, '[^]')}$`, 'iu');
    return (card) => card.fields.some((f) => re.test(f));
  }
  const matches = nameMatcher(field);
  const byType = new Map<string, number[]>();
  for (const nt of env.ctx.noteTypes) {
    const ords: number[] = [];
    nt.fields.forEach((name, ord) => {
      if (matches(name)) ords.push(ord);
    });
    if (ords.length > 0) byType.set(nt.id, ords);
  }
  if (byType.size === 0) return nothing;

  if (mode === 'regex') {
    const re = rustRegex(`(?i)${value}`, value);
    return (card) => {
      const ords = byType.get(card.noteTypeId);
      return (
        ords !== undefined && ords.some((o) => o < card.fields.length && re.test(card.fields[o]!))
      );
    };
  }
  // LIKE over the whole field. Several consecutive fields matched by a wildcard name are one range, and
  // the value has to match them joined with \x1f (that is how Anki's SQL pattern behaves).
  const join = !isNonEmptyTest(value);
  const ranges = new Map([...byType].map(([id, ords]) => [id, collectRanges(ords, join)]));
  const m: TextMatcher = likeMatcher(
    mode === 'noCombining' ? withoutCombining(toSql(value)) : toSql(value),
  );
  const fieldsOf = mode === 'noCombining' ? ncFields : lowFields;
  return (card) => {
    const rs = ranges.get(card.noteTypeId);
    if (!rs) return false;
    const fields = fieldsOf(card);
    for (const [start, end] of rs) {
      const text = end - start === 1 ? fields[start] : fields.slice(start, end).join('\x1f');
      if (text !== undefined && m(text)) return true;
    }
    return false;
  };
}

/** A deck-name component as Anki normalizes it. */
function normalizeDeckComponent(comp: string): string {
  const out = comp
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/^[\p{White_Space}:]+|[\p{White_Space}:]+$/gu, '');
  return out === '' ? 'blank' : out;
}

function compileDeck(name: string, env: Env): Pred {
  if (name === '*') return always;
  // No filtered decks here.
  if (name === 'filtered') return nothing;
  const native = name
    .split('::')
    .map((c) => toRe(normalizeDeckComponent(c)))
    .join('\x1f');
  const re = new RegExp(`^(?:${native})(?:$|\x1f)`, 'iu');
  const ids = new Set(
    env.ctx.decks.filter((d) => re.test(d.name.replaceAll('::', '\x1f'))).map((d) => d.id),
  );
  return (card) => ids.has(card.deckId);
}

function compileTag(tag: string, regex: boolean): Pred {
  let test: (tag: string) => boolean;
  if (regex) {
    const re = rustRegex(`(?i)${tag}`, tag);
    // Anki splits « tag1 tag2 » on spaces, so the empty string is always one of the «tags».
    const empty = re.test('');
    if (empty) return always;
    test = (t) => re.test(t);
  } else {
    if (tag === 'none') return (card) => card.tags.length === 0;
    if (tag === '*') return always;
    if (tag.includes(' ')) return nothing;
    const re = new RegExp(`^${toRe(tag, '\\S')}(?:::|$)`, 'iu');
    test = (t) => re.test(t);
  }
  const seen = new Map<string, boolean>();
  return (card) => {
    for (const t of card.tags) {
      let hit = seen.get(t);
      if (hit === undefined) seen.set(t, (hit = test(t)));
      if (hit) return true;
    }
    return false;
  };
}

function compileState(state: Extract<SearchNode, { type: 'state' }>['state'], env: Env): Pred {
  switch (state) {
    case 'new':
      return (card) => card.type === 'new';
    case 'learn':
      return (card) => card.type === 'learn' || card.type === 'relearn';
    case 'review':
      return (card) => card.type === 'review' || card.type === 'relearn';
    case 'suspended':
      return (card) => card.queue === 'suspended';
    case 'buried':
      return (card) => card.queue === 'buried';
    case 'due': {
      const { today, now } = env.ctx.timing;
      const learnCutoff = now + env.ctx.learnAheadSecs;
      return (card) => {
        if (card.due === null) return false;
        if (card.queue === 'review' || card.queue === 'dayLearn') return card.due <= today;
        if (card.queue === 'learn') return card.due <= learnCutoff;
        return false;
      };
    }
  }
}

function comparer(op: CompareOp): (a: number, b: number) => boolean {
  switch (op) {
    case '=':
      return (a, b) => a === b;
    case '!=':
      return (a, b) => a !== b;
    case '<':
      return (a, b) => a < b;
    case '>':
      return (a, b) => a > b;
    case '<=':
      return (a, b) => a <= b;
    case '>=':
      return (a, b) => a >= b;
  }
}

function compileProp(
  prop: Extract<SearchNode, { type: 'prop' }>['prop'],
  op: CompareOp,
  value: number,
  env: Env,
): Pred {
  const cmp = comparer(op);
  const { today, nextDayAt, now } = env.ctx.timing;
  switch (prop) {
    case 'due': {
      const day = value + today;
      return (card) => {
        if (card.due === null) return false;
        if (card.queue === 'review' || card.queue === 'dayLearn') return cmp(card.due, day);
        // Intraday learning: whole days from the next day's start, truncated (SQLite integer division).
        if (card.queue === 'learn') return cmp(Math.trunc((card.due - nextDayAt) / DAY), value);
        return false;
      };
    }
    case 'ivl':
      return (card) => cmp(card.interval, value);
    case 'reps':
      return (card) => cmp(card.reps, value);
    case 'lapses':
      return (card) => cmp(card.lapses, value);
    case 's':
      return (card) => (card.stability === null ? null : cmp(Math.fround(card.stability), value));
    case 'd':
      return (card) => (card.difficulty === null ? null : cmp(Math.fround(card.difficulty), value));
    case 'r':
      return (card) => {
        const r = retrievability(card, today, now);
        return r === null ? null : cmp(r, value);
      };
  }
}

/** Anki's `extract_fsrs_retrievability` with fsrs-rs `current_retrievability`, in f32 like Rust. */
function retrievability(card: SearchCard, daysElapsed: number, now: number): number | null {
  if (card.stability === null || card.difficulty === null) return null;
  let seconds: number;
  if (card.lastReview !== null) {
    seconds = asU32(now - card.lastReview);
  } else if (card.due === null) {
    return null;
  } else if (card.due > 365_000) {
    seconds = asU32(now - (card.due - card.interval));
  } else {
    const reviewDay = card.due - card.interval;
    seconds = asU32(asU32(daysElapsed - reviewDay) * DAY);
  }
  const f = Math.fround;
  const decay = f(card.decay ?? DEFAULT_DECAY);
  const factor = f(f(Math.pow(f(0.9), f(1 / f(-decay)))) - 1);
  const days = f(f(seconds) / DAY);
  return f(Math.pow(f(f(f(days / f(card.stability)) * factor) + 1), f(-decay)));
}

/** What data a search needs beyond the cards: how many days of answers (`rated:`) and `introduced:`. */
export function searchNeeds(node: SearchNode): {
  ratedDays: number | null;
  introducedDays: number | null;
} {
  let ratedDays: number | null = null;
  let introducedDays: number | null = null;
  const visit = (n: SearchNode): void => {
    switch (n.type) {
      case 'and':
      case 'or':
        n.nodes.forEach(visit);
        break;
      case 'not':
        visit(n.node);
        break;
      case 'rated':
        ratedDays = Math.max(ratedDays ?? 0, n.days);
        break;
      case 'introduced':
        introducedDays = Math.max(introducedDays ?? 0, n.days);
        break;
      default:
        break;
    }
  };
  visit(node);
  return { ratedDays, introducedDays };
}
