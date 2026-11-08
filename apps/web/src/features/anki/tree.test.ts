import { describe, expect, it } from 'vitest';
import type { AnkiTreeDeck, Catalog } from '@qv/schema';
import { buildAnkiTree } from './tree';

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
  return { semesters: [], anki: { decks, presets: [], noteTypes: [] } } as unknown as Catalog;
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
