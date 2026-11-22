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
const result = checkTestNames(breakingRule(files, (path) => existsSync(join(root, path))));
for (const line of result.lines) (result.ok ? console.log : console.error)(line);
if (!result.ok) process.exitCode = 1;
