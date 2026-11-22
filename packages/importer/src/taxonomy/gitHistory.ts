// The committed versions of the content folder's files, read from git.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { ImportError } from '../ImportError';
import type { TaxonomyHistory } from './types';

type Walk = Promise<Map<string, Set<string>>>;

/** «\x01<commit>\0\n<path>\0<path>\0\x01<commit>\0…», paths from the repository's root. */
function filesByCommit(out: string): Map<string, Set<string>> {
  const files = new Map<string, Set<string>>();
  let commit = '';
  for (const token of out.split('\0')) {
    const t = token.replace(/^\n+/, '');
    if (t.startsWith('\x01')) commit = t.slice(1);
    else if (t && commit) files.set(t, (files.get(t) ?? new Set()).add(commit));
  }
  return files;
}

function gitRunner(folder: string) {
  const run = promisify(execFile);
  // A «[» or «*» in a file name is not a pattern.
  return async (...args: string[]) =>
    (
      await run('git', ['--literal-pathspecs', '-C', folder, ...args], {
        maxBuffer: 64 * 1024 * 1024,
      })
    ).stdout;
}

/** One git log per folder, not per file. */
function folderWalker(git: (...args: string[]) => Promise<string>, born: boolean) {
  const walks = new Map<string, Walk>();
  return (dir: string): Walk => {
    let done = walks.get(dir);
    if (!done) {
      // -m: a merge's own text is a version; --topo-order: the first parent is the older; -z: otherwise git quotes
      // paths with accents and nothing matches.
      const log = born
        ? git(
            'log',
            '-m',
            '-z',
            '--topo-order',
            '--format=%x01%H',
            '--name-only',
            '--no-renames',
            '--diff-filter=AMT',
            '--',
            dir,
          )
        : Promise.resolve('');
      done = log.then(filesByCommit);
      walks.set(dir, done);
    }
    return done;
  };
}

export async function gitHistory(folder: string): Promise<TaxonomyHistory | null> {
  const git = gitRunner(folder);
  let prefix: string;
  try {
    prefix = (await git('rev-parse', '--show-prefix')).trim();
  } catch {
    return null;
  }
  const shallow =
    (await git('rev-parse', '--is-shallow-repository').catch(() => 'false')).trim() === 'true';
  // Only a repository without commits means «no history»; any other git failure stops the import, or the reused-id
  // check would turn off silently.
  const born = await git('rev-parse', '--verify', '--quiet', 'HEAD').then(
    () => true,
    () => false,
  );
  const walk = folderWalker(git, born);
  return {
    shallow,
    async versions(path) {
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
      const commits = (await walk(dir)).get(`${prefix}${path}`);
      if (!commits?.size) return [];
      const texts = await gitBatch(
        folder,
        [...commits].map((sha) => `${sha}:${prefix}${path}`),
      );
      return texts.filter((t): t is string => t !== null);
    },
    async committedFiles(dir) {
      const own = `${prefix}${dir}/`;
      return [...(await walk(dir)).keys()]
        .filter((n) => n.startsWith(own))
        .map((n) => n.slice(own.length))
        .filter((n) => !n.includes('/') && n.endsWith('.json'))
        .sort();
    },
  };
}

/** What `git cat-file --batch` answers for each request, in order: the text of a blob, or null. */
export function parseBatch(out: Buffer, count: number): (string | null)[] {
  const texts: (string | null)[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    const end = out.indexOf(0x0a, at);
    if (end < 0) throw new ImportError('environment', 'git cat-file respondió menos de lo pedido.');
    const header = /^[0-9a-f]+ (\S+) (\d+)$/.exec(out.subarray(at, end).toString('utf8'));
    at = end + 1;
    if (!header) {
      texts.push(null);
      continue;
    }
    const size = Number(header[2]);
    texts.push(header[1] === 'blob' ? out.subarray(at, at + size).toString('utf8') : null);
    at += size + 1;
  }
  return texts;
}

/** Reads many «<commit>:<path>» with one `git cat-file --batch`; null for one that is not there. */
async function gitBatch(folder: string, specs: readonly string[]): Promise<(string | null)[]> {
  const child = spawn('git', ['-C', folder, 'cat-file', '--batch'], { stdio: 'pipe' });
  const chunks: Buffer[] = [];
  const errors: Buffer[] = [];
  child.stdout.on('data', (c: Buffer) => chunks.push(c));
  // Drained too, or a full pipe would block git.
  child.stderr.on('data', (c: Buffer) => errors.push(c));
  /* v8 ignore next -- EPIPE happens only if git exits before it has read what it was asked */
  child.stdin.on('error', () => undefined); // «close» reports why git left early
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
    child.stdin.end(specs.map((s) => `${s}\n`).join(''));
  });
  if (code !== 0) {
    const why = Buffer.concat(errors).toString('utf8').trim();
    throw new ImportError(
      'environment',
      `git cat-file terminó con el código ${String(code)}${why ? `: ${why}` : '.'}`,
    );
  }
  return parseBatch(Buffer.concat(chunks), specs.length);
}
