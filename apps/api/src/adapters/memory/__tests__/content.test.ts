// Tests for the content repository in memory: its search mimics Postgres' (no accents, by prefix, every word).
import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_END, HIGHLIGHT_START } from '@qv/schema';
import type { ContentBundle } from '@qv/schema';
import { bundle } from '../../../test/draftApp';
import { memoryRepository } from '../content';

const section = (anchor: string, title: string, text: string) => ({
  anchor,
  title,
  level: 2 as const,
  text,
});

const note = (id: string, courseId: string, sections: ReturnType<typeof section>[]) => ({
  ...bundle('x').notes[0]!,
  id,
  slug: id,
  courseId,
  title: `Apunte ${id}`,
  sections,
});

const make = (notes: ContentBundle['notes']) =>
  memoryRepository({ ...bundle('x'), notes, quizzes: [] });

describe('search', () => {
  const repo = make([
    note('uno', 'biologia-celular', [
      section('a', 'Ribosomas', 'Los ribosomas leen el mensajero.'),
      section('b', 'Núcleo', 'Aquí se arman los ribosomas del nucléolo.'),
    ]),
    note('dos', 'otro-ramo', [section('c', 'Ribosoma', 'Texto')]),
  ]);

  it('words of one letter do not count, so a query of only those finds nothing', async () => {
    expect(await repo.search('a y', 10)).toEqual([]);
    expect(await repo.search('   ', 10)).toEqual([]);
    expect((await repo.search('ribosomas z', 10)).map((r) => r.anchor)).toEqual(['a', 'b']);
  });

  it('is by prefix and without accents, never from the middle of a word', async () => {
    expect((await repo.search('nucleo', 10)).map((r) => r.anchor)).toEqual(['b']);
    expect(await repo.search('soma', 10)).toEqual([]);
    expect((await repo.search('RIBO', 10)).length).toBe(3);
  });

  it('every word has to be there, in the title or in the text', async () => {
    expect((await repo.search('ribosomas arman', 10)).map((r) => r.anchor)).toEqual(['b']);
    expect(await repo.search('ribosomas inexistente', 10)).toEqual([]);
  });

  it('a word in the title scores more than in the text, so the title goes first', async () => {
    const found = await repo.search('ribosoma', 10);
    expect(found.map((r) => [r.anchor, r.score])).toEqual([
      ['a', 1],
      ['c', 1],
      ['b', 0.1],
    ]);
  });

  it('leaves out the excluded courses and cuts at the limit', async () => {
    expect((await repo.search('ribosoma', 10, ['otro-ramo'])).map((r) => r.anchor)).toEqual([
      'a',
      'b',
    ]);
    expect(await repo.search('ribosoma', 1)).toHaveLength(1);
  });

  it('names the course, or leaves the name empty if the course is not in the bundle', async () => {
    const found = await repo.search('ribosoma', 10);
    expect(found.find((r) => r.noteId === 'uno')!.courseName).toBe('Biología celular');
    expect(found.find((r) => r.noteId === 'dos')!.courseName).toBe('');
  });

  it('a word with symbols of a regular expression is searched as plain text', async () => {
    expect(await repo.search('(ri.*', 10)).toEqual([]);
  });
});

describe('the snippet', () => {
  const long = `${Array.from({ length: 40 }, (_, i) => `p${i}`).join(' ')} clave final`;
  const repo = make([note('uno', 'biologia-celular', [section('a', 'Tema', long)])]);

  it('highlights the words found, and opens with an ellipsis when it starts late in the text', async () => {
    const [r] = await repo.search('clave', 5);
    expect(r!.snippet.startsWith('… p30')).toBe(true);
    expect(r!.snippet).toContain(`${HIGHLIGHT_START}clave${HIGHLIGHT_END}`);
    expect(r!.snippet.endsWith(' …')).toBe(false);
  });

  it('a match at the start has no leading ellipsis, and a long text ends with one', async () => {
    const early = make([note('uno', 'biologia-celular', [section('a', 'Tema', `clave ${long}`)])]);
    const [r] = await early.search('clave', 5);
    expect(r!.snippet.startsWith(`${HIGHLIGHT_START}clave`)).toBe(true);
    expect(r!.snippet.endsWith(' …')).toBe(true);
  });

  it('a match only in the title shows the start of the text', async () => {
    const [r] = await make([
      note('uno', 'biologia-celular', [section('a', 'Clave', 'texto sin la palabra')]),
    ]).search('clave', 5);
    expect(r!.snippet).toBe('texto sin la palabra');
  });
});

describe('what a bundle does not know', () => {
  const repo = make([note('uno', 'biologia-celular', [])]);

  it('a note, a quiz or a section that is not there is null', async () => {
    expect(await repo.note('nada')).toBeNull();
    expect(await repo.quiz('nada')).toBeNull();
    expect(await repo.quizSectionJson('nada', 's')).toBeNull();
    expect(await repo.deckJson('nada')).toBeNull();
    expect(await repo.card('x', 0)).toBeNull();
  });

  it('the changes of a bundle are none, and the cursor stays where it was', async () => {
    expect(await repo.cardChanges(7, 100)).toEqual({
      changes: [],
      next: 7,
      latest: 0,
      more: false,
    });
  });

  it('a note does not carry its sections, hash or media', async () => {
    expect(Object.keys((await repo.note('uno'))!)).not.toEqual(
      expect.arrayContaining(['sections', 'hash', 'media']),
    );
  });
});
