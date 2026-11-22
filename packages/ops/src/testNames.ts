// The test names rule: a test lives in a __tests__ folder next to what it tests and is named after it.

const TEST = /\.test\.tsx?$/;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs'];

const isTestFile = (path: string) => TEST.test(path);

// `dir/__tests__/X.test.ts(x)` follows the rule when `dir/X` exists with one of the source extensions. A flow
// (`__tests__/X.flow.test.ts(x)`) and a contract battery (`__tests__/X.contract.test.ts(x)`) are named after what they
// cover, and also live in a __tests__ folder.
export function followsRule(path: string, exists: (path: string) => boolean): boolean {
  const parts = path.split('/');
  const name = parts.pop()!;
  if (parts.pop() !== '__tests__') return false;
  if (/\.(flow|contract)\.test\.tsx?$/.test(name)) return true;
  const base = [...parts, name.replace(TEST, '')].join('/');
  return SOURCE_EXTENSIONS.some((ext) => exists(base + ext));
}

export function breakingRule(
  files: readonly string[],
  exists: (path: string) => boolean,
): string[] {
  return files.filter((f) => isTestFile(f) && !followsRule(f, exists)).sort();
}

export interface TestNamesResult {
  ok: boolean;
  lines: string[];
}

export function checkTestNames(breaking: readonly string[]): TestNamesResult {
  if (breaking.length === 0)
    return { ok: true, lines: ['Nombres de pruebas: todas siguen la regla.'] };
  return {
    ok: false,
    lines: [
      `Pruebas que no siguen la regla de nombres (${breaking.length}):`,
      ...breaking.map((f) => `  ${f}`),
      'Una prueba se llama como el archivo que prueba y va en __tests__/ junto a él ' +
        '(X.ts → __tests__/X.test.ts); un flujo, __tests__/<nombre>.flow.test.ts(x); un contrato, __tests__/<nombre>.contract.test.ts(x).',
    ],
  };
}
