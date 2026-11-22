// Tests the command line of `npm run import`: what it takes by default and what it refuses before building anything.
import { describe, expect, it } from 'vitest';
import { ImportError } from '../../errors';
import { parseImportArgs } from '../import-args';

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
});
