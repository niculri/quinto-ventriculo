// Tests the command line of `npm run import`: what it takes by default and what it refuses before building anything.
import { afterEach, describe, expect, it } from 'vitest';
import { ImportError } from '../../ImportError';
import { HELP, parseImportArgs } from '../importArgs';

const usageError = (...args: string[]) => {
  try {
    parseImportArgs(args);
  } catch (e) {
    return e instanceof ImportError ? { kind: e.kind, message: e.message } : e;
  }
  return null;
};

describe('parseImportArgs', () => {
  it('takes every kind and the dry-run folder by default', () => {
    expect(parseImportArgs([])).toMatchObject({
      help: false,
      target: 'folder',
      only: [],
      assessments: [],
      onlyDecks: false,
      onlyTests: false,
      allowWarnings: false,
      resetDraft: false,
    });
  });

  it('reads the options, and repeats --only and --assessment', () => {
    const args = parseImportArgs([
      '--target',
      'draft',
      '--only',
      'AP-1',
      '--only',
      'AP-2',
      '--assessment',
      'a/b',
      '--reset-draft',
      '--allow-warnings',
      '--cache',
      'c',
    ]);
    expect(args).toMatchObject({
      target: 'draft',
      only: ['AP-1', 'AP-2'],
      assessments: ['a/b'],
      resetDraft: true,
      allowWarnings: true,
      cache: 'c',
    });
  });

  it('--help answers before anything is checked', () => {
    expect(parseImportArgs(['--help', '--target', 'nada'])).toMatchObject({ help: true });
  });

  it('refuses what cannot go together, as an error of usage', () => {
    expect(usageError('--only', 'AP-1', '--only-decks')).toEqual({
      kind: 'usage',
      message: '--only, --only-decks y --only-tests no se pueden usar juntos.',
    });
    expect(usageError('--reset-draft')).toEqual({
      kind: 'usage',
      message: '--reset-draft va solo con --target draft.',
    });
    expect(usageError('--target', 'public')).toEqual({
      kind: 'usage',
      message: 'Destino desconocido: public (folder o draft).',
    });
  });

  it('the target that went away says where publishing is now, not just that it is unknown', () => {
    const error = usageError('--target', 'cloud') as { kind: string; message: string };
    expect(error.kind).toBe('usage');
    expect(error.message).toContain('--target draft');
    expect(usageError('--only-decks', '--only-tests')).toMatchObject({ kind: 'usage' });
  });

  it('a draft target with --reset-draft is allowed, and the help lists every option', () => {
    expect(parseImportArgs(['--target', 'draft', '--reset-draft'])).toMatchObject({
      target: 'draft',
      resetDraft: true,
    });
    for (const option of [
      '--target',
      '--only-decks',
      '--only-tests',
      '--reset-draft',
      '--allow-warnings',
      '--cache',
    ]) {
      expect(HELP).toContain(option);
    }
  });

  describe('without arguments of its own', () => {
    const argv = process.argv;
    afterEach(() => {
      process.argv = argv;
    });

    it('it reads the command line of the process', () => {
      process.argv = ['node', 'import', '--target', 'draft', '--assessment', 'a/b'];
      expect(parseImportArgs()).toMatchObject({ target: 'draft', assessments: ['a/b'] });
    });
  });
});
