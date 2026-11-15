// The test names rule (a test is named after the file it tests, in a __tests__ folder next to it) and the list of
// the tests that do not follow it yet, which may only get shorter.

export const TEST_NAMES_FILE = '.test-names.json';

const TEST = /\.test\.tsx?$/;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs'];

const isTestFile = (path: string) => TEST.test(path);

const isFlowOrContract = (path: string) =>
  path.endsWith('.flow.test.tsx') || path.endsWith('-contract.test.ts');

// `dir/__tests__/X.test.ts(x)` follows the rule when `dir/X` exists with one of the source extensions.
// Flows (*.flow.test.tsx) and contract batteries (*-contract.test.ts) are named after what they cover.
export function followsRule(path: string, exists: (path: string) => boolean): boolean {
  if (isFlowOrContract(path)) return true;
  const parts = path.split('/');
  const name = parts.pop()!;
  if (parts.pop() !== '__tests__') return false;
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

// Every test breaking the rule has to be in the list, and the list cannot be longer than the base's: a test moved
// without following the rule keeps its place in the list, a new one cannot take one.
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
        '(X.ts → __tests__/X.test.ts); un flujo, *.flow.test.tsx; un contrato, *-contract.test.ts.',
    );
  }
  if (atBase !== null && listed.length > atBase.length) {
    ok = false;
    lines.push(
      `${TEST_NAMES_FILE} subió de ${atBase.length} a ${listed.length} respecto de ${baseName}: ` +
        'la lista solo baja.',
    );
  }
  if (ok) {
    lines.push(
      `Nombres de pruebas: ${breaking.length} en la lista de excepciones` +
        (stale.length
          ? `; ${stale.length} ya la cumplen o no existen: npm run test-names:baseline las saca.`
          : '.'),
    );
  }
  return { ok, lines };
}
