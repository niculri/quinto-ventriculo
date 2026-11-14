// The lint ratchet: for each rule, the ESLint suppressions (eslint-suppressions.json) plus the inline `eslint-disable`
// directives may go down, never up, with respect to a base commit. Suppressions are kept per file, so counting per rule
// (not per file) lets a file move without its suppressions counting as new.

export const SUPPRESSIONS_FILE = 'eslint-suppressions.json';
/** The rule an `eslint-disable` without a list of rules turns off: all of them. */
export const ALL_RULES = '*';

export type Counts = Map<string, number>;

/**
 * The file of a rule of this repository's own ESLint plugin (`qv/<name>`), or null for any other rule. A `qv/` rule
 * whose file the base does not have is new: what it finds the first time is the debt it starts with, not growth.
 * Every other rule counts as one the base already had.
 */
export function localRuleFile(rule: string): string | null {
  const name = /^qv\/([a-z][a-z-]*)$/.exec(rule)?.[1];
  return name ? `packages/eslint-plugin/src/${name}.js` : null;
}

/** Suppressions per rule, from the JSON that ESLint writes: { file: { rule: { count } } }. */
export function suppressionsByRule(json: string): Counts {
  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed)) throw new Error(`${SUPPRESSIONS_FILE} no es un objeto JSON.`);
  const byRule: Counts = new Map();
  for (const [file, rules] of Object.entries(parsed)) {
    if (!isRecord(rules)) throw new Error(`${SUPPRESSIONS_FILE}: «${file}» no es un objeto.`);
    for (const [rule, entry] of Object.entries(rules)) {
      const count = isRecord(entry) ? entry.count : undefined;
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
        throw new Error(`${SUPPRESSIONS_FILE}: «${file}» → «${rule}» no tiene un count válido.`);
      }
      add(byRule, rule, count);
    }
  }
  return byRule;
}

/**
 * The inline directives (`eslint-disable`, `-line`, `-next-line`, in `//` or block comments) of some source text, per
 * rule they turn off; the description after `--` is not part of the list.
 */
export function directivesByRule(source: string): Counts {
  const byRule: Counts = new Map();
  const directive = /(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?(?=[\s*]|$)([^\n]*)/g;
  for (const match of source.matchAll(directive)) {
    const list = (match[1] ?? '')
      .split('*/')[0]!
      .split(/\s--\s|\s--$/)[0]!
      .trim();
    const rules = list ? list.split(',').map((r) => r.trim()) : [ALL_RULES];
    for (const rule of rules.filter(Boolean)) add(byRule, rule, 1);
  }
  return byRule;
}

export function total(byRule: ReadonlyMap<string, number>): number {
  let sum = 0;
  for (const count of byRule.values()) sum += count;
  return sum;
}

export interface Snapshot {
  /** The suppressions file; null when the commit does not have one. */
  suppressions: string | null;
  /** The inline directives of the commit's source. */
  inline: Counts;
}

export interface RatchetResult {
  ok: boolean;
  lines: string[];
}

/**
 * Compares the working tree with the base, rule by rule. When the base has no suppressions file (the first time),
 * only the inline directives are compared. The rules in `newRules` did not exist in the base: they do not count.
 */
export function checkRatchet(
  current: Snapshot,
  base: Snapshot,
  baseName: string,
  newRules: ReadonlySet<string> = new Set(),
): RatchetResult {
  const withFile = base.suppressions !== null;
  const now = combined(current, withFile);
  const before = combined(base, withFile);
  const started = [...now.all]
    .filter(([rule]) => newRules.has(rule))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rule, count]) => `${rule}: ${count}`);
  const grown = [...now.all]
    .filter(([rule, count]) => !newRules.has(rule) && count > (before.all.get(rule) ?? 0))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([rule, count]) =>
        `  ${rule}: ${before.all.get(rule) ?? 0} → ${count} (${now.file.get(rule) ?? 0} en ` +
        `${SUPPRESSIONS_FILE}, ${now.inline.get(rule) ?? 0} con eslint-disable)`,
    );
  const inFile =
    current.suppressions === null ? 0 : total(suppressionsByRule(current.suppressions));
  const summary = withFile
    ? `${total(now.all)} (en ${baseName}: ${total(before.all)})`
    : `${inFile} en ${SUPPRESSIONS_FILE} (${baseName} no lo tiene) y ${total(now.inline)} con ` +
      `eslint-disable (en ${baseName}: ${total(before.inline)})`;
  const fresh = started.length
    ? [`Reglas nuevas respecto de ${baseName} (no cuentan esta vez): ${started.join(', ')}.`]
    : [];
  if (grown.length === 0)
    return { ok: true, lines: [`Supresiones de ESLint: ${summary}.`, ...fresh] };
  return {
    ok: false,
    lines: [
      `Las supresiones de ESLint subieron respecto de ${baseName} en estas reglas:`,
      ...grown,
      'El código nuevo no puede agregar deuda, ni con un eslint-disable: arregla esas violaciones.',
      'Si arreglaste algo, corre `npx eslint . --prune-suppressions` para bajar el total.',
    ],
  };
}

function combined(s: Snapshot, withFile: boolean) {
  const file = withFile && s.suppressions !== null ? suppressionsByRule(s.suppressions) : new Map();
  const all: Counts = new Map(file);
  for (const [rule, count] of s.inline) add(all, rule, count);
  return { file, inline: s.inline, all };
}

function add(counts: Counts, rule: string, n: number) {
  counts.set(rule, (counts.get(rule) ?? 0) + n);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
