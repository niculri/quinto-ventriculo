// Tests for the git helpers of the ratchets, against a real repository made in a temporary folder.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseExists, git, parseBaseArgs, readAtBase } from '../gitBase';

let repo: string;
const sh = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], {
    cwd: repo,
    stdio: 'ignore',
  });

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'qv-git-base-'));
  sh('init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'a.txt'), 'before\n');
  sh('add', '.');
  sh('commit', '-q', '-m', 'first');
  sh('tag', 'v1');
  writeFileSync(join(repo, 'a.txt'), 'after\n');
  sh('commit', '-q', '-am', 'second');
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('git', () => {
  it('returns what git prints, and null when it fails (no repository, no such argument)', () => {
    expect(git(repo, ['log', '-1', '--format=%s'])).toBe('second\n');
    expect(git(repo, ['not-a-command'])).toBeNull();
    expect(git(tmpdir(), ['rev-parse', '--git-dir', '--no-such-flag'])).toBeNull();
  });
});

describe('the base commit', () => {
  it('exists for a branch, a tag or a commit, and not for a name git does not know', () => {
    expect(baseExists(repo, 'main')).toBe(true);
    expect(baseExists(repo, 'v1')).toBe(true);
    expect(baseExists(repo, 'origin/main')).toBe(false);
  });

  it('a tree object is not a base: it has to be a commit', () => {
    expect(baseExists(repo, 'v1^{tree}')).toBe(false);
  });

  it('reads a file as it was at the base, and null where it did not exist', () => {
    expect(readAtBase(repo, 'v1', 'a.txt')).toBe('before\n');
    expect(readAtBase(repo, 'main', 'a.txt')).toBe('after\n');
    expect(readAtBase(repo, 'v1', 'missing.txt')).toBeNull();
  });

  it('GitHub Actions requires the base, like the CI variable does', () => {
    expect(parseBaseArgs([], { GITHUB_ACTIONS: 'true' })?.required).toBe(true);
    expect(parseBaseArgs([], { GITHUB_ACTIONS: '' })?.required).toBe(false);
  });

  it('a value after --base that is another option is not a base', () => {
    expect(parseBaseArgs(['--base', '--require-base'], {})).toBeNull();
  });
});
