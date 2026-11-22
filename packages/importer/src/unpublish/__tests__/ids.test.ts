// Tests the ids a piece goes by when it is taken off the site.
import { describe, expect, it } from 'vitest';
import type { Manifest } from '../../manifest/schemas';
import { assessmentOf, canonicalId } from '../ids';

const manifest: Pick<Manifest, 'notes' | 'tests'> = {
  notes: [
    {
      assessmentId: 'a/b',
      notes: [
        {
          id: 'AP-1',
          code: 'QV-1',
          slug: 'uno',
          kind: 'lecture',
          position: 1,
          title: 'Uno',
          sources: [],
          sourceFile: 'x.md',
        },
      ],
    },
  ],
  tests: [
    {
      assessmentId: 'a/b',
      tests: [{ slug: 'practica', position: 1, folder: 'T1' }],
    },
    {
      assessmentId: 'c/d',
      tests: [{ id: 'fijo', slug: 'practica', position: 1, folder: 'T2' }],
    },
  ],
};

describe('canonicalId', () => {
  it('a note by its id, its web code or its slug', () => {
    for (const id of ['AP-1', 'QV-1', 'uno'])
      expect(canonicalId(manifest, 'note', id)).toBe('AP-1');
    expect(canonicalId(manifest, 'note', 'otro')).toBeNull();
  });

  it('a test by its id, or by its slug when only one has it', () => {
    expect(canonicalId(manifest, 'quiz', 'fijo')).toBe('fijo');
    expect(canonicalId(manifest, 'quiz', 'a-b-practica')).toBe('a-b-practica');
  });

  it('a slug that two tests have is an error that says which', () => {
    expect(() => canonicalId(manifest, 'quiz', 'practica')).toThrow(
      'Hay 2 tests con el slug «practica» (a-b-practica, fijo): usa su id.',
    );
  });

  it('a deck or an image goes by its own id', () => {
    expect(canonicalId(manifest, 'deck', '123')).toBeNull();
  });
});

describe('assessmentOf', () => {
  it('the assessment of a note or a test by its id', () => {
    expect(assessmentOf(manifest, 'note', 'AP-1')).toBe('a/b');
    expect(assessmentOf(manifest, 'quiz', 'fijo')).toBe('c/d');
    expect(assessmentOf(manifest, 'quiz', 'a-b-practica')).toBe('a/b');
    expect(assessmentOf(manifest, 'image', 'x')).toBeNull();
  });
});
