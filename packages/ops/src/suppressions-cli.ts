// `npm run suppressions`: runs the lint ratchet of suppressions.ts against --base (origin/main by default).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseExists, git, missingBase, parseBaseArgs, readAtBase } from './git-base';
import { repositoryRoot } from './repository-root';
import {
  checkRatchet,
  directivesByRule,
  newLocalRules,
  suppressionsByRule,
  SUPPRESSIONS_FILE,
} from './suppressions';
import type { Snapshot } from './suppressions';

const SOURCES = ['*.ts', '*.tsx', '*.js', '*.mjs', '*.cjs'];
const root = repositoryRoot();
const args = parseBaseArgs(process.argv.slice(2), process.env);

if (!args) {
  console.error('Uso: npm run suppressions -- [--base <commit>] [--require-base]');
  process.exit(2);
}

if (!baseExists(root, args.base)) {
  const { message, fail } = missingBase(args, 'Supresiones de ESLint');
  (fail ? console.error : console.warn)(message);
  if (fail) process.exitCode = 1;
} else {
  const currentPath = join(root, SUPPRESSIONS_FILE);
  const grepNow = git(root, [
    'grep',
    '-h',
    '-I',
    '--untracked',
    'eslint-disable',
    '--',
    ...SOURCES,
  ]);
  const grepBase = git(root, ['grep', '-h', '-I', 'eslint-disable', args.base, '--', ...SOURCES]);
  const current: Snapshot = {
    suppressions: existsSync(currentPath) ? readFileSync(currentPath, 'utf8') : null,
    inline: directivesByRule(grepNow ?? ''),
  };
  const result = checkRatchet(
    current,
    {
      suppressions: readAtBase(root, args.base, SUPPRESSIONS_FILE),
      inline: directivesByRule(grepBase ?? ''),
    },
    args.base,
    newLocalRules(
      rulesOf(current),
      (file) => readAtBase(root, args.base, file) !== null,
      (file) => existsSync(join(root, file)),
    ),
  );
  for (const line of result.lines) (result.ok ? console.log : console.error)(line);
  if (!result.ok) process.exitCode = 1;
}

function rulesOf(current: Snapshot): string[] {
  return [
    ...(current.suppressions ? suppressionsByRule(current.suppressions).keys() : []),
    ...current.inline.keys(),
  ];
}
