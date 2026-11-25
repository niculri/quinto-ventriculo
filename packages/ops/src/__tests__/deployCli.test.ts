// Tests for the deploy command: its arguments, the code it leaves and the real tools it hands to deploy.ts
// (processes, files, the clock and the smoke test with its retries). The deploy and its processes are replaced.
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeployOptions } from '../deploy';
import type { DeployEnvironment } from '../deployEnvironment';
import { runCli } from './runCli';

const ROOT = '/repo';
const SITE = 'https://site.example';

interface Spawned {
  command: string;
  args: readonly string[];
  options: { cwd: string; stdio: unknown; env: Record<string, string | undefined> };
}

type Script = (child: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }) => void;

const smokeResults = (...oks: boolean[]) => {
  const queue = [...oks];
  return vi.fn(() => ({ ok: queue.shift() ?? false }));
};

async function load(
  argv: string[],
  {
    script,
    deployCode = 0,
    env = {},
    files = {},
    smoke = smokeResults(true),
  }: {
    script?: Script;
    deployCode?: number;
    env?: Record<string, string>;
    files?: Record<string, string>;
    smoke?: ReturnType<typeof smokeResults>;
  } = {},
) {
  const spawned: Spawned[] = [];
  const seen: { environment?: DeployEnvironment; options?: DeployOptions } = {};
  const result = await runCli(() => import('../deployCli'), {
    argv,
    env,
    mocks: {
      'node:child_process': () => ({
        spawn: (command: string, args: readonly string[], options: Spawned['options']) => {
          spawned.push({ command, args, options });
          const child = Object.assign(new EventEmitter(), {
            stdout: new EventEmitter(),
            stderr: new EventEmitter(),
          });
          queueMicrotask(() => script?.(child));
          return child;
        },
      }),
      'node:fs/promises': () => ({
        readFile: async (path: string) => {
          const text = files[path];
          if (text === undefined) throw new Error('ENOENT');
          return text;
        },
      }),
      '../repositoryRoot': () => ({ repositoryRoot: () => ROOT }),
      '../smoke': () => ({
        DEFAULT_SITE: SITE,
        runSmoke: smoke,
        formatSmoke: (url: string, r: { ok: boolean }) => [`smoke ${url} ${String(r.ok)}`],
      }),
      '../deploy': async () => ({
        ...(await vi.importActual<object>('../deploy')),
        deploy: (environment: DeployEnvironment, options: DeployOptions) => {
          Object.assign(seen, { environment, options });
          return Promise.resolve(deployCode);
        },
      }),
    },
  });
  return { ...result, spawned, ...seen };
}

describe('npm run deploy, its arguments', () => {
  it('hands deploy the options it read, with the default site, and leaves the code deploy returns', async () => {
    const r = await load(['--dry-run', '--wait=5'], { deployCode: 1 });
    expect(r.options).toEqual({
      dryRun: true,
      skipCiCheck: false,
      skipSchemaCheck: false,
      waitMinutes: 5,
      smokeUrl: SITE,
    });
    expect(r.code).toBe(1);
  });

  it('--help prints the usage and deploys nothing', async () => {
    const r = await load(['--help']);
    expect(r.out[0]).toContain('Uso: npm run deploy');
    expect(r.environment).toBeUndefined();
    expect(r.code).toBe(0);
  });

  it('an option it does not know leaves 2, names it and prints the usage', async () => {
    const r = await load(['--force']);
    expect(r.code).toBe(2);
    expect(r.err[0]).toContain('No conozco la opción «--force»');
    expect(r.err[0]).toContain('Uso: npm run deploy');
    expect(r.environment).toBeUndefined();
  });

  it('an option that npm kept for itself (no «--») leaves 2 before reading any argument', async () => {
    const r = await load([], { env: { npm_config_dry_run: 'true' } });
    expect(r.code).toBe(2);
    expect(r.err[0]).toContain('npm run deploy -- --dry-run');
    expect(r.environment).toBeUndefined();
  });
});

describe('the tools it hands to deploy', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('capture is quiet: no password prompts, output collected, the code of the process', async () => {
    const r = await load([], {
      script: (child) => {
        child.stdout.emit('data', Buffer.from('out '));
        child.stdout.emit('data', Buffer.from('put'));
        child.stderr.emit('data', Buffer.from('warn'));
        child.emit('close', 3);
      },
    });
    expect(await r.environment!.capture('git', ['status'])).toEqual({
      code: 3,
      stdout: 'out put',
      stderr: 'warn',
    });
    const call = r.spawned[0]!;
    expect(call.options.cwd).toBe(ROOT);
    expect(call.options.stdio).toEqual(['ignore', 'pipe', 'pipe']);
    expect(call.options.env).toMatchObject({ GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1' });
  });

  it('a process killed by a signal (no code) counts as failed, and one that cannot start as 127 with the reason', async () => {
    const killed = await load([], { script: (child) => child.emit('close', null) });
    expect((await killed.environment!.capture('gh', [])).code).toBe(1);
    const missing = await load([], {
      script: (child) => {
        child.stderr.emit('data', Buffer.from('before '));
        child.emit('error', new Error('spawn gh ENOENT'));
      },
    });
    expect(await missing.environment!.capture('gh', [])).toEqual({
      code: 127,
      stdout: '',
      stderr: 'before spawn gh ENOENT',
    });
  });

  it('stream shows the output as it comes, in the folder asked for under the root, and returns the code', async () => {
    const r = await load([], { script: (child) => child.emit('close', 0) });
    expect(await r.environment!.stream('npm', ['run', 'build'])).toBe(0);
    expect(await r.environment!.stream('npx', ['wrangler', 'deploy'], 'apps/api')).toBe(0);
    expect(r.spawned.map((s) => [s.options.cwd, s.options.stdio])).toEqual([
      [ROOT, 'inherit'],
      [join(ROOT, 'apps/api'), 'inherit'],
    ]);
    expect(r.spawned[0]!.options.env).not.toHaveProperty('GIT_TERMINAL_PROMPT', '0');
  });

  it('readFile reads from the root and answers null for a file that is not there', async () => {
    const r = await load([], { files: { [join(ROOT, 'apps/web/.env.local')]: 'KEY=1\n' } });
    expect(await r.environment!.readFile('apps/web/.env.local')).toBe('KEY=1\n');
    expect(await r.environment!.readFile('missing')).toBeNull();
  });

  it('hasVariable is true for a variable that is set, even empty', async () => {
    const r = await load([]);
    vi.stubEnv('QV_PRESENT', '');
    expect(r.environment!.hasVariable('QV_PRESENT')).toBe(true);
    expect(r.environment!.hasVariable('QV_ABSENT_VARIABLE')).toBe(false);
  });

  it('variable reads the terminal’s, and capture gives its extra variables to that one process only', async () => {
    const r = await load([], { script: (child) => child.emit('close', 0) });
    vi.stubEnv('QV_PRESENT', 'here');
    expect(r.environment!.variable('QV_PRESENT')).toBe('here');
    expect(r.environment!.variable('QV_ABSENT_VARIABLE')).toBeUndefined();
    await r.environment!.capture('npm', ['run', 'x'], { QV_ONLY_THIS: 'secret' });
    await r.environment!.capture('git', ['status']);
    expect(r.spawned[0]!.options.env).toMatchObject({ QV_ONLY_THIS: 'secret' });
    expect(r.spawned[1]!.options.env).not.toHaveProperty('QV_ONLY_THIS');
    expect(process.env.QV_ONLY_THIS).toBeUndefined();
  });

  it('sleep waits that long, now is the wall clock, log prints a line', async () => {
    const r = await load([]);
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    expect(r.environment!.now()).toBe(1_000);
    let done = false;
    void r.environment!.sleep(250).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(249);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => void logs.push(line));
    r.environment!.log('hello');
    expect(logs).toEqual(['hello']);
  });

  describe('the smoke test after deploying', () => {
    const smokeWith = async (...oks: boolean[]) => {
      const smoke = smokeResults(...oks);
      const r = await load([], { smoke });
      vi.useFakeTimers();
      const printed: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((line: string) => void printed.push(line));
      const answer = r.environment!.smoke(SITE);
      await vi.advanceTimersByTimeAsync(20_000);
      return { answer: await answer, smoke, printed };
    };

    it('passes at the first try without waiting and prints its report once', async () => {
      const { answer, smoke, printed } = await smokeWith(true);
      expect(answer).toBe(true);
      expect(smoke).toHaveBeenCalledTimes(1);
      expect(printed).toEqual([`smoke ${SITE} true`]);
    });

    it('waits five seconds between tries', async () => {
      const smoke = smokeResults(false, true);
      const r = await load([], { smoke });
      vi.useFakeTimers();
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const answer = r.environment!.smoke(SITE);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(smoke).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(smoke).toHaveBeenCalledTimes(2);
      expect(await answer).toBe(true);
    });

    it('tries again after a failure, since the edge may need a few seconds, and stops at the first pass', async () => {
      const { answer, smoke, printed } = await smokeWith(false, true);
      expect(answer).toBe(true);
      expect(smoke).toHaveBeenCalledTimes(2);
      expect(printed).toEqual([`smoke ${SITE} true`]);
    });

    it('gives up after three tries and reports the last answer only', async () => {
      const { answer, smoke, printed } = await smokeWith(false, false, false, true);
      expect(answer).toBe(false);
      expect(smoke).toHaveBeenCalledTimes(3);
      expect(printed).toEqual([`smoke ${SITE} false`]);
    });
  });
});
