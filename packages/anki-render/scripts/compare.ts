/**
 * Compares @qv/anki-render with real Anki on any .apkg (for example, a real deck, whose golden file must
 * stay outside the repository):
 *
 *   PY=python3
 *   $PY packages/anki-render/scripts/golden.py <deck.apkg> /tmp/golden.json
 *   npm run compare -w @qv/anki-render -- <deck.apkg> /tmp/golden.json
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readApkgFile } from '@qv/anki-format';
import { compareWithAnki } from '../test/golden';
import type { GoldenCard } from '../test/golden';

const [apkg, goldenFile] = process.argv.slice(2);
if (!apkg || !goldenFile) {
  console.error('Uso: compare.ts <mazo.apkg> <golden.json>');
  process.exit(2);
}
const cwd = process.env.INIT_CWD ?? process.cwd();
const pkg = await readApkgFile(resolve(cwd, apkg));
const golden = JSON.parse(await readFile(resolve(cwd, goldenFile), 'utf8')) as GoldenCard[];
const r = compareWithAnki(pkg, golden);
console.log(`${r.equal} de ${r.total} tarjetas iguales a Anki.`);
if (r.missing.length) console.log(`Sin renderizar: ${r.missing.join(', ')}`);
for (const d of r.different.slice(0, 10)) {
  console.log(
    `\n✘ ${d.key} (${d.side})\n  nuestro: ${d.ours.slice(0, 400)}\n  anki:    ${d.anki.slice(0, 400)}`,
  );
}
process.exitCode = r.equal === r.total ? 0 : 1;
