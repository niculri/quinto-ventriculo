// Tests the command line of `npm run unpublish`: its defaults, its flags and the check of the piece it names.
import { afterEach, describe, expect, it } from 'vitest';
import { HELP, parseUnpublishArgs, pieceOf } from '../unpublishArgs';

describe('parseUnpublishArgs', () => {
  it('everything is off by default, and what comes after the options is kept apart for pieceOf', () => {
    expect(parseUnpublishArgs(['quiz', 'practica'])).toEqual({
      help: false,
      list: false,
      restore: false,
      dryRun: false,
      yes: false,
      aboveAssessment: false,
      reason: undefined,
      by: undefined,
      content: undefined,
      positionals: ['quiz', 'practica'],
    });
  });

  it('reads each option, with -y and -h as the short ones', () => {
    expect(
      parseUnpublishArgs([
        'deck',
        '123',
        '--reason',
        'Error grave',
        '--dry-run',
        '-y',
        '--above-assessment',
        '--by',
        'alguien',
        '--restore',
        '--list',
        '--content',
        '/c',
        '-h',
      ]),
    ).toMatchObject({
      help: true,
      list: true,
      restore: true,
      dryRun: true,
      yes: true,
      aboveAssessment: true,
      reason: 'Error grave',
      by: 'alguien',
      content: '/c',
      positionals: ['deck', '123'],
    });
  });

  it('every option is in the help', () => {
    for (const o of [
      '--reason',
      '--dry-run',
      '--yes',
      '--above-assessment',
      '--by',
      '--restore',
      '--list',
      '--content',
    ]) {
      expect(HELP).toContain(o);
    }
  });

  describe('without arguments of its own', () => {
    const argv = process.argv;
    afterEach(() => {
      process.argv = argv;
    });

    it('it reads the command line of the process', () => {
      process.argv = ['node', 'unpublish', 'note', 'AP-1', '--list'];
      expect(parseUnpublishArgs()).toMatchObject({ list: true, positionals: ['note', 'AP-1'] });
    });
  });
});

describe('pieceOf', () => {
  it('a known kind and one id', () => {
    expect(pieceOf({ positionals: ['image', 'cards/x.webp'] })).toEqual({
      kind: 'image',
      id: 'cards/x.webp',
    });
  });

  it('anything else is an error of usage: an unknown kind, no id, a missing kind or an extra word', () => {
    for (const positionals of [['page', 'x'], ['note'], [], ['note', 'a', 'b'], ['note', '']]) {
      expect(() => pieceOf({ positionals })).toThrow(/^Uso: npm run unpublish/);
    }
  });
});
