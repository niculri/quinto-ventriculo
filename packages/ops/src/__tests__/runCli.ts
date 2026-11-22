// Runs a command file of this package as `tsx` would: its arguments and environment set, its dependencies replaced,
// process.exit turned into a value; returns what it printed and the code it left.
import { vi } from 'vitest';

interface Run {
  argv?: string[];
  env?: Record<string, string>;
  // Module specifier (as the test file spells it) → the module that replaces it.
  mocks?: Record<string, () => Record<string, unknown> | Promise<Record<string, unknown>>>;
}

export interface CliResult {
  out: string[];
  err: string[];
  warn: string[];
  code: number;
}

const exitCode = (): string | number | null | undefined => process.exitCode;

class Exit extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

export async function runCli(load: () => Promise<unknown>, run: Run = {}): Promise<CliResult> {
  const result: CliResult = { out: [], err: [], warn: [], code: 0 };
  const lines =
    (into: string[]) =>
    (...args: unknown[]) =>
      void into.push(args.map(String).join(' '));
  vi.resetModules();
  for (const [specifier, factory] of Object.entries(run.mocks ?? {})) vi.doMock(specifier, factory);
  for (const [name, value] of Object.entries({ CI: '', GITHUB_ACTIONS: '', ...run.env })) {
    vi.stubEnv(name, value);
  }
  vi.spyOn(console, 'log').mockImplementation(lines(result.out));
  vi.spyOn(console, 'error').mockImplementation(lines(result.err));
  vi.spyOn(console, 'warn').mockImplementation(lines(result.warn));
  vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'cli', ...(run.argv ?? [])]);
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Exit(code ?? 0);
  }) as typeof process.exit);
  process.exitCode = undefined;
  try {
    await load();
    result.code = Number(exitCode() ?? 0);
  } catch (e) {
    if (!(e instanceof Exit)) throw e;
    result.code = e.code;
  } finally {
    process.exitCode = undefined;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    for (const specifier of Object.keys(run.mocks ?? {})) vi.doUnmock(specifier);
  }
  return result;
}
