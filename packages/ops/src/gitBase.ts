// Reads files of the ratchets' base commit; a missing base fails in the CI and only warns elsewhere.
import { execFileSync } from 'node:child_process';

export interface BaseArgs {
  base: string;
  required: boolean;
}

export function parseBaseArgs(argv: readonly string[], env: NodeJS.ProcessEnv): BaseArgs | null {
  const i = argv.indexOf('--base');
  const base = i >= 0 ? argv[i + 1] : 'origin/main';
  if (!base || base.startsWith('--')) return null;
  return { base, required: argv.includes('--require-base') || !!env.CI || !!env.GITHUB_ACTIONS };
}

export function git(root: string, args: readonly string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

export function baseExists(root: string, base: string): boolean {
  return git(root, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]) !== null;
}

export function readAtBase(root: string, base: string, path: string): string | null {
  return git(root, ['show', `${base}:${path}`]);
}

export function missingBase(args: BaseArgs, what: string): { message: string; fail: boolean } {
  return args.required
    ? {
        message: `${what}: no encuentro «${args.base}»; sin la base no se puede comprobar.`,
        fail: true,
      }
    : {
        message: `${what}: no encuentro «${args.base}» en este clon; no hay con qué comparar (la CI lo comprueba).`,
        fail: false,
      };
}
