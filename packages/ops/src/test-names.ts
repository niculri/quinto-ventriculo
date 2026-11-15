// The test names rule (a test is named after the file it tests, in a __tests__ folder next to it) and the list of
// the tests that do not follow it yet, which may only get shorter.

export const TEST_NAMES_FILE = '.test-names.json';

const TEST = /\.test\.tsx?$/;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs'];

const isTestFile = (path: string) => TEST.test(path);

// `dir/__tests__/X.test.ts(x)` follows the rule when `dir/X` exists with one of the source extensions. A flow
// (`__tests__/*.flow.test.tsx`) is named after what it covers; a contract battery (*-contract.test.ts) stays next to
// what it checks.
export function followsRule(path: string, exists: (path: string) => boolean): boolean {
  if (path.endsWith('-contract.test.ts')) return true;
  const parts = path.split('/');
  const name = parts.pop()!;
  if (parts.pop() !== '__tests__') return false;
  if (name.endsWith('.flow.test.tsx')) return true;
  const base = [...parts, name.replace(TEST, '')].join('/');
  return SOURCE_EXTENSIONS.some((ext) => exists(base + ext));
}

export function breakingRule(
  files: readonly string[],
  exists: (path: string) => boolean,
): string[] {
  return files.filter((f) => isTestFile(f) && !followsRule(f, exists)).sort();
}

export function readExceptions(json: string): string[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) {
    throw new Error(`${TEST_NAMES_FILE} no es una lista de rutas.`);
  }
  return parsed;
}

export const writeExceptions = (list: readonly string[]) =>
  `${JSON.stringify([...list].sort(), null, 2)}\n`;

export interface TestNamesResult {
  ok: boolean;
  lines: string[];
}

// The list is exactly the tests that break the rule (an entry that follows it or is gone is an error too, so it can
// never be traded for a new one), and it cannot be longer than the base's: a test moved without following the rule
// keeps its place, a new one cannot take one.
export function checkTestNames(
  breaking: readonly string[],
  listed: readonly string[],
  atBase: readonly string[] | null,
  baseName: string,
): TestNamesResult {
  const unlisted = breaking.filter((f) => !listed.includes(f));
  const stale = listed.filter((f) => !breaking.includes(f));
  const lines: string[] = [];
  let ok = true;
  if (unlisted.length > 0) {
    ok = false;
    lines.push(
      `Pruebas que no siguen la regla de nombres (${unlisted.length}):`,
      ...unlisted.map((f) => `  ${f}`),
      'Una prueba se llama como el archivo que prueba y va en __tests__/ junto a él ' +
        '(X.ts → __tests__/X.test.ts); un flujo, __tests__/*.flow.test.tsx; un contrato, *-contract.test.ts.',
    );
  }
  if (stale.length > 0) {
    ok = false;
    lines.push(
      `${TEST_NAMES_FILE} trae ${stale.length} que ya cumplen la regla o no existen:`,
      ...stale.map((f) => `  ${f}`),
      'Sácalas con npm run test-names:baseline.',
    );
  }
  if (atBase !== null && listed.length > atBase.length) {
    ok = false;
    lines.push(
      `${TEST_NAMES_FILE} subió de ${atBase.length} a ${listed.length} respecto de ${baseName}: ` +
        'la lista solo baja.',
    );
  }
  if (ok) lines.push(`Nombres de pruebas: ${breaking.length} en la lista de excepciones.`);
  return { ok, lines };
}
