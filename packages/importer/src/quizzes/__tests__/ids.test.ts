// Tests the ids of a test and of its questions.
import { describe, expect, it } from 'vitest';
import { defaultQuizId, questionId } from '../ids';

describe('the skill’s inline syntax', () => {
  it('a test’s id when the manifest does not fix one', () => {
    expect(defaultQuizId('biologia-celular/certamen-2', 'preguntas-de-practica')).toBe(
      'biologia-celular-certamen-2-preguntas-de-practica',
    );
  });
});

describe('question ids', () => {
  it('the skill’s id, else the source tag of the note, else group and number', () => {
    expect(questionId({ id: 'X-1', nota: '[D-p01-03] …' }, '01', 1)).toBe('X-1');
    expect(questionId({ nota: '[D-p01-02 + A-p03-02, A-p03] A también marca c)' }, '01', 4)).toBe(
      'D-p01-02',
    );
    expect(questionId({ nota: '[N03-12] Materia: …' }, '03', 12)).toBe('N03-12');
    expect(questionId({ nota: '[A-p21-43 + B-p21]' }, '07', 1)).toBe('A-p21-43');
    expect(questionId({ nota: 'Sin etiqueta' }, '05', 3)).toBe('05-3');
    expect(questionId({}, '05', 3)).toBe('05-3');
  });

  it('from the second tab on, the default id goes with its tab (every tab can have its «01»)', () => {
    expect(questionId({}, '01', 2, 'seminario')).toBe('seminario.01-2');
    expect(questionId({ nota: '[N-01] …' }, '01', 2, 'seminario')).toBe('N-01');
    expect(questionId({ id: 'X-1' }, '01', 2, 'seminario')).toBe('X-1');
  });
});
