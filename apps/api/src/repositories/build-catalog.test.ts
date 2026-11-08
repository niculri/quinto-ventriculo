import { describe, expect, it } from 'vitest';
import { buildCatalog } from './build-catalog';

describe('buildCatalog', () => {
  it('counts each assessment’s cards and sorts the deck tree by name, parents first', () => {
    const deck = (id: string, name: string, assessmentId: string | null, cardCount: number) => ({
      id,
      name,
      parentId: null,
      preset: 'Default',
      semester: 1,
      courseId: assessmentId ? 'anatomia-1' : null,
      assessmentId,
      noteCount: cardCount,
      cardCount,
    });
    const c = buildCatalog(
      [{ number: 1, name: '1° Semestre' }],
      [{ id: 'anatomia-1', semester: 1, name: 'Anatomía I', emoji: '🦴', position: 1 }],
      [
        {
          id: 'anatomia-1/certamen-2',
          courseId: 'anatomia-1',
          name: 'Certamen 2',
          position: 2,
          suggestedDate: '2026-11-05',
        },
        { id: 'anatomia-1/certamen-1', courseId: 'anatomia-1', name: 'Certamen 1', position: 1 },
      ],
      [],
      {
        decks: [
          deck('3', 'R::S::A::Certamen 1::01', 'anatomia-1/certamen-1', 5),
          deck('2', 'R::S::A::Certamen 1', 'anatomia-1/certamen-1', 7),
          deck('1', 'R', null, 7),
        ],
        presets: [],
        noteTypes: [],
      },
    );
    expect(c.semesters[0]!.courses[0]!.assessments.map((a) => [a.name, a.cardCount])).toEqual([
      ['Certamen 1', 7],
      ['Certamen 2', 0],
    ]);
    // The date an author suggests goes through to the web.
    expect(c.semesters[0]!.courses[0]!.assessments[1]!.suggestedDate).toBe('2026-11-05');
    expect(c.anki.decks.map((d) => d.id)).toEqual(['1', '2', '3']);
  });
});
