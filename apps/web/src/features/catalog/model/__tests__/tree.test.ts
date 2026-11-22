// Tests the Anki deck tree built from the catalog.

import { describe, expect, it } from 'vitest';
import type { AnkiTreeDeck, Catalog } from '@qv/schema';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { DECK_PATH } from '../../../../test/fixtures/deck';
import { buildAnkiTree, deckCrumbs, resolveCourseDeck, studyBackLabel } from '../tree';
import type { CourseDeckNode } from '../tree';

const WEEK = 'R::1° Semestre::Anatomía::Certamen 2::S4';
const IMAGES = `${WEEK}::06 - Imagenología`;
const IMAIOS = `${IMAGES} (IMAIOS)`;

function catalog(names: string[]): Catalog {
  const parentOf = (name: string) => name.split('::').slice(0, -1).join('::') || null;
  const decks = names.map((name) => ({
    id: name,
    name,
    parentId: parentOf(name),
    preset: null,
    semester: null,
    courseId: null,
    assessmentId: null,
    noteCount: 0,
    cardCount: 0,
  })) as AnkiTreeDeck[];
  return { semesters: [], anki: { decks, presets: [], noteTypes: [] } };
}

describe('buildAnkiTree', () => {
  // The catalog comes sorted as plain strings: « » goes before «:», so the Extras of «06 - Imagenología» come
  // after the deck with the suffix.
  const tree = buildAnkiTree(
    catalog([
      'R',
      'R::1° Semestre',
      'R::1° Semestre::Anatomía',
      'R::1° Semestre::Anatomía::Certamen 2',
      WEEK,
      IMAGES,
      IMAIOS,
      `${IMAIOS}::Extras`,
      `${IMAGES}::Extras`,
    ]),
  );

  it('lists each deck right before its subdecks, as Anki', () => {
    expect(tree.nodes.slice(-4).map((n) => n.name)).toEqual([
      IMAGES,
      `${IMAGES}::Extras`,
      IMAIOS,
      `${IMAIOS}::Extras`,
    ]);
  });

  it('keeps each «Extras» with its own parent', () => {
    expect(tree.byId.get(IMAGES)!.children.map((c) => c.name)).toEqual([`${IMAGES}::Extras`]);
    expect(tree.byId.get(IMAIOS)!.children.map((c) => c.name)).toEqual([`${IMAIOS}::Extras`]);
    expect(tree.byId.get(`${IMAGES}::Extras`)!.parent?.name).toBe(IMAGES);
  });
});

describe('the tree of the test catalog', () => {
  const tree = buildAnkiTree(CATALOG);
  const node = (id: string) => tree.byId.get(id)! as CourseDeckNode;

  it('a deck’s own cards are its cards minus its subdecks’', () => {
    expect(node('20').ownCards).toBe(3);
    expect(node('21').ownCards).toBe(1);
  });

  it('a deck whose parent, semester or course the catalog does not have hangs from nothing, and there may be no root', () => {
    const orphan = buildAnkiTree({
      ...CATALOG,
      anki: {
        ...CATALOG.anki,
        decks: [{ ...CATALOG.anki.decks[2]!, parentId: 'gone', semester: 9, courseId: 'gone' }],
      },
    });
    expect(orphan.root).toBeNull();
    const [only] = orphan.nodes;
    expect([only!.parent, only!.semesterInfo, only!.course]).toEqual([null, null, null]);
    expect(only!.ref).toEqual({ course: { id: 'gone', semester: 9 }, segments: [] });
  });

  it('a deck’s breadcrumbs: semester, course, assessment and its «Anki», each deck, and the deck itself without a link', () => {
    expect(deckCrumbs(node('20'))).toEqual([
      { label: 'Inicio', to: '/home' },
      { label: '1° Semestre', to: '/semesters/1' },
      { label: 'Anatomía I', to: '/semesters/1/courses/anatomia-1' },
      { label: 'Certamen 1', to: '/semesters/1/courses/anatomia-1#certamen-1' },
      { label: 'Anki', to: '/semesters/1/courses/anatomia-1/anki/certamen-1' },
      {
        label: 'S1 - Semana de prueba',
        to: '/semesters/1/courses/anatomia-1/anki/certamen-1/s1-semana-de-prueba',
      },
      { label: 'Mazo de prueba' },
    ]);
  });

  it('the course’s own deck ends in «Anki», and a last crumb given keeps every link', () => {
    expect(deckCrumbs(node('3')).slice(-2)).toEqual([
      { label: 'Anatomía I', to: '/semesters/1/courses/anatomia-1' },
      { label: 'Anki' },
    ]);
    expect(deckCrumbs(node('21'), { label: 'Tarjetas' }).slice(-3)).toEqual([
      { label: 'Mazo de prueba', to: DECK_PATH },
      { label: 'Extras', to: `${DECK_PATH}/extras` },
      { label: 'Tarjetas' },
    ]);
  });

  it('without the course or the assessment in the catalog, the crumbs use the decks’ names', () => {
    const bare = buildAnkiTree({ ...CATALOG, semesters: [] });
    expect(deckCrumbs(bare.byId.get('20') as CourseDeckNode).map((c) => c.label)).toEqual([
      'Inicio',
      '🦴 Anatomía I',
      'Certamen 1',
      'S1 - Semana de prueba',
      'Mazo de prueba',
    ]);
  });
});

describe('studyBackLabel', () => {
  const tree = buildAnkiTree(CATALOG);

  it('the course, and from an assessment down, the course with its assessment', () => {
    expect(studyBackLabel(tree.byId.get('3')!)).toBe('Anatomía I');
    expect(studyBackLabel(tree.byId.get('20')!)).toBe('Anatomía I · Certamen 1');
  });

  it('without the course in the catalog, the names of the decks at the course’s and the assessment’s depth', () => {
    const bare = buildAnkiTree({ ...CATALOG, semesters: [] });
    expect(studyBackLabel(bare.byId.get('3')!)).toBe('🦴 Anatomía I');
    expect(studyBackLabel(bare.byId.get('20')!)).toBe('🦴 Anatomía I · Certamen 1');
    expect(studyBackLabel(bare.byId.get('2')!)).toBe('1° Semestre');
  });

  it('a deck outside any assessment goes back to its course only', () => {
    const loose = buildAnkiTree({
      ...CATALOG,
      anki: {
        ...CATALOG.anki,
        decks: CATALOG.anki.decks.map((d) => (d.id === '20' ? { ...d, assessmentId: null } : d)),
      },
    });
    expect(studyBackLabel(loose.byId.get('20')!)).toBe('Anatomía I');
  });
});

describe('resolveCourseDeck', () => {
  const tree = buildAnkiTree(CATALOG);

  it('an old address of a deck under another course is the old address, not a move', () => {
    const r = resolveCourseDeck(tree, '2', 'fisica', ['mazo-de-prueba', 'study'], null);
    expect(r).toMatchObject({ kind: 'legacy', what: 'study' });
    expect(r.kind === 'legacy' && r.node.id).toBe('20');
  });

  it('a deck of another course, under its own semester, has moved there', () => {
    const r = resolveCourseDeck(tree, '1', 'fisica', ['certamen-1', 's1-semana-de-prueba'], null);
    expect(r.kind).toBe('moved');
    expect(r.kind === 'moved' && [r.node.id, r.screen]).toEqual(['5', 'page']);
  });

  it('an old address with a subdeck that does not exist opens the deck', () => {
    const r = resolveCourseDeck(tree, '1', 'anatomia-1', ['mazo-de-prueba', 'options'], 'nada');
    expect(r).toMatchObject({ kind: 'legacy', what: 'options' });
    expect(r.kind === 'legacy' && r.node.id).toBe('20');
    const sub = resolveCourseDeck(tree, '1', 'anatomia-1', ['mazo-de-prueba'], 'extras');
    expect(sub.kind === 'legacy' && [sub.node.id, sub.what]).toEqual(['21', 'page']);
  });
});
