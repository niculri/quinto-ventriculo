// Reading the files of a base commit for the ratchets (`--base <rev>`, origin/main by default). In the CI a base that
// cannot be read fails the check; on a computer it only warns, since the CI checks it again.
import { execFileSync } from 'node:child_process';

export interface BaseArgs {
  base: string;
  /** Whether a missing base fails (the CI) or only warns. */
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

/** A file of the base commit; null when the commit does not have it. */
export function readAtBase(root: string, base: string, path: string): string | null {
  return git(root, ['show', `${base}:${path}`]);
}

/** What to do when the base is not in this clone: the message, and whether the check fails. */
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
