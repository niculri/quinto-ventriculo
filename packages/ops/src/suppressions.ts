// The lint ratchet: per rule, the ESLint suppressions plus the inline `eslint-disable` directives may go down, never
// up, with respect to a base commit. Counting per rule, not per file, lets a file move with its suppressions.

export const SUPPRESSIONS_FILE = 'eslint-suppressions.json';
export const ALL_RULES = '*';

export type Counts = Map<string, number>;

// A `qv/` rule whose file the base does not have is new: what it finds the first time is its starting debt, not
// growth. Any other rule counts as one the base already had.
export function localRuleFile(rule: string): string | null {
  const name = /^qv\/([a-z][a-z-]*)$/.exec(rule)?.[1];
  return name ? `packages/eslint-plugin/src/${name}.js` : null;
}

// The new rules: those of this repository's plugin whose file is in the working tree and not in the base. A rule
// whose file is not where localRuleFile looks (another name, a subfolder) is never new, so it cannot stay exempt.
export function newLocalRules(
  rules: Iterable<string>,
  inBase: (path: string) => boolean,
  inTree: (path: string) => boolean,
): Set<string> {
  return new Set(
    [...rules].filter((rule) => {
      const file = localRuleFile(rule);
      return file !== null && inTree(file) && !inBase(file);
    }),
  );
}

// ESLint writes { file: { rule: { count } } }.
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

// `eslint-disable`, `-line` and `-next-line`, in line or block comments; the description after `--` is not a rule.
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
  suppressions: string | null;
  inline: Counts;
}

export interface RatchetResult {
  ok: boolean;
  lines: string[];
}

// Without a suppressions file in the base, only the inline directives are compared; rules in `newRules` do not count.
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
