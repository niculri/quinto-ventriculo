// Tests the URLs the web builds where they could go wrong: empty parts of a query, anchors, encoded segments.
import { describe, expect, it } from 'vitest';
import { assessmentAnchor, paths } from '../paths';

const course = { id: 'biologia-celular', semester: 2 };
const ref = { course, segments: ['certamen-2', 'clase 10'] };

describe('the URLs', () => {
  it('an assessment’s anchor is the part after its course, or the whole id without one', () => {
    expect(assessmentAnchor('biologia-celular/certamen-2')).toBe('certamen-2');
    expect(assessmentAnchor('certamen-2')).toBe('certamen-2');
    expect(paths.assessmentNotes(course, 'biologia-celular/certamen-2')).toBe(
      '/semesters/2/courses/biologia-celular/assessments/certamen-2/notes',
    );
  });

  it('a query leaves out its empty parts, and has no «?» when all are empty', () => {
    expect(paths.cards(ref, { q: 'tag:x', unit: '', day: null, view: undefined })).toBe(
      '/semesters/2/courses/biologia-celular/anki/certamen-2/clase%2010/cards?q=tag%3Ax',
    );
    expect(paths.cardsPractice(ref, {})).toBe(
      '/semesters/2/courses/biologia-celular/anki/certamen-2/clase%2010/cards/practice',
    );
    expect(paths.search('  ')).toBe('/search');
    expect(paths.search(' ribo ')).toBe('/search?q=ribo');
  });

  it('a test’s URL has its section and topics only when there are', () => {
    const quiz = { assessmentId: 'biologia-celular/certamen-2', slug: 'práctica' };
    expect(paths.quiz(course, quiz)).toBe(
      '/semesters/2/courses/biologia-celular/tests/certamen-2/pr%C3%A1ctica',
    );
    expect(paths.quiz(course, quiz, 'b', ['t1', 't2'])).toBe(
      '/semesters/2/courses/biologia-celular/tests/certamen-2/pr%C3%A1ctica/b?topics=t1%2Ct2',
    );
    expect(paths.quiz(course, quiz, null, [])).toBe(paths.quiz(course, quiz));
    expect(paths.quiz(course, { assessmentId: 'suelto', slug: 'q' })).toBe(
      '/semesters/2/courses/biologia-celular/tests//q',
    );
  });

  it('the old browser takes a card’s template only with its note, and template 0 counts', () => {
    expect(paths.browse({ note: 'g/1', ord: 0 })).toBe('/anki/browse?note=g%2F1&ord=0');
    expect(paths.browse({ ord: 3 })).toBe('/anki/browse');
    expect(paths.browse({ note: 'g', ord: null })).toBe('/anki/browse?note=g');
    expect(paths.browse({ note: 'g' })).toBe('/anki/browse?note=g');
    expect(paths.browse()).toBe('/anki/browse');
  });

  it('a note’s old link keeps its anchor only when it has one', () => {
    expect(paths.legacyNote('10 núcleo', 'poros')).toBe('/notes/10%20n%C3%BAcleo#poros');
    expect(paths.legacyNote('10-nucleo')).toBe('/notes/10-nucleo');
    expect(paths.legacyNote('10-nucleo', null)).toBe('/notes/10-nucleo');
  });
});
