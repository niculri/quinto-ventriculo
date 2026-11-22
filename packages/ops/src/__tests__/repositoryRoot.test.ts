// Tests for how the commands find the repository's folder.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repositoryRoot } from '../repositoryRoot';

const THIS_REPOSITORY = resolve(import.meta.dirname, '../../../..');

describe('repositoryRoot', () => {
  afterEach(() => {
    vi.doUnmock('node:child_process');
    vi.resetModules();
  });

  it('is the top folder that git reports', () => {
    const fromGit = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    expect(repositoryRoot()).toBe(fromGit.trim());
  });

  it('without git (or outside a repository) it is the folder two above its package', async () => {
    vi.resetModules();
    vi.doMock('node:child_process', () => ({
      execFileSync: () => {
        throw new Error('not a git repository');
      },
    }));
    const { repositoryRoot: withoutGit } = await import('../repositoryRoot');
    expect(withoutGit()).toBe(THIS_REPOSITORY);
  });
});
