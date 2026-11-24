// SPDX-License-Identifier: AGPL-3.0-or-later
// Ported from El Rincón de la Gymkana (its app.js: normalizar, palabraOK, compararPalabras, alternativas, lev and
// corregir), by this project's author.
/**
 * Checks a written name against a station's: no accents, «m.», another order, synonyms and small mistakes pass; a
 * word that names another structure never does (interna for externa, medial for lateral, arteria for vena).
 */

const ABBREVIATIONS = new Map([
  ['m', 'musculo'],
  ['mm', 'musculos'],
  ['a', 'arteria'],
  ['aa', 'arterias'],
  ['n', 'nervio'],
  ['nn', 'nervios'],
  ['v', 'vena'],
  ['vv', 'venas'],
  ['lig', 'ligamento'],
  ['gl', 'glandula'],
  ['art', 'articulacion'],
  ['r', 'ramo'],
]);
const STOP_WORDS = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'y',
  'e',
  'en',
  'al',
  'a',
  'su',
  'sus',
]);
const GENERIC = new Set([
  'musculo',
  'musculos',
  'arteria',
  'arterias',
  'nervio',
  'nervios',
  'vena',
  'venas',
  'ligamento',
  'ligamentos',
  'glandula',
  'hueso',
  'ramo',
  'ramos',
  'rama',
  'tendon',
  'fascia',
  'conducto',
  'seno',
  'nucleo',
]);
/** Words that tell a structure from its neighbour: they must be there as they are (gender aside). */
const KEY_WORDS = new Set([
  'intern',
  'extern',
  'superior',
  'inferior',
  'anterior',
  'posterior',
  'medial',
  'lateral',
  'mayor',
  'menor',
  'superficial',
  'profund',
  'derech',
  'izquierd',
  'ascendent',
  'descendent',
  'transvers',
  'oblicu',
  'rect',
  'proximal',
  'distal',
  'comun',
  'medi',
  'central',
  'principal',
  'accesori',
  'primer',
  'segund',
  'tercer',
  'cuart',
  'median',
  'propi',
  'larg',
  'cort',
  'grand',
  'pequen',
  'alt',
  'baj',
  'vertical',
  'horizontal',
  'supraorbitari',
  'infraorbitari',
  'supratroclear',
  'infratroclear',
  // Embryology: pairs one letter apart (mesonefros and metanefros, ectodermo and endodermo…).
  'pronefr',
  'mesonefr',
  'metanefr',
  'paramesonefr',
  'mesonefric',
  'paramesonefric',
  'ectoderm',
  'endoderm',
  'mesoderm',
  'somatic',
  'esplacnic',
  'citotrofoblast',
  'sinciciotrofoblast',
  'basal',
  'capsular',
  'parietal',
  'dorsal',
  'ventral',
  'craneal',
  'caudal',
  'primari',
  'secundari',
  'terciari',
  'masculin',
  'femenin',
]);

/** From this score up, the answer counts as right. */
export const CORRECT_SCORE = 0.9;

const stem = (w: string) => w.replace(/(os|as|o|a|es|e)$/, '');
const isKey = (w: string) => KEY_WORDS.has(w) || KEY_WORDS.has(stem(w));

/** The words of a name: lower case, without accents, abbreviations spelled out and without «de», «la»… */
export function normalize(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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
  return words.filter((w) => !STOP_WORDS.has(w));
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

/** 1: the same words in any order; 0.95: with a small spelling mistake; 0: something else. */
function compareWords(written: readonly string[], expected: readonly string[]): number {
  if (written.length !== expected.length) return 0;
  const free = [...expected];
  let score = 1;
  for (const w of written) {
    let best = -1;
    let found = 0;
    for (let j = 0; j < free.length; j++) {
      const v = wordScore(w, free[j]!);
      if (v > found) {
        found = v;
        best = j;
        if (v === 2) break;
      }
    }
    if (best < 0) return 0;
    if (found === 1) score = 0.95;
    free.splice(best, 1);
  }
  return score;
}

/**
 * The names a station accepts: each one between «/», «;» or «:», each side of an «o» («Mesodermo somítico o
 * paraxial»), and the synonyms in parentheses, but not a figure's letters («Notocorda (N)»): one word of up to four
 * letters is not an answer anyone writes.
 */
export function alternatives(name: string): string[][] {
  const out: string[] = [];
  const outside = name.replace(/\([^)]*\)/g, ' ');
  for (const part of outside.split(/\s\/\s|;|:/)) {
    out.push(part);
    const either = /^(.*\s)?(\S+)\so\s(\S+)\s*$/.exec(part);
    if (either) out.push((either[1] ?? '') + either[2]!, (either[1] ?? '') + either[3]!);
    const sides = part.split(/\so\s/);
    if (sides.length === 2 && sides[1]!.trim().split(/\s+/).length > 1) out.push(...sides);
  }
  for (const m of name.matchAll(/\(([^)]*)\)/g)) {
    out.push(...m[1]!.split(/,|\so\s/).filter((s) => /\s/.test(s.trim()) || s.trim().length > 4));
  }
  return out.map(normalize).filter((a) => a.length);
}

/**
 * How well a written answer names the station, from 0 to 1. Without «músculo», «arteria»… it still counts, but if
 * the answer says «arteria», it has to be one. The whole name as written on the card, parentheses included, counts
 * too.
 */
export function checkAnswer(written: string, name: string): number {
  const words = normalize(written);
  if (!words.length) return 0;
  const generic = words.some((w) => GENERIC.has(w));
  let best = compareWords(words, normalize(name)) === 1 ? 1 : 0;
  for (const alt of alternatives(name)) {
    best = Math.max(best, compareWords(words, alt));
    const specific = alt.filter((w) => !GENERIC.has(w));
    if (!generic && specific.length) best = Math.max(best, compareWords(words, specific));
  }
  return best;
}

export const isCorrect = (score: number) => score >= CORRECT_SCORE;
