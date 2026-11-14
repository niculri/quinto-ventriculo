// `npm run deps`: fails on an import cycle not in .import-cycles.json, or on a baseline that gained keys over --base;
// `--write-baseline` rewrites it.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { count, currentCycles, CYCLES_FILE, gained, readBaseline, writeBaseline } from './cycles';
import type { Baseline, Cruise } from './cycles';
import { baseExists, missingBase, parseBaseArgs, readAtBase } from './git-base';
import { repositoryRoot } from './repository-root';

const root = repositoryRoot();
const argv = process.argv.slice(2);
const args = parseBaseArgs(argv, process.env);
if (!args) {
  console.error('Uso: npm run deps -- [--base <commit>] [--require-base] [--write-baseline]');
  process.exit(2);
}

const packages = readdirSync(join(root, 'packages'))
  .map((name) => `packages/${name}/src`)
  .filter((dir) => existsSync(join(root, dir)));
const cruise = spawnSync(
  join(root, 'node_modules', '.bin', 'depcruise'),
  ['apps/web/src', 'apps/api/src', ...packages, '--output-type', 'json'],
  { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
);
if (!cruise.stdout) {
  console.error(
    `dependency-cruiser no respondió.\n${cruise.stderr || (cruise.error?.message ?? '')}`,
  );
  process.exit(2);
}
const found = currentCycles(JSON.parse(cruise.stdout) as Cruise);
const path = join(root, CYCLES_FILE);

if (argv.includes('--write-baseline')) {
  writeFileSync(path, writeBaseline(found));
  console.log(
    `${CYCLES_FILE}: ${found.files.length} entre archivos y ${found.folders.length} entre carpetas.`,
  );
  process.exit(0);
}

const known: Baseline = existsSync(path)
  ? readBaseline(readFileSync(path, 'utf8'))
  : { files: [], folders: [] };
let failed = false;
const list = (b: Baseline) => [...b.files, ...b.folders].map((k) => `  ${k}`);

const fresh = gained(found, known);
if (count(fresh) > 0) {
  failed = true;
  console.error(`Ciclos de imports nuevos (${count(fresh)}):`, ...list(fresh).map((l) => `\n${l}`));
  console.error(
    'Rompe el ciclo: mueve lo compartido a una capa más baja en vez de importar de vuelta.',
  );
} else {
  const gone = count(gained(known, found));
  console.log(
    `Ciclos de imports: ninguno nuevo (${count(found)} conocidos)` +
      (gone ? `; ${gone} ya no están: npm run deps:baseline los saca.` : '.'),
  );
}

if (!baseExists(root, args.base)) {
  const { message, fail } = missingBase(args, 'Línea base de ciclos');
  (fail ? console.error : console.warn)(message);
  failed ||= fail;
} else {
  const atBase = readAtBase(root, args.base, CYCLES_FILE);
  const grown = atBase === null ? null : gained(known, readBaseline(atBase));
  if (grown && count(grown) > 0) {
    failed = true;
    console.error(
      `${CYCLES_FILE} ganó ${count(grown)} ciclos respecto de ${args.base} (no se agregan: se rompen):`,
      ...list(grown).map((l) => `\n${l}`),
    );
  }
}

if (failed) process.exitCode = 1;
