import { describe, expect, it } from 'vitest';
import { deckSlug, deckSlugs, parseCardCode } from './flashcards';

describe('deck slugs', () => {
  it('a readable slug from the last part of the name', () => {
    expect(deckSlug('01 - Columna vertebral')).toBe('01-columna-vertebral');
    expect(deckSlug('🦴 Anatomía I')).toBe('anatomia-i');
    expect(deckSlug('1° Semestre')).toBe('1-semestre');
    expect(deckSlug('😀')).toBe('mazo');
  });

  it('unique among siblings, not across the tree; the words of the URLs take a suffix', () => {
    const slugs = deckSlugs([
      { id: '1', name: 'R::A::Gymkana', parentId: 'a' },
      { id: '2', name: 'R::A::Gymkana', parentId: 'a' },
      { id: '3', name: 'R::B::Gymkana', parentId: 'b' },
      { id: '4', name: 'R::B::Study', parentId: 'b' },
    ]);
    expect([...slugs.values()]).toEqual(['gymkana', 'gymkana-2', 'gymkana', 'study-2']);
  });
});

describe('parseCardCode', () => {
  it('splits the code and its version', () => {
    expect(parseCardCode('T-A1-S3-01-047.3')).toEqual({ code: 'T-A1-S3-01-047', version: 3 });
    expect(parseCardCode('<b>T-A1-S3-01-047.1</b>')).toEqual({
      code: 'T-A1-S3-01-047',
      version: 1,
    });
    expect(parseCardCode('sin código')).toBeNull();
  });
});
