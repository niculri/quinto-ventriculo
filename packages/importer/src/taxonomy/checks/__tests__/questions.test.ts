// Tests the question checks: which group is of which unit, and what a question's group and topic must agree on.
import { describe, expect, it } from 'vitest';
import { checkQuestions } from '../questions';
import { A, B, contextOf, mapOf, quiz, taxonomyOf } from './contexts';

const topics = (...ids: string[]) => ids.map((id) => ({ id, title: id }));

describe('checkQuestions', () => {
  it('the groups of a unit come from the «Ponte a prueba» of its articles: the section the quiz has alone, or the one named', () => {
    const quizzes = [
      quiz('q1', A, { s: { g1: ['p1'], g2: ['p2'] } }),
      quiz('q2', A, { x: { h1: ['p3'] }, y: { h2: ['p4'] } }),
    ];
    const ctx = contextOf(
      taxonomyOf([
        { id: 'u1', title: 'u1', notes: ['n1', 'n2', 'n3'], topics: topics('t1') },
        { id: 'u2', title: 'u2', quizGroups: ['q2/y/h2'], topics: topics('t2') },
      ]),
      mapOf(
        [],
        [
          { id: 'q1/p1', topic: 't1' },
          { id: 'q1/p2', topic: 't2' },
          { id: 'q2/p3', topic: 't1' },
          { id: 'q2/p4', topic: 't2' },
        ],
      ),
      {
        quizzes,
        entries: [
          { id: 'n1', practice: { quizId: 'q1', groups: ['g1'] } },
          { id: 'n2', practice: { quizId: 'q2', section: 'x', groups: ['h1'] } },
          { id: 'n3', practice: { quizId: 'q1' } },
        ],
      },
    );
    expect(checkQuestions(ctx)).toBe(4);
    expect(ctx.problems.all()).toEqual([
      'La pregunta q1/p2 no tiene unidad'.replace(
        'no tiene unidad',
        'está en el grupo q1/s/g2, que no es de ninguna unidad («quizGroups»).',
      ),
    ]);
  });

  it('a group of a quiz that is another assessment’s, or that the quiz does not have, is said with what it does have', () => {
    const quizzes = [quiz('q1', A, { s: { g1: ['p1'] } }), quiz('q9', B, { s: { g1: ['p9'] } })];
    const ctx = contextOf(
      taxonomyOf([
        {
          id: 'u1',
          title: 'u1',
          quizGroups: ['q9/s/g1', 'q1/s/zz', 'q1/otra/g1', 'q2/s/g1'],
          topics: topics('t1'),
        },
      ]),
      mapOf(),
      { quizzes },
    );
    checkQuestions(ctx);
    expect(ctx.problems.all().slice(0, 4)).toEqual([
      `La unidad u1 nombra el test q9, que es de ${B}.`,
      'La unidad u1 nombra el grupo q1/s/zz, que no existe: la sección «s» tiene g1.',
      'La unidad u1 nombra el grupo q1/otra/g1, que no existe: el test tiene las secciones s.',
      'La unidad u1 nombra el test q2, que no está publicado.',
    ]);
  });

  it('a test that is off the site is a notice for the unit, and its questions in the map too', () => {
    const ctx = contextOf(
      taxonomyOf([{ id: 'u1', title: 'u1', quizGroups: ['q2/s/g1'], topics: topics('t1') }]),
      mapOf([], [{ id: 'q2/p1', topic: 't1' }]),
      { op: { offQuizzes: new Set(['q2']) } },
    );
    checkQuestions(ctx);
    expect(ctx.problems.all()).toEqual([]);
    expect(ctx.notices).toEqual([
      'El test q2 de la unidad u1 está fuera del sitio (content/unpublished.json).',
      'La pregunta q2/p1 del mapa está fuera del sitio (content/unpublished.json).',
    ]);
  });

  it('a question of the map that belongs to another assessment is not a missing one, and a missing one is told to leave', () => {
    const quizzes = [quiz('q9', B, { s: { g1: ['p9'] } }), quiz('q1', A, { s: { g1: ['p1'] } })];
    const ctx = contextOf(
      taxonomyOf([{ id: 'u1', title: 'u1', quizGroups: ['q1/s/g1'], topics: topics('t1') }]),
      mapOf(
        [],
        [
          { id: 'q1/p1', topic: 't1' },
          { id: 'q9/p9', topic: 't1' },
          { id: 'q1/p77', topic: 't1' },
          { id: 'q5/p1', topic: 't1' },
        ],
      ),
      { quizzes },
    );
    checkQuestions(ctx);
    expect(ctx.problems.all()).toEqual([
      `La pregunta q9/p9 del mapa es de ${B}, no de ${A}.`,
      'La pregunta q1/p77 del mapa no está publicada: sácala del mapa.',
      'La pregunta q5/p1 del mapa no está publicada: sácala del mapa.',
    ]);
  });

  it('a question whose topic was joined or retired is not counted twice: the map’s own check says so', () => {
    const ctx = contextOf(
      taxonomyOf([
        {
          id: 'u1',
          title: 'u1',
          quizGroups: ['q1/s/g1'],
          topics: [
            ...topics('t1'),
            { id: 't2', title: 't2', mergedInto: 't1' },
            { id: 't3', title: 't3', retired: true },
          ],
        },
      ]),
      mapOf(
        [],
        [
          { id: 'q1/p1', topic: 't2' },
          { id: 'q1/p2', topic: 't3' },
          { id: 'q1/p3', topic: 'zz' },
        ],
      ),
      { quizzes: [quiz('q1', A, { s: { g1: ['p1', 'p2', 'p3'] } })] },
    );
    expect(checkQuestions(ctx)).toBe(3);
    expect(ctx.problems.all()).toEqual([]);
    expect(ctx.counted).toEqual([]);
  });

  it('a question of a group of several units may take any of them, and the error lists them', () => {
    const quizzes = [quiz('q1', A, { s: { g1: ['p1', 'p2'] } })];
    const ctx = contextOf(
      taxonomyOf([
        { id: 'u1', title: 'u1', quizGroups: ['q1/s/g1'], topics: topics('t1') },
        { id: 'u2', title: 'u2', quizGroups: ['q1/s/g1'], topics: topics('t2') },
        { id: 'u3', title: 'u3', topics: topics('t3') },
      ]),
      mapOf(
        [],
        [
          { id: 'q1/p1', topic: 't2' },
          { id: 'q1/p2', topic: 't3' },
        ],
      ),
      { quizzes },
    );
    checkQuestions(ctx);
    expect(ctx.counted).toEqual([{ unit: 'u2', topic: 't2' }]);
    expect(ctx.problems.all()).toEqual([
      'La pregunta q1/p2 está en un grupo de las unidades u1, u2, y su tema t3 «t3» es de la unidad u3.',
    ]);
  });

  it('without tests in this import the check is skipped and says so', () => {
    const ctx = contextOf(taxonomyOf([]), mapOf(), { op: { tests: false } });
    expect(checkQuestions(ctx)).toBe(0);
    expect(ctx.unchecked).toEqual(['tests']);
  });
});
