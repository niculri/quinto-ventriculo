import { describe, expect, it } from 'vitest';
import {
  ciVerdict,
  deploy,
  dirtyFiles,
  flagsTakenByNpm,
  githubRepository,
  npmFlagsMessage,
  parseArgs,
  versionMessage,
} from './deploy';
import type { CiRun, CommandResult, DeployEnvironment, DeployOptions } from './deploy';

const SHA = 'd27b0b30eacc61eaf26b507f0768d35b15a28a4d';
const OTHER = '8f7c631f22c3ad4d6f036cc79b9248a81e94f1a0';

const run = (over: Partial<CiRun> = {}): CiRun => ({
  databaseId: 1,
  status: 'completed',
  conclusion: 'success',
  event: 'push',
  createdAt: '2026-11-08T01:49:23Z',
  url: 'https://github.com/niculri/quinto-ventriculo/actions/runs/1',
  headSha: SHA,
  headBranch: 'main',
  ...over,
});

interface World {
  /** `git status -z`; each call takes the next one (the last one repeats), to change it while the CI is awaited. */
  status: string[];
  head: string;
  /** HEAD from the second time it is read (the checks right before building and deploying), if it moved. */
  laterHead?: string;
  origin: string;
  remote: string;
  /** HEAD is an ancestor of origin/main (behind). */
  behind: boolean;
  fetchFails: boolean;
  /** Each call to `gh run list` takes the next answer (the last one repeats). */
  ci: (CiRun[] | 'gh-error')[];
  /** If set, `gh run list --commit <sha>` answers with this (and `ci` is not used). */
  ciBySha?: Record<string, CiRun[]>;
  /** main from HEAD back (first parent), with the files each commit changed. Default: HEAD changed code. */
  history?: { sha: string; files: string[] }[];
  envFile: string | null;
  /** Other files of the repository (by path). */
  files?: Record<string, string>;
  /** Variables set in the shell. */
  shell?: string[];
  buildCode: number;
  wranglerCode: number;
  smokeOk: boolean;
}

const good = (over: Partial<World> = {}): World => ({
  status: ['?? docs/plan/notes.md\0?? .claude/specs/in-progress/task.md\0'],
  head: SHA,
  origin: 'https://github.com/niculri/quinto-ventriculo.git',
  remote: SHA,
  behind: false,
  fetchFails: false,
  ci: [[run()]],
  envFile:
    'VITE_USERS_SUPABASE_URL=https://x.supabase.co\nVITE_USERS_SUPABASE_PUBLISHABLE_KEY=sb_x\n',
  buildCode: 0,
  wranglerCode: 0,
  smokeOk: true,
  ...over,
});

function fake(world: World) {
  const logs: string[] = [];
  const streamed: { command: string; args: readonly string[]; cwd?: string }[] = [];
  let clock = 0;
  let ghCalls = 0;
  let statusCalls = 0;
  let headCalls = 0;
  const ghArgs: (readonly string[])[] = [];
  const ok = (stdout: string): CommandResult => ({ code: 0, stdout, stderr: '' });
  const env: DeployEnvironment = {
    capture: async (command, args) => {
      const a = args.join(' ');
      if (command === 'git') {
        if (a === 'rev-parse --show-toplevel') return ok('/repo\n');
        if (a === 'status --porcelain=v1 -z --untracked-files=all') {
          return ok(world.status[Math.min(statusCalls++, world.status.length - 1)]!);
        }
        if (a === 'remote get-url origin') return ok(`${world.origin}\n`);
        if (a.startsWith('fetch')) {
          return world.fetchFails
            ? { code: 128, stdout: '', stderr: 'Could not resolve host' }
            : ok('');
        }
        if (a === 'rev-parse HEAD') {
          return ok(`${headCalls++ > 0 && world.laterHead ? world.laterHead : world.head}\n`);
        }
        if (a === 'rev-parse origin/main') return ok(`${world.remote}\n`);
        if (a.startsWith('merge-base'))
          return { code: world.behind ? 0 : 1, stdout: '', stderr: '' };
        if (a === 'log -1 --format=%s') return ok('Cierra el paso 1.8\n');
        const history = world.history ?? [{ sha: world.head, files: ['apps/api/src/app.ts'] }];
        if (a.startsWith('rev-list --first-parent')) {
          const max = Number(/--max-count=(\d+)/.exec(a)![1]);
          return ok(
            `${history
              .slice(0, max)
              .map((c) => c.sha)
              .join('\n')}\n`,
          );
        }
        if (a.startsWith('diff-tree')) {
          const c = history.find((h) => a.endsWith(h.sha))!;
          return ok(c.files.map((f) => `${f}\0`).join(''));
        }
      }
      if (command === 'gh') {
        ghArgs.push(args);
        if (world.ciBySha) {
          ghCalls++;
          const sha = args[args.indexOf('--commit') + 1]!;
          return ok(JSON.stringify(world.ciBySha[sha] ?? []));
        }
        const answer = world.ci[Math.min(ghCalls++, world.ci.length - 1)]!;
        if (answer === 'gh-error') return { code: 1, stdout: '', stderr: 'gh: not logged in' };
        return ok(JSON.stringify(answer));
      }
      throw new Error(`unexpected command: ${command} ${a}`);
    },
    stream: async (command, args, cwd) => {
      streamed.push({ command, args, ...(cwd ? { cwd } : {}) });
      return command === 'npm' ? world.buildCode : world.wranglerCode;
    },
    readFile: async (path) =>
      path === 'apps/web/.env.local' ? world.envFile : (world.files?.[path] ?? null),
    hasVariable: (name) => world.shell?.includes(name) ?? false,
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    log: (line) => logs.push(line),
    smoke: async () => world.smokeOk,
  };
  return { env, logs, streamed, ghArgs, ghCalls: () => ghCalls };
}

const options = (over: Partial<DeployOptions> = {}): DeployOptions => ({
  dryRun: false,
  skipCiCheck: false,
  waitMinutes: null,
  smokeUrl: 'https://www.quintoventriculo.cl',
  ...over,
});

const text = (logs: string[]) => logs.join('\n');

describe('npm run deploy refuses', () => {
  it('with uncommitted changes in tracked files', async () => {
    const f = fake(good({ status: [' M apps/api/src/app.ts\0M  docs/configuracion.md\0'] }));
    expect(await deploy(f.env, options())).toBe(1);
    expect(text(f.logs)).toContain('Hay cambios sin commit');
    expect(text(f.logs)).toContain('apps/api/src/app.ts');
    expect(f.streamed).toEqual([]);
  });

  it('with untracked files that the build could take (not in docs/ nor .claude/)', async () => {
    const f = fake(
      good({
        status: ['?? apps/web/src/new.tsx\0?? postcss.config.js\0?? docs/notes.md\0'],
      }),
    );
    expect(await deploy(f.env, options())).toBe(1);
    expect(text(f.logs)).toContain('apps/web/src/new.tsx');
    expect(text(f.logs)).toContain('postcss.config.js');
    expect(text(f.logs)).not.toContain('docs/notes.md');
    expect(f.streamed).toEqual([]);
  });

  it('with an untracked file whose name has a space or an accent (git would quote it without -z)', async () => {
    const f = fake(good({ status: ['?? apps/web/src/con espacio.ts\0?? apps/web/src/café.ts\0'] }));
    expect(await deploy(f.env, options())).toBe(1);
    expect(text(f.logs)).toContain('apps/web/src/con espacio.ts');
    expect(text(f.logs)).toContain('apps/web/src/café.ts');
  });

  it('when origin is not GitHub (the CI could not be asked for)', async () => {
    const f = fake(good({ origin: '/Users/someone/mirror.git' }));
    expect(await deploy(f.env, options())).toBe(1);
    expect(text(f.logs)).toContain('origin no apunta a un repositorio de GitHub');
    expect(f.ghCalls()).toBe(0);
  });

  it('when the tree changes while the CI is awaited (another session in the same folder)', async () => {
    const clean = '?? docs/plan/x.md\0';
    const running = [run({ status: 'in_progress', conclusion: '' })];
    const f = fake(good({ status: [clean, ' M apps/web/src/app.tsx\0'], ci: [running, [run()]] }));
    expect(await deploy(f.env, options({ waitMinutes: 30 }))).toBe(1);
    expect(text(f.logs)).toContain('Antes de construir: Hay cambios sin commit');
    expect(f.streamed).toEqual([]);
  });

  it('when HEAD moves before deploying', async () => {
    const f = fake(good({ laterHead: OTHER }));
    expect(await deploy(f.env, options())).toBe(1);
    expect(text(f.logs)).toContain(`HEAD pasó de ${SHA.slice(0, 7)} a ${OTHER.slice(0, 7)}`);
    expect(f.streamed).toEqual([]);
  });

  it('when the tree changes during the build (nothing is deployed)', async () => {
    const clean = '?? docs/plan/x.md\0';
    const f = fake(good({ status: [clean, clean, '?? apps/api/src/new.ts\0'] }));
    expect(await deploy(f.env, options())).toBe(1);
    expect(text(f.logs)).toContain('Después del build, antes de desplegar');
    expect(f.streamed.map((s) => s.command)).toEqual(['npm']);
  });

  it('with a commit that is not pushed', async () => {
    const f = fake(good({ head: SHA, remote: OTHER }));
    expect(await deploy(f.env, options())).toBe(1);
    expect(text(f.logs)).toContain('falta el push');
    expect(f.ghCalls()).toBe(0);
    expect(f.streamed).toEqual([]);
  });

  it('when the local copy is behind origin/main', async () => {
    const f = fake(good({ head: OTHER, remote: SHA, behind: true }));
    expect(await deploy(f.env, options())).toBe(1);
    expect(text(f.logs)).toContain('git pull');
  });

  it('when GitHub cannot be reached', async () => {
    const f = fake(good({ fetchFails: true }));
    expect(await deploy(f.env, options())).toBe(1);
    expect(text(f.logs)).toContain('No pude leer origin/main');
  });

  it('when the CI failed', async () => {
    const f = fake(good({ ci: [[run({ conclusion: 'failure' })]] }));
    expect(await deploy(f.env, options())).toBe(1);
    expect(text(f.logs)).toContain('terminó en «failure»');
    expect(f.streamed).toEqual([]);
  });

  it('when the CI was cancelled (and says how to run it again)', async () => {
    const f = fake(good({ ci: [[run({ conclusion: 'cancelled', databaseId: 42 })]] }));
    expect(await deploy(f.env, options())).toBe(1);
    expect(text(f.logs)).toContain('gh run rerun 42');
  });

  it('when the CI is still running, without --wait (it does not wait)', async () => {
    const f = fake(good({ ci: [[run({ status: 'in_progress', conclusion: '' })]] }));
    expect(await deploy(f.env, options())).toBe(1);
    expect(text(f.logs)).toContain('todavía corre');
    expect(text(f.logs)).toContain('--wait');
    expect(f.ghCalls()).toBe(1);
  });

  it('when GitHub has no CI run for the commit', async () => {
    const f = fake(good({ ci: [[]] }));
    expect(await deploy(f.env, options())).toBe(1);
    expect(text(f.logs)).toContain('todavía no tiene una corrida');
  });

  it('when gh does not work', async () => {
    const f = fake(good({ ci: ['gh-error'] }));
    expect(await deploy(f.env, options())).toBe(1);
    expect(text(f.logs)).toContain('gh auth status');
  });

  it('when apps/web/.env.local is missing or incomplete', async () => {
    const missing = fake(good({ envFile: null }));
    expect(await deploy(missing.env, options())).toBe(1);
    expect(text(missing.logs)).toContain('Falta apps/web/.env.local');
    const partial = fake(good({ envFile: 'VITE_USERS_SUPABASE_URL=https://x.supabase.co\n' }));
    expect(await deploy(partial.env, options())).toBe(1);
    expect(text(partial.logs)).toContain('VITE_USERS_SUPABASE_PUBLISHABLE_KEY');
    expect(text(partial.logs)).not.toContain('x.supabase.co');
    expect(partial.streamed).toEqual([]);
  });

  it('when the shell or .env.production would win over apps/web/.env.local in the build', async () => {
    const shell = fake(good({ shell: ['VITE_USERS_SUPABASE_URL'] }));
    expect(await deploy(shell.env, options())).toBe(1);
    expect(text(shell.logs)).toContain('unset VITE_USERS_SUPABASE_URL');
    const file = fake(
      good({
        files: { 'apps/web/.env.production.local': 'VITE_USERS_SUPABASE_URL=https://draft.co\n' },
      }),
    );
    expect(await deploy(file.env, options())).toBe(1);
    expect(text(file.logs)).toContain(
      'apps/web/.env.production.local define VITE_USERS_SUPABASE_URL',
    );
    expect(text(file.logs)).not.toContain('draft.co');
    expect(file.streamed).toEqual([]);
  });

  it('when --wait runs out', async () => {
    const f = fake(good({ ci: [[run({ status: 'queued', conclusion: '' })]] }));
    expect(await deploy(f.env, options({ waitMinutes: 1 }))).toBe(1);
    expect(text(f.logs)).toContain('ya pasaron los 1 min');
    expect(f.ghCalls()).toBeGreaterThan(1);
    expect(f.streamed).toEqual([]);
  });
});

describe('npm run deploy, with everything in order', () => {
  it('asks GitHub for the CI of that commit, on main, of ci.yml, in the repository of origin', async () => {
    const f = fake(good());
    expect(await deploy(f.env, options({ dryRun: true }))).toBe(0);
    const args = f.ghArgs[0]!;
    const value = (flag: string) => args[args.indexOf(flag) + 1];
    expect(value('--repo')).toBe('niculri/quinto-ventriculo');
    expect(value('--workflow')).toBe('ci.yml');
    expect(value('--commit')).toBe(SHA);
    expect(value('--branch')).toBe('main');
    expect(value('--json')).toContain('headSha');
  });

  it('does not take a green run of another commit or of another branch, even if gh returns it', async () => {
    const f = fake(
      good({
        ci: [
          [run({ headSha: OTHER }), run({ headBranch: 'feature' }), run({ event: 'pull_request' })],
        ],
      }),
    );
    expect(await deploy(f.env, options())).toBe(1);
    expect(text(f.logs)).toContain('todavía no tiene una corrida');
    expect(f.streamed).toEqual([]);
  });

  it('builds, deploys with the commit in the message and runs the smoke test', async () => {
    const f = fake(good());
    expect(await deploy(f.env, options())).toBe(0);
    expect(f.streamed).toEqual([
      { command: 'npm', args: ['run', 'build'] },
      {
        command: 'npx',
        args: ['wrangler', 'deploy', '--message', 'd27b0b3 Cierra el paso 1.8'],
        cwd: 'apps/api',
      },
    ]);
    expect(text(f.logs)).toContain('la prueba de humo pasó');
  });

  it('--dry-run checks everything and stops before building', async () => {
    const f = fake(good());
    expect(await deploy(f.env, options({ dryRun: true }))).toBe(0);
    expect(f.streamed).toEqual([]);
    expect(text(f.logs)).toContain('--dry-run: todo en orden');
  });

  it('--wait waits for a running CI until it is green', async () => {
    const running = [run({ status: 'in_progress', conclusion: '' })];
    const f = fake(good({ ci: [[], running, running, [run()]] }));
    expect(await deploy(f.env, options({ waitMinutes: 30, dryRun: true }))).toBe(0);
    expect(f.ghCalls()).toBe(4);
  });

  it('a build that fails deploys nothing', async () => {
    const f = fake(good({ buildCode: 1 }));
    expect(await deploy(f.env, options())).toBe(1);
    expect(f.streamed.map((s) => s.command)).toEqual(['npm']);
  });

  it('a failed smoke test says how to roll back', async () => {
    const f = fake(good({ smokeOk: false }));
    expect(await deploy(f.env, options())).toBe(1);
    expect(text(f.logs)).toContain('wrangler rollback');
  });

  it('--skip-ci-check does not ask GitHub, says it loudly and writes it in the version', async () => {
    const f = fake(good({ ci: ['gh-error'] }));
    expect(await deploy(f.env, options({ skipCiCheck: true }))).toBe(0);
    expect(f.ghCalls()).toBe(0);
    expect(text(f.logs)).toContain('SE DESPLIEGA SIN MIRAR LA CI');
    expect(f.streamed[1]!.args).toContain('[sin CI] d27b0b3 Cierra el paso 1.8');
  });

  it('--skip-ci-check still refuses a commit that is not pushed', async () => {
    const f = fake(good({ remote: OTHER }));
    expect(await deploy(f.env, options({ skipCiCheck: true }))).toBe(1);
    expect(f.streamed).toEqual([]);
  });
});

describe('ciVerdict', () => {
  it('the most recent run on main decides; pull requests do not count', () => {
    expect(
      ciVerdict(
        [
          run({ createdAt: '2026-11-08T01:00:00Z' }),
          run({ createdAt: '2026-11-09T05:30:00Z', event: 'schedule', conclusion: 'failure' }),
        ],
        SHA,
      ).kind,
    ).toBe('failed');
    expect(
      ciVerdict(
        [
          run({ createdAt: '2026-11-08T01:00:00Z' }),
          run({ createdAt: '2026-11-09T00:00:00Z', event: 'pull_request', conclusion: 'failure' }),
        ],
        SHA,
      ).kind,
    ).toBe('success');
    expect(ciVerdict([run({ event: 'pull_request' })], SHA).kind).toBe('missing');
  });

  it('only runs of that commit on main count', () => {
    expect(ciVerdict([run({ headSha: OTHER })], SHA).kind).toBe('missing');
    expect(ciVerdict([run({ headBranch: 'main-copy' })], SHA).kind).toBe('missing');
    expect(
      ciVerdict(
        [
          run({ createdAt: '2026-11-08T01:00:00Z', conclusion: 'failure' }),
          run({ createdAt: '2026-11-09T01:00:00Z', headSha: OTHER }),
        ],
        SHA,
      ).kind,
    ).toBe('failed');
  });
});

describe('parseArgs and helpers', () => {
  it('reads the options', () => {
    expect(parseArgs([], 'https://s')).toEqual({
      kind: 'options',
      options: { dryRun: false, skipCiCheck: false, waitMinutes: null, smokeUrl: 'https://s' },
    });
    const all = parseArgs(
      ['--dry-run', '--wait=10', '--skip-ci-check', '--smoke-url=https://t'],
      'x',
    );
    expect(all).toEqual({
      kind: 'options',
      options: { dryRun: true, skipCiCheck: true, waitMinutes: 10, smokeUrl: 'https://t' },
    });
    expect(parseArgs(['--wait'], 'x')).toMatchObject({ options: { waitMinutes: 30 } });
    expect(parseArgs(['--wait=0'], 'x').kind).toBe('error');
    expect(parseArgs(['--force'], 'x').kind).toBe('error');
    expect(parseArgs(['--help'], 'x').kind).toBe('help');
    // A bad smoke address is caught before deploying, not after.
    expect(parseArgs(['--smoke-url='], 'x').kind).toBe('error');
    expect(parseArgs(['--smoke-url=www.quintoventriculo.cl'], 'x').kind).toBe('error');
  });

  it('sees the options that npm kept for itself (npm run deploy --dry-run, without «--»)', () => {
    expect(flagsTakenByNpm({})).toEqual([]);
    expect(flagsTakenByNpm({ npm_config_dry_run: 'true', npm_config_cache: '/x' })).toEqual([
      '--dry-run',
    ]);
    expect(flagsTakenByNpm({ npm_config_skip_ci_check: 'true', npm_config_wait: '10' })).toEqual([
      '--skip-ci-check',
      '--wait',
    ]);
    expect(npmFlagsMessage(['--dry-run'])).toContain('npm run deploy -- --dry-run');
  });

  it('reads owner/repo from a GitHub remote, and nothing else', () => {
    expect(githubRepository('https://github.com/niculri/quinto-ventriculo.git')).toBe(
      'niculri/quinto-ventriculo',
    );
    expect(githubRepository('https://github.com/niculri/quinto-ventriculo')).toBe(
      'niculri/quinto-ventriculo',
    );
    expect(githubRepository('git@github.com:niculri/quinto-ventriculo.git')).toBe(
      'niculri/quinto-ventriculo',
    );
    expect(githubRepository('ssh://git@github.com/niculri/quinto-ventriculo.git\n')).toBe(
      'niculri/quinto-ventriculo',
    );
    expect(githubRepository('https://github.com.evil.example/niculri/x.git')).toBeNull();
    expect(githubRepository('/Users/someone/mirror.git')).toBeNull();
  });

  it('cuts the version message at 100 characters', () => {
    const long = versionMessage(SHA, 'x'.repeat(200), false);
    expect(long).toHaveLength(100);
    expect(long.startsWith('d27b0b3 x')).toBe(true);
  });

  it('separates changed files from untracked ones (git status -z)', () => {
    expect(
      dirtyFiles(
        ' M a.ts\0?? apps/x y.ts\0?? docs/y.md\0?? .claude/z.md\0R  new name.ts\0old.ts\0?? tsconfig.json\0',
      ),
    ).toEqual({
      changed: ['a.ts', 'new name.ts'],
      untracked: ['apps/x y.ts', 'tsconfig.json'],
    });
    expect(dirtyFiles('')).toEqual({ changed: [], untracked: [] });
  });
});

describe('a commit of only docs (they do not run the CI)', () => {
  const CODE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const DOCS1 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const older = 'cccccccccccccccccccccccccccccccccccccccc';
  const docsAfterCode = (over: Partial<World> = {}) =>
    good({
      head: SHA,
      remote: SHA,
      history: [
        { sha: SHA, files: ['docs/plan/roadmap.md', 'CLAUDE.md'] },
        { sha: DOCS1, files: ['.claude/specs/in-progress/task.md'] },
        { sha: CODE, files: ['apps/api/src/app.ts', 'docs/configuracion.md'] },
        { sha: older, files: ['packages/ops/src/deploy.ts'] },
      ],
      ...over,
    });

  it('deploys when the last commit with code before it has the CI green', async () => {
    const f = fake(docsAfterCode({ ciBySha: { [CODE]: [run({ headSha: CODE })] } }));
    expect(await deploy(f.env, options({ dryRun: true }))).toBe(0);
    expect(text(f.logs)).toContain('no tiene CI propia');
    expect(text(f.logs)).toContain('aaaaaaa');
    // It asked GitHub for HEAD, the docs commit and the commit with code, not further back.
    expect(f.ghArgs.map((a) => a[a.indexOf('--commit') + 1])).toEqual([SHA, DOCS1, CODE]);
  });

  it('a run of a push of code and docs together is on its last commit, a docs one: it counts', async () => {
    const f = fake(docsAfterCode({ ciBySha: { [DOCS1]: [run({ headSha: DOCS1 })] } }));
    expect(await deploy(f.env, options({ dryRun: true }))).toBe(0);
    expect(f.ghArgs).toHaveLength(2);
  });

  it('refuses when that CI failed, and never goes past the commit with code', async () => {
    const failed = fake(
      docsAfterCode({
        ciBySha: {
          [CODE]: [run({ headSha: CODE, conclusion: 'failure' })],
          [older]: [run({ headSha: older })],
        },
      }),
    );
    expect(await deploy(failed.env, options({ dryRun: true }))).toBe(1);
    expect(text(failed.logs)).toContain('terminó en «failure»');
    const missing = fake(docsAfterCode({ ciBySha: { [older]: [run({ headSha: older })] } }));
    expect(await deploy(missing.env, options({ dryRun: true }))).toBe(1);
    expect(text(missing.logs)).toContain('todavía no tiene una corrida');
    expect(missing.ghArgs.map((a) => a[a.indexOf('--commit') + 1])).not.toContain(older);
  });

  it('the run of HEAD itself decides when it has one (a newer failure is not hidden by an older green)', async () => {
    const f = fake(
      docsAfterCode({
        ciBySha: {
          [SHA]: [run({ headSha: SHA, event: 'schedule', conclusion: 'failure' })],
          [CODE]: [run({ headSha: CODE })],
        },
      }),
    );
    expect(await deploy(f.env, options({ dryRun: true }))).toBe(1);
    expect(f.ghArgs).toHaveLength(1);
  });

  it('a README inside a package, or a file at the root that is not Markdown, is code', async () => {
    for (const files of [
      ['packages/anki-search/README.md'],
      ['package.json'],
      ['docs/x.md', 'tsconfig.json'],
    ]) {
      const f = fake(
        good({
          history: [
            { sha: SHA, files },
            { sha: CODE, files: ['apps/api/src/app.ts'] },
          ],
          ciBySha: { [CODE]: [run({ headSha: CODE })] },
        }),
      );
      expect(await deploy(f.env, options({ dryRun: true }))).toBe(1);
      expect(f.ghArgs).toHaveLength(1);
    }
  });
});
