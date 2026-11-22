// Tests where a report of a test's question says it is.
import { describe, expect, it } from 'vitest';
import { QUIZ, QUIZ_SECTIONS } from '../../../../test/fixtures/quiz';
import { questionIndex } from '../../model/entries';
import { reportTarget } from '../reportTarget';

const course = { id: 'biologia-celular', semester: 2 };
const entry = questionIndex(QUIZ_SECTIONS.pautas!).get('D-p01-03')!;

describe('reportTarget', () => {
  it('names the question by test, group and number, and the page by its tab when the test has several', () => {
    expect(reportTarget(QUIZ, course, QUIZ.sections[0]!, entry)).toEqual({
      kind: 'quiz_question',
      id: `${QUIZ.id}/D-p01-03`,
      code: null,
      version: null,
      location: {
        path: '/semesters/2/courses/biologia-celular/tests/certamen-2/practica/pautas',
        title: 'Práctica de Biocel · Transcripción · Pregunta 1',
        quizId: QUIZ.id,
        sectionId: 'pautas',
        number: 1,
      },
    });
  });

  it('a test of one tab gives its page without the tab, and a long title is cut at 200', () => {
    const one = { ...QUIZ, title: 'x'.repeat(300), sections: [QUIZ.sections[0]!] };
    const { location } = reportTarget(one, course, one.sections[0]!, entry);
    expect(location.path).toBe('/semesters/2/courses/biologia-celular/tests/certamen-2/practica');
    expect(location.title).toHaveLength(200);
  });
});
