// `npm run suppressions [-- --base <rev>] [--require-base]`: fails if, for some rule, the ESLint suppressions plus the
// inline `eslint-disable` directives grew with respect to <rev> (origin/main by default). See suppressions.ts.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseExists, git, missingBase, parseBaseArgs, readAtBase } from './git-base';
import { repositoryRoot } from './repository-root';
import {
  checkRatchet,
  directivesByRule,
  localRuleFile,
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
    newLocalRules(current, args.base),
  );
  for (const line of result.lines) (result.ok ? console.log : console.error)(line);
  if (!result.ok) process.exitCode = 1;
}

/** The rules of this repository's plugin that the base does not have yet (see localRuleFile). */
function newLocalRules(current: Snapshot, base: string): Set<string> {
  const rules = [
    ...(current.suppressions ? suppressionsByRule(current.suppressions).keys() : []),
    ...current.inline.keys(),
  ];
  return new Set(
    rules.filter((rule) => {
      const file = localRuleFile(rule);
      return file !== null && readAtBase(root, base, file) === null;
    }),
  );
}
