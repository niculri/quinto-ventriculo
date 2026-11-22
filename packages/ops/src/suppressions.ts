// The lint ratchet: per rule, the ESLint suppressions plus the inline `eslint-disable` directives may go down, never
// up, with respect to a base commit. Counting per rule, not per file, lets a file move with its suppressions.

export const SUPPRESSIONS_FILE = 'eslint-suppressions.json';
// `{ rule: count }`: the debt a rule starts with in the change that turns it on, not growth. It counts once: a rule
// the base already lists there, or that already had suppressions in the base, is checked as any other.
export const START_FILE = 'eslintSuppressionsStart.json';
export const ALL_RULES = '*';

export type Counts = Map<string, number>;

// A `qv/` rule whose file the base does not have is new: what it finds the first time is its starting debt, not
// growth. Any other rule counts as one the base already had.
export function localRuleFile(rule: string): string | null {
  const name = /^qv\/([a-z][a-z-]*)$/.exec(rule)?.[1];
  const file = name?.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return file ? `packages/eslint-plugin/src/${file}.js` : null;
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

// The rules of START_FILE that the base's START_FILE did not list, with the debt each may start with.
export function startingDebt(current: string | null, base: string | null): Map<string, number> {
  const read = (json: string | null) => {
    const parsed: unknown = json === null ? {} : JSON.parse(json);
    if (!isRecord(parsed)) throw new Error(`${START_FILE} no es un objeto JSON.`);
    return parsed;
  };
  const listed = read(base);
  const starts = new Map<string, number>();
  for (const [rule, count] of Object.entries(read(current))) {
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      throw new Error(`${START_FILE}: «${rule}» no tiene un número válido.`);
    }
    if (!(rule in listed)) starts.set(rule, count);
  }
  return starts;
}

// Starting debt belongs to the change that turns a rule on, which touches the ESLint configuration or a dependency.
// Without that, an entry in START_FILE would be a way to raise the total of any rule that has no suppressions yet.
const LINT_SETUP =
  /^(?:eslint[^/]*\.js|packages\/eslint-plugin\/.+|(?:.+\/)?package(?:-lock)?\.json)$/;

export function changesLintSetup(changed: readonly string[]): boolean {
  return changed.some((path) => LINT_SETUP.test(path));
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

// Without a suppressions file in the base, only the inline directives are compared. A rule in `newRules` may start
// with entries in the suppressions file, but never with an inline directive.
export function checkRatchet(
  current: Snapshot,
  base: Snapshot,
  baseName: string,
  newRules: ReadonlySet<string> = new Set(),
  starts: ReadonlyMap<string, number> = new Map(),
): RatchetResult {
  const withFile = base.suppressions !== null;
  const now = combined(current, withFile);
  const before = combined(base, withFile);
  // A rule starts with debt only if the base had none of it; `allowed` is how much.
  const allowance = (rule: string) =>
    (before.all.get(rule) ?? 0) === 0 ? starts.get(rule) : undefined;
  const started = [...now.all]
    .filter(([rule]) => newRules.has(rule) || allowance(rule) !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rule, count]) => `${rule}: ${count}`);
  const inlineGrew = (rule: string) => (now.inline.get(rule) ?? 0) > (before.inline.get(rule) ?? 0);
  const grown = [...now.all]
    .filter(([rule, count]) => {
      if (newRules.has(rule)) return inlineGrew(rule);
      const allowed = allowance(rule);
      if (allowed !== undefined) return inlineGrew(rule) || count > allowed;
      return count > (before.all.get(rule) ?? 0);
    })
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
  const file =
    withFile && s.suppressions !== null
      ? suppressionsByRule(s.suppressions)
      : new Map<string, number>();
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
