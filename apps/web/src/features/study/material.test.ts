import { describe, expect, it } from 'vitest';
import type { Catalog, NotePractice } from '@qv/schema';
import { CATALOG } from '../../test/render';
import { materialByDeck } from './material';

/** The test catalog with an article of the test deck («Mazo de prueba», its Extras below it). */
function catalog(practice: NotePractice | undefined): Catalog {
  const copy = structuredClone(CATALOG);
  const assessment = copy.semesters[0]!.courses[0]!.assessments[0]!;
  assessment.notes = [
    {
      ...copy.semesters[1]!.courses[0]!.assessments[0]!.notes[0]!,
      id: 'AP-A1-S1-01',
      slug: 'mazo-de-prueba',
      courseId: 'anatomia-1',
      assessmentId: assessment.id,
      ...(practice ? { practice } : {}),
    },
  ];
  assessment.quizzes = [
    {
      id: 'practica',
      slug: 'practica',
      courseId: 'anatomia-1',
      assessmentId: assessment.id,
      title: 'Práctica',
      position: 1,
      questionCount: 4,
      sectionCount: 2,
      updatedAt: '2026-10-31T12:00:00.000Z',
    },
  ];
  return copy;
}

describe('from a card to its material', () => {
  it('the deck of an article, with its Extras, goes to the article and to its test in its topics', () => {
    const map = materialByDeck(
      catalog({
        deck: 'Mazo de prueba',
        quizId: 'practica',
        section: 'pautas',
        groups: ['02'],
      }),
    );
    for (const deckId of ['20', '21']) {
      expect(map.get(deckId)).toMatchObject({
        notePath: '/semesters/1/courses/anatomia-1/notes/mazo-de-prueba',
      });
      expect(map.get(deckId)!.quizPath).toMatch(
        /^\/semesters\/1\/courses\/anatomia-1\/tests\/certamen-1\/practica\/pautas\?topics=02$/,
      );
    }
    // The week above it is not that article.
    expect(map.has('5')).toBe(false);
  });

  it('an article without a test: only the article', () => {
    const map = materialByDeck(catalog({ deck: 'Mazo de prueba' }));
    expect(map.get('20')).toMatchObject({ quiz: null, quizPath: null });
  });

  it('a deck no article names has nothing', () => {
    expect(materialByDeck(catalog(undefined)).size).toBe(0);
    expect(materialByDeck(catalog({ deck: 'Otro mazo' })).size).toBe(0);
  });
});
