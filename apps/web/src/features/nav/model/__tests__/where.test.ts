// Tests where in the site a path is, for the menu.
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { DECK_PATH } from '../../../../test/fixtures/deck';
import { buildAnkiTree } from '../../../catalog/model/tree';
import { locate } from '../where';

const tree = buildAnkiTree(CATALOG);

describe('locate', () => {
  it.each([
    ['/settings/anki', { settings: true, semester: null }],
    ['/admin', { admin: true }],
    ['/admin/reports', { admin: true }],
    ['/administrar', { admin: false, semester: null }],
    ['/semesters/2/', { semester: 2, courseId: null }],
    ['/semesters/2/courses/f%C3%ADsica', { courseId: 'física', tab: null }],
    ['/semesters/2/courses/100%25x%', { courseId: '100%25x%' }],
  ])('%s', (path, where) => {
    expect(locate(path, CATALOG, tree)).toMatchObject(where);
  });

  it('a note gives its assessment from the catalog; one it does not have, or without the catalog, none', () => {
    const at = (slug: string, catalog = CATALOG) =>
      locate(`/semesters/2/courses/biologia-celular/notes/${slug}`, catalog, tree);
    expect(at('11-traduccion')).toMatchObject({
      tab: 'notes',
      noteSlug: '11-traduccion',
      assessmentId: 'biologia-celular/certamen-2',
    });
    expect(at('otra')).toMatchObject({ tab: 'notes', noteSlug: 'otra', assessmentId: null });
    expect(
      locate('/semesters/2/courses/biologia-celular/notes/11-traduccion', null, tree).assessmentId,
    ).toBeNull();
  });

  it('a test page names its assessment, and its test only when the path has it', () => {
    expect(
      locate('/semesters/2/courses/biologia-celular/tests/certamen-2/practica', CATALOG, tree),
    ).toMatchObject({
      tab: 'tests',
      assessmentId: 'biologia-celular/certamen-2',
      quizSlug: 'practica',
    });
    expect(
      locate('/semesters/2/courses/biologia-celular/tests/certamen-2', CATALOG, tree),
    ).toMatchObject({
      tab: 'tests',
      quizSlug: null,
    });
  });

  it('an assessment’s section is its notes, its tests or its gymkana', () => {
    const base = '/semesters/2/courses/biologia-celular/assessments/certamen-2';
    expect(locate(`${base}/gymkana`, CATALOG, tree).tab).toBe('gymkana');
    expect(locate(`${base}/gymkana/write`, CATALOG, tree).tab).toBe('gymkana');
    expect(locate(base, CATALOG, tree).tab).toBe('notes');
    expect(locate(`${base}/notes`, CATALOG, tree).tab).toBe('notes');
    expect(locate(`${base}/tests`, CATALOG, tree).tab).toBe('tests');
  });

  it('a deck page and its study are the deepest deck whose page starts the path; without the tree, none', () => {
    expect(locate(`${DECK_PATH}/study`, CATALOG, tree)).toMatchObject({
      tab: 'anki',
      deckId: '20',
      assessmentId: 'anatomia-1/certamen-1',
    });
    expect(locate(`${DECK_PATH}x`, CATALOG, tree).deckId).toBe('5');
    expect(locate(DECK_PATH, CATALOG, null)).toMatchObject({
      tab: 'anki',
      deckId: null,
      assessmentId: null,
    });
  });
});
