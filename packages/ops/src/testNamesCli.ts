// `npm run test-names`: fails on a test that breaks the naming rule and is not in .test-names.json, or on a list
// longer than --base's; `--write-baseline` rewrites the list with the tests that break the rule today.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseExists, git, missingBase, parseBaseArgs, readAtBase } from './gitBase';
import { repositoryRoot } from './repositoryRoot';
import {
  breakingRule,
  checkTestNames,
  readExceptions,
  TEST_NAMES_FILE,
  writeExceptions,
} from './testNames';

const root = repositoryRoot();
const argv = process.argv.slice(2);
const args = parseBaseArgs(argv, process.env);
if (!args) {
  console.error('Uso: npm run test-names -- [--base <commit>] [--require-base] [--write-baseline]');
  process.exit(2);
}

const files = (git(root, ['ls-files', '--cached', '--others', '--exclude-standard']) ?? '')
  .split('\n')
  .filter((f) => f && existsSync(join(root, f)));
const breaking = breakingRule(files, (path) => existsSync(join(root, path)));
const path = join(root, TEST_NAMES_FILE);

if (argv.includes('--write-baseline')) {
  writeFileSync(path, writeExceptions(breaking));
  console.log(`${TEST_NAMES_FILE}: ${breaking.length} pruebas que todavía no siguen la regla.`);
  process.exit(0);
}

const listed = existsSync(path) ? readExceptions(readFileSync(path, 'utf8')) : [];
let atBase: string[] | null = null;
let failed = false;
if (!baseExists(root, args.base)) {
  const { message, fail } = missingBase(args, 'Lista de nombres de pruebas');
  (fail ? console.error : console.warn)(message);
  failed ||= fail;
} else {
  const text = readAtBase(root, args.base, TEST_NAMES_FILE);
  atBase = text === null ? null : readExceptions(text);
}

const result = checkTestNames(breaking, listed, atBase, args.base);
for (const line of result.lines) (result.ok ? console.log : console.error)(line);
if (!result.ok || failed) process.exitCode = 1;
