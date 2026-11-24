// SPDX-License-Identifier: AGPL-3.0-or-later
// Ported from El Rincón de la Gymkana (its app.js: normalizar, palabraOK, compararPalabras, alternativas, lev and
// corregir), by this project's author.
/**
 * Checks a written name against a station's: no accents, «m.», another order, synonyms and small mistakes pass; a
 * word that names another structure (interna for externa, arteria for vena) or another station's name never does.
 */
import { ABBREVIATIONS, GENERIC, KEY_WORDS, STOP_WORDS } from './words';

/** From this score up, the answer counts as right. */
export const CORRECT_SCORE = 0.9;

/** A word of a name and the part of it it belongs to: «Proceso temporal | del hueso cigomático». */
interface Token {
  word: string;
  part: number;
}

const CONNECTORS = new Set(['de', 'del']);

const stem = (w: string) => w.replace(/(os|as|o|a|es|e)$/, '');
const isKey = (w: string) => KEY_WORDS.has(w) || KEY_WORDS.has(stem(w));
const plain = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function tokens(text: string): Token[] {
  const words = plain(text)
    .replace(
      /\b(mm|aa|nn|vv|lig|gl|art|m|a|n|v|r)\.\s*/g,
      (_, x: string) => `${ABBREVIATIONS.get(x)!} `,
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  // «m recto lateral», «n facial»: an abbreviation without its dot at the start; not «a» («a nivel renal»).
  const first = ABBREVIATIONS.get(words[0] ?? '');
  if (words.length > 1 && first && words[0] !== 'a') words[0] = first;
  const out: Token[] = [];
  let part = 0;
  for (const word of words) {
    if (CONNECTORS.has(word)) part++;
    else if (!STOP_WORDS.has(word)) out.push({ word, part });
  }
  return out;
}

/** The words of a name: lower case, without accents, abbreviations spelled out and without «de», «la»… */
export function normalize(text: string): string[] {
  return tokens(text).map((t) => t.word);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let cur = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}

/** 2: the same word (gender and number aside); 1: a small spelling mistake; 0: another word. */
function wordScore(x: string, y: string): number {
  if (x === y || stem(x) === stem(y)) return 2;
  if (isKey(x) && isKey(y)) return 0;
  const tolerance = y.length <= 4 ? 0 : y.length <= 7 ? 1 : 2;
  return levenshtein(x, y) <= tolerance ? 1 : 0;
}

/** Each part of the name together, in any order: «hueso cigomático proceso temporal», not «proceso cigomático hueso temporal». */
function partsTogether(parts: readonly number[]): boolean {
  const seen = new Set<number>();
  return parts.every((p, i) => {
    if (i > 0 && parts[i - 1] === p) return true;
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
}

/** The first free word that matches best, and how well (as `wordScore`); none: -1. */
function bestMatch(w: string, free: readonly Token[]): { at: number; score: number } {
  let at = -1;
  let score = 0;
  for (let j = 0; j < free.length; j++) {
    const v = wordScore(w, free[j]!.word);
    if (v > score) {
      score = v;
      at = j;
      if (v === 2) break;
    }
  }
  return { at, score };
}

/** 1: the same words in any order (each part of the name together); 0.95: with a small spelling mistake; 0: something else. */
function compareWords(written: readonly string[], expected: readonly Token[]): number {
  if (written.length !== expected.length) return 0;
  const free = [...expected];
  const parts: number[] = [];
  let score = 1;
  for (const w of written) {
    const match = bestMatch(w, free);
    if (match.at < 0) return 0;
    if (match.score === 1) score = 0.95;
    parts.push(free[match.at]!.part);
    free.splice(match.at, 1);
  }
  return partsTogether(parts) ? score : 0;
}

/** After a comma, what does not change the structure: how it was dissected, a view, the spinal nerve's number. */
const DROPPABLE = [
  /^(?:(?:seccionad|reclinad|cortad|rebatid|abiert|desplazad)[a-z]*(?: hacia [a-z]+)?(?: y |$))+$/,
  /^(?:en desarrollo|borde cortado|superficie de corte|vista desde .+|c[1-8])$/,
];
/** After a comma, its origin or what goes with it («del etmoides», «con los nervios…»), up to the end. */
const DESCRIPTION = /^(?:con|del?) /;
/** A cranial nerve's number after its name («Nervio óptico, NC II»): it names the nerve by itself. */
const NERVE_NUMBER = /^nc (?:[ivx]+|v[1-3])$/;

/** «Nervio óptico, NC II, porción intracraneal» → «Nervio óptico, porción intracraneal» and «NC II, porción intracraneal». */
function withoutQualifiers(part: string): string[] {
  const tails = part.split(',');
  const head = tails.shift()!;
  const kept: string[] = [];
  const names = [head];
  for (const tail of tails) {
    const t = plain(tail).trim().replace(/\s+/g, ' ');
    if (DESCRIPTION.test(t)) break;
    if (NERVE_NUMBER.test(t)) names.push(tail);
    else if (!DROPPABLE.some((r) => r.test(t))) kept.push(tail);
  }
  if (kept.length === tails.length) return [];
  return names.map((n) => [n, ...kept].join(','));
}

function alternativeTokens(name: string): Token[][] {
  const out: string[] = [];
  const outside = name.replace(/\([^)]*\)/g, ' ');
  for (const part of outside.split(/\s\/\s|;|:/)) {
    out.push(part, ...withoutQualifiers(part));
    const either = /^(.*\s)?(\S+)\so\s(\S+)\s*$/.exec(part);
    if (either) out.push((either[1] ?? '') + either[2]!, (either[1] ?? '') + either[3]!);
    const sides = part.split(/\so\s/);
    if (sides.length === 2 && sides[1]!.trim().split(/\s+/).length > 1) out.push(...sides);
  }
  for (const m of name.matchAll(/\(([^)]*)\)/g)) {
    out.push(...m[1]!.split(/,|\so\s/).filter((s) => /\s/.test(s.trim()) || s.trim().length > 4));
  }
  return out.map(tokens).filter((a) => a.length);
}

/**
 * The names a station accepts: each one between «/», «;» or «:», each side of an «o» («Mesodermo somítico o
 * paraxial»), without what a comma adds about the dissection («Vena yugular interna, reclinada»), and the synonyms in
 * parentheses, but not a figure's letters («Notocorda (N)»): one word of up to four letters is not an answer anyone
 * writes.
 */
export function alternatives(name: string): string[][] {
  return alternativeTokens(name).map((a) => a.map((t) => t.word));
}

/**
 * How well the words name a station, and whether they name it whole. «Músculo», «arteria»… may be left out, but the
 * ones written have to be in the name: «ramo marginal mandibular del facial» is the nerve's branch, «arteria facial»
 * is not the nerve.
 */
function grade(words: readonly string[], name: string): { score: number; whole: boolean } {
  const all = [tokens(name), ...alternativeTokens(name)];
  let best = 0;
  for (const alt of all) best = Math.max(best, compareWords(words, alt));
  if (best === 1) return { score: 1, whole: true };
  const written = new Set(words.map(stem));
  for (const alt of all) {
    const shorter = alt.filter((t) => !GENERIC.has(t.word) || written.has(stem(t.word)));
    best = Math.max(best, compareWords(words, shorter));
  }
  return { score: best, whole: false };
}

const rank = (g: { score: number; whole: boolean }) => g.score + (g.whole ? 0.01 : 0);

/**
 * How well a written answer names the station, from 0 to 1. The whole name as written on the card, parentheses
 * included, counts too. An answer that names one of `others` (the gymkana's other stations) better is wrong: «esternotiroideo» is not
 * a slip for «esternohioideo», nor «maxilar» for «Seno maxilar» when the maxilla is a station.
 */
export function checkAnswer(written: string, name: string, others: readonly string[] = []): number {
  const words = normalize(written);
  if (!words.length) return 0;
  // A leading «a» without its dot may be «arteria» («a maxilar») or not («a nivel renal»): the reading that fits best.
  const readings = /^\s*a\s/i.test(written) ? [words, ['arteria', ...words]] : [words];
  return Math.max(...readings.map((r) => scoreOf(r, name, others)));
}

function scoreOf(words: readonly string[], name: string, others: readonly string[]): number {
  const mine = grade(words, name);
  if (mine.whole || mine.score < CORRECT_SCORE) return mine.score;
  const mark = rank(mine);
  return others.some((o) => o !== name && rank(grade(words, o)) > mark) ? 0 : mine.score;
}

export const isCorrect = (score: number) => score >= CORRECT_SCORE;
