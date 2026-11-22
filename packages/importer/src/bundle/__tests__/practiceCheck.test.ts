// Tests that «Ponte a prueba» must point to a section and topics its test really has.
import type { ImportedNote, ImportedQuiz } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { checkPractice } from '../practiceCheck';

const quiz = (id: string, sections: Record<string, string[]>) =>
  ({
    id,
    sections: Object.entries(sections).map(([sid, groups]) => ({
      id: sid,
      groups: groups.map((g) => ({ id: g })),
    })),
  }) as unknown as ImportedQuiz;

const note = (id: string, practice?: object) => ({ id, practice }) as unknown as ImportedNote;

const message = (notes: ImportedNote[], quizzes: ImportedQuiz[]): string => {
  try {
    checkPractice(notes, quizzes);
  } catch (e) {
    return (e as Error).message;
  }
  return '';
};

describe('checkPractice', () => {
  it('ignores notes without a link to a test, or whose test is not in this import', () => {
    const quizzes = [quiz('q', { a: ['t1'] })];
    expect(
      message(
        [note('n1'), note('n2', { deck: 'Mazo' }), note('n3', { quizId: 'otro', section: 'zz' })],
        quizzes,
      ),
    ).toBe('');
  });

  it('a test with a single section does not need the note to name it, and its topics are checked there', () => {
    const quizzes = [quiz('q', { unica: ['t1', 't2'] })];
    expect(message([note('n', { quizId: 'q', groups: ['t2'] })], quizzes)).toBe('');
    expect(message([note('n', { quizId: 'q', groups: ['t9'] })], quizzes)).toContain(
      'n: la sección «unica» de q no tiene el tema «t9».',
    );
  });

  it('with several sections, topics need the section; a section that does not exist is reported with the topics that then have no section', () => {
    const quizzes = [quiz('q', { a: ['t1'], b: ['t2'] })];
    expect(message([note('n', { quizId: 'q', groups: ['t1'] })], quizzes)).toContain(
      'n: los temas de «Ponte a prueba» necesitan la sección del test.',
    );
    const missing = message([note('n', { quizId: 'q', section: 'c', groups: ['t1'] })], quizzes);
    expect(missing).toContain('n: el test q no tiene la sección «c».');
    expect(missing).toContain('necesitan la sección del test');
  });

  it('a link with only a quiz or only a section is fine; every problem of every note is listed', () => {
    const quizzes = [quiz('q', { a: ['t1'], b: ['t2'] })];
    expect(
      message([note('n', { quizId: 'q' }), note('m', { quizId: 'q', section: 'b' })], quizzes),
    ).toBe('');
    const text = message(
      [
        note('n1', { quizId: 'q', section: 'a', groups: ['x'] }),
        note('n2', { quizId: 'q', section: 'b', groups: ['t2', 'y'] }),
      ],
      quizzes,
    );
    expect(text).toMatch(/^«Ponte a prueba» con errores:\n- n1: .*«x»\.\n- n2: .*«y»\.$/);
  });
});
