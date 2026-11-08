// Step 2.4: the two guards of the pre-push hook, with real pushes to a bare repository in a temporary folder.
// - The checks against the real material are required only where `git config qv.requirePrivate` is true (the owner's
//   clone): anybody else pushes without the private repository.
// - If the private repository has its list of forbidden patterns (tests/prohibidos.txt), a push that carries one of
//   them, in any of its commits, stops before anything is sent; without the list, the hook goes on.
// The slow checks (typecheck, lint, Vitest) are a fake npm here, which writes down QV_REQUIRE_PRIVATE.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repositoryRoot } from './repository-root';

let root: string;
let code: string;
let npmLog: string;
let env: NodeJS.ProcessEnv;

const run = (cmd: string, args: string[], cwd = code) =>
  spawnSync(cmd, args, { cwd, env, encoding: 'utf8' });
const git = (...args: string[]) => {
  const r = run('git', args);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};
const commit = (file: string, text: string, message = 'cambio') => {
  writeFileSync(join(code, file), text);
  git('add', '-A');
  git('commit', '-q', '-m', message);
};
const push = () => run('git', ['push', 'origin', 'main']);
const remoteHead = () =>
  run('git', ['rev-parse', '--verify', '--quiet', 'main'], join(root, 'remote.git')).stdout.trim();
const npmCalls = () => {
  try {
    return readFileSync(npmLog, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
};
const privateList = (patterns: string) => {
  mkdirSync(join(root, 'quinto-ventriculo-privado', 'tests'), { recursive: true });
  writeFileSync(join(root, 'quinto-ventriculo-privado', 'tests', 'prohibidos.txt'), patterns);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'qv-pre-push-'));
  code = join(root, 'code');
  npmLog = join(root, 'npm.log');
  mkdirSync(join(code, '.githooks'), { recursive: true });
  mkdirSync(join(root, 'bin'));
  for (const f of ['pre-push', 'forbidden.mjs']) {
    copyFileSync(join(repositoryRoot(), '.githooks', f), join(code, '.githooks', f));
  }
  chmodSync(join(code, '.githooks', 'pre-push'), 0o755);
  writeFileSync(
    join(root, 'bin', 'npm'),
    `#!/bin/sh\necho "npm $* QV_REQUIRE_PRIVATE=\${QV_REQUIRE_PRIVATE:-}" >> "${npmLog}"\nexit 0\n`,
  );
  chmodSync(join(root, 'bin', 'npm'), 0o755);
  // Without CI (the hook does nothing there), with the fake npm first and no private repository of the computer.
  const skip = new Set(['CI', 'GITHUB_ACTIONS', 'QV_PRIVATE_DIR', 'QV_REQUIRE_PRIVATE', 'GIT_DIR']);
  env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !skip.has(name)));
  env.PATH = `${join(root, 'bin')}:${process.env.PATH ?? ''}`;
  run('git', ['init', '-q', '--bare', join(root, 'remote.git')], root);
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Persona de Prueba');
  git('config', 'user.email', 'persona@example.com');
  git('config', 'core.hooksPath', '.githooks');
  git('config', 'commit.gpgsign', 'false');
  // The hook's own files are not part of what the tests push (its comments have an example email).
  mkdirSync(join(code, '.git', 'info'), { recursive: true });
  writeFileSync(join(code, '.git', 'info', 'exclude'), '.githooks/\n');
  git('remote', 'add', 'origin', join(root, 'remote.git'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the pre-push hook (step 2.4)', () => {
  it('somebody without the private repository nor the setting pushes: the real-material checks are not required', () => {
    commit('a.ts', 'export const a = 1;\n');
    const r = push();
    expect(r.status, r.stderr).toBe(0);
    expect(remoteHead()).toBe(git('rev-parse', 'HEAD').trim());
    expect(npmCalls()).toContain('npm test --silent QV_REQUIRE_PRIVATE=');
    expect(npmCalls().some((c) => c.endsWith('=1'))).toBe(false);
  });

  it('with qv.requirePrivate the checks run with QV_REQUIRE_PRIVATE=1', () => {
    git('config', 'qv.requirePrivate', 'true');
    commit('a.ts', 'export const a = 1;\n');
    const r = push();
    expect(r.status, r.stderr).toBe(0);
    expect(npmCalls()).toContain('npm test --silent QV_REQUIRE_PRIVATE=1');
    // Without the list there is nothing to check, and the owner's clone says so.
    expect(r.stderr).toMatch(/no se revisó si el push trae datos prohibidos/);
  });

  it('a forbidden email stops the push before anything is sent, and is not printed whole', () => {
    privateList('# comentario\n\nfulano\\.real\nsecreta s\\.a\\.\n');
    commit('a.ts', 'export const a = 1;\n');
    expect(push().status).toBe(0);
    const before = remoteHead();
    const calls = npmCalls().length;
    commit('b.ts', "export const owner = 'fulano.real@ug.uchile.cl';\n");
    const r = push();
    expect(r.status).not.toBe(0);
    expect(remoteHead()).toBe(before);
    expect(npmCalls()).toHaveLength(calls); // stopped before the slow checks
    expect(r.stderr).toMatch(/trae datos que no pueden ir a este repositorio/);
    expect(r.stderr).toMatch(/b\.ts:1 · patrón de la línea 3: .*f•••@ug\.uchile\.cl/);
    expect(r.stderr).not.toContain('fulano.real@');
  });

  it('reads every commit of the push, its message and its author, not only the final tree', () => {
    privateList('secreta s\\.a\\.\nfulano\\.real\n');
    commit('base.ts', 'export const base = 0;\n');
    expect(push().status).toBe(0);
    commit('a.ts', '// Secreta S.A.\n');
    commit('a.ts', '// limpio\n'); // the tree is clean again, the history is not
    let r = push();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/a\.ts:1 · patrón de la línea 1: \/\/ Secreta S\.A\./);
    git('reset', '-q', '--hard', 'HEAD~2');
    git('commit', '-q', '--allow-empty', '-m', 'Pedido de fulano.real@ug.uchile.cl');
    r = push();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/mensaje · patrón de la línea 2: Pedido de f•••@ug\.uchile\.cl/);
    git('reset', '-q', '--hard', 'HEAD~1');
    git(
      '-c',
      'user.email=fulano.real@example.com',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'otro cambio',
    );
    r = push();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/autor o committer · patrón de la línea 2: f•••@example\.com/);
  });

  it('only what the remote does not have is read, and without the list the hook goes on', () => {
    commit('a.ts', '// Secreta S.A.\n');
    expect(push().status).toBe(0); // no list yet
    privateList('secreta s\\.a\\.\n');
    commit('b.ts', 'export const b = 2;\n');
    const r = push();
    expect(r.status, r.stderr).toBe(0); // a.ts is already in the remote
    expect(remoteHead()).toBe(git('rev-parse', 'HEAD').trim());
  });
});
