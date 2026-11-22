// Tests reading the committed versions of a folder from git: what it finds, what it skips and how it fails.
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitHistory, parseBatch } from '../gitHistory';

const REAL_GIT = execFileSync('which', ['git']).toString().trim();
let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'qv-git-'));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(folder, { recursive: true, force: true });
});

const git = (...args: string[]) =>
  execFileSync(REAL_GIT, ['-c', 'user.email=t@t', '-c', 'user.name=t', '-C', folder, ...args], {
    stdio: 'pipe',
  });

const commit = async (files: Record<string, string>, message = 'c') => {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(folder, path, '..'), { recursive: true });
    await writeFile(join(folder, path), text);
  }
  git('add', '-A');
  git('commit', '-q', '-m', message);
};

/** A `git` that behaves as the real one except where `script` says otherwise, first on the PATH. */
async function fakeGit(script: string) {
  const bin = await mkdtemp(join(tmpdir(), 'qv-fakegit-'));
  await writeFile(join(bin, 'git'), `#!/bin/sh\n${script}\nexec ${REAL_GIT} "$@"\n`);
  await chmod(join(bin, 'git'), 0o755);
  vi.stubEnv('PATH', `${bin}:${process.env.PATH ?? ''}`);
  return bin;
}

describe('gitHistory', () => {
  it('a folder that is not in a repository has no history', async () => {
    expect(await gitHistory(folder)).toBeNull();
  });

  it('every committed version of a file, newest first, also for a file at the root of the folder', async () => {
    git('init', '-q', '-b', 'main');
    await commit({ 'raiz.json': '1', 'dir/a.json': 'a1' });
    await commit({ 'raiz.json': '2', 'dir/a.json': 'a2' });
    const history = (await gitHistory(folder))!;
    expect(history.shallow).toBe(false);
    expect(await history.versions('raiz.json')).toHaveLength(2);
    expect((await history.versions('raiz.json')).sort()).toEqual(['1', '2']);
    expect((await history.versions('dir/a.json')).sort()).toEqual(['a1', 'a2']);
    expect(await history.versions('dir/no.json')).toEqual([]);
  });

  it('lists the .json files that a folder ever had, not those of its subfolders or of other kinds', async () => {
    git('init', '-q', '-b', 'main');
    await commit({ 'd/a.json': '1', 'd/b.txt': '1', 'd/sub/c.json': '1', 'otra/e.json': '1' });
    const history = (await gitHistory(folder))!;
    expect(await history.committedFiles('d')).toEqual(['a.json']);
    expect(await history.committedFiles('no-hay')).toEqual([]);
  });

  it('a repository without commits has nothing to compare with', async () => {
    git('init', '-q', '-b', 'main');
    const history = (await gitHistory(folder))!;
    expect(await history.versions('d/a.json')).toEqual([]);
    expect(await history.committedFiles('d')).toEqual([]);
  });

  it('a git that cannot tell whether the repository is shallow is read as a full one', async () => {
    git('init', '-q', '-b', 'main');
    await commit({ 'a.json': '1' });
    await fakeGit('case "$*" in *--is-shallow-repository*) exit 1;; esac');
    expect((await gitHistory(folder))!.shallow).toBe(false);
  });

  it('a clone with a shallow file says it is shallow', async () => {
    git('init', '-q', '-b', 'main');
    await commit({ 'a.json': '1' });
    await fakeGit('case "$*" in *--is-shallow-repository*) echo true; exit 0;; esac');
    expect((await gitHistory(folder))!.shallow).toBe(true);
  });

  it('if git fails to answer for the blobs, the error says its code and what it said, or just its code', async () => {
    git('init', '-q', '-b', 'main');
    await commit({ 'd/a.json': '1' });
    const history = (await gitHistory(folder))!;
    await history.committedFiles('d');
    await fakeGit('case "$*" in *cat-file*) echo "algo salió mal" >&2; exit 3;; esac');
    await expect(history.versions('d/a.json')).rejects.toThrow(
      'git cat-file terminó con el código 3: algo salió mal',
    );
    await fakeGit('case "$*" in *cat-file*) exit 4;; esac');
    await expect(history.versions('d/a.json')).rejects.toThrow(
      'git cat-file terminó con el código 4.',
    );
  });

  it('if git cannot even be started the error is the system’s', async () => {
    git('init', '-q', '-b', 'main');
    await commit({ 'd/a.json': '1' });
    const history = (await gitHistory(folder))!;
    await history.committedFiles('d');
    vi.stubEnv('PATH', await mkdtemp(join(tmpdir(), 'qv-nogit-')));
    await expect(history.versions('d/a.json')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('a short answer from git is an error of the environment', async () => {
    git('init', '-q', '-b', 'main');
    await commit({ 'd/a.json': '1' });
    const history = (await gitHistory(folder))!;
    await history.committedFiles('d');
    await fakeGit('case "$*" in *cat-file*) cat >/dev/null; exit 0;; esac');
    await expect(history.versions('d/a.json')).rejects.toMatchObject({
      kind: 'environment',
      message: 'git cat-file respondió menos de lo pedido.',
    });
  });
});

describe('parseBatch', () => {
  const blob = (text: string) => `${'a'.repeat(40)} blob ${Buffer.byteLength(text)}\n${text}\n`;

  it('reads each answer in order, with texts that have new lines and accents', () => {
    const out = Buffer.from(blob('uno\ndos') + blob('ñandú'));
    expect(parseBatch(out, 2)).toEqual(['uno\ndos', 'ñandú']);
  });

  it('an object that is not there is null and the next answer is still read', () => {
    const out = Buffer.from(`${'a'.repeat(40)}:ruta missing\n${blob('x')}`);
    expect(parseBatch(out, 2)).toEqual([null, 'x']);
  });

  it('an object that is not a file (a folder) is null, and its content is skipped', () => {
    const out = Buffer.from(`${'a'.repeat(40)} tree 4\nabcd\n${blob('x')}`);
    expect(parseBatch(out, 2)).toEqual([null, 'x']);
  });

  it('fewer answers than requested is an error', () => {
    expect(() => parseBatch(Buffer.from(blob('x')), 2)).toThrow(
      'git cat-file respondió menos de lo pedido.',
    );
    expect(parseBatch(Buffer.alloc(0), 0)).toEqual([]);
  });
});
