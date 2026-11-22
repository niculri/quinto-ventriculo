// `npm run test-names`: fails on a test that is not in a __tests__ folder or not named after what it tests.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { git } from './gitBase';
import { repositoryRoot } from './repositoryRoot';
import { breakingRule, checkTestNames } from './testNames';

const root = repositoryRoot();
const files = (git(root, ['ls-files', '--cached', '--others', '--exclude-standard']) ?? '')
  .split('\n')
  .filter((f) => f && existsSync(join(root, f)));
// Exactly as the listing spells it: `existsSync` ignores the case on macOS and the CI does not.
const known = new Set(files);
const result = checkTestNames(breakingRule(files, (path) => known.has(path)));
for (const line of result.lines) (result.ok ? console.log : console.error)(line);
if (!result.ok) process.exitCode = 1;
