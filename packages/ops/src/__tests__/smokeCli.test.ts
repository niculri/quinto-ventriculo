// Tests for the smoke command: which arguments it accepts and which code it leaves, with the smoke test itself replaced.
import { describe, expect, it, vi } from 'vitest';
import { runCli } from './runCli';

const SITE = 'https://default.example';
const smoke = (runSmoke: (url: string) => unknown) => ({
  DEFAULT_SITE: SITE,
  runSmoke,
  formatSmoke: (url: string, result: { ok: boolean }) => [`report ${url} ${String(result.ok)}`],
});
const run = (argv: string[], runSmoke = vi.fn(() => ({ ok: true }))) =>
  runCli(() => import('../smokeCli'), { argv, mocks: { '../smoke': () => smoke(runSmoke) } });

describe('npm run smoke', () => {
  it('without arguments tests the default site and leaves 0 when everything answers', async () => {
    const runSmoke = vi.fn(() => ({ ok: true }));
    const r = await run([], runSmoke);
    expect(runSmoke).toHaveBeenCalledWith(SITE);
    expect(r).toMatchObject({ out: [`report ${SITE} true`], code: 0 });
  });

  it('tests the address it is given, and leaves 1 when a check failed', async () => {
    const r = await run(
      ['https://other.example'],
      vi.fn(() => ({ ok: false })),
    );
    expect(r).toMatchObject({ out: ['report https://other.example false'], code: 1 });
  });

  it('--help and -h print the usage and test nothing', async () => {
    for (const flag of ['--help', '-h']) {
      const runSmoke = vi.fn(() => ({ ok: true }));
      const r = await run([flag], runSmoke);
      expect(r.out.join('\n')).toContain(`Uso: npm run smoke [-- url]`);
      expect(r.out.join('\n')).toContain(SITE);
      expect(runSmoke).not.toHaveBeenCalled();
    }
  });

  it('an option it does not know does not quietly test the default site: it leaves 2', async () => {
    const runSmoke = vi.fn(() => ({ ok: true }));
    const r = await run(['--url=https://x.example'], runSmoke);
    expect(r.code).toBe(2);
    expect(r.err[0]).toContain('No entiendo «--url=https://x.example»');
    expect(runSmoke).not.toHaveBeenCalled();
  });

  it('a second address is refused and named, with the options', async () => {
    const r = await run(['https://a.example', 'https://b.example']);
    expect(r.code).toBe(2);
    expect(r.err[0]).toContain('No entiendo «https://b.example»');
  });

  it('a smoke test that cannot start (a bad address) leaves 2 with its message', async () => {
    const thrown = await run(
      ['nope'],
      vi.fn(() => {
        throw new Error('«nope» no es una dirección');
      }),
    );
    expect(thrown).toMatchObject({ err: ['«nope» no es una dirección'], code: 2 });
    const text = await run(
      ['nope'],
      vi.fn(() => {
        throw 'plain';
      }),
    );
    expect(text.err).toEqual(['plain']);
  });
});
