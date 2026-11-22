// Tests the cards page's scope and its units: which assessments it covers, the list of units and their titles.
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { buildAnkiTree } from '../tree';
import type { CourseDeckNode } from '../tree';
import { cardsScope, lectureTitle, scopeNodeOf, unitNode, unitOf, unitOptions } from '../scope';

const tree = buildAnkiTree(CATALOG);
const node = (id: string) => tree.byId.get(id)! as CourseDeckNode;

describe('cardsScope', () => {
  it('the course covers its assessments with decks; an assessment, only itself', () => {
    expect(cardsScope(CATALOG, node('3')).assessments.map((a) => a.id)).toEqual([
      'anatomia-1/certamen-1',
    ]);
    expect(cardsScope(CATALOG, node('4')).deckIds).toEqual(['4', '5', '20', '21']);
  });

  it('a course the catalog does not have covers no assessment', () => {
    expect(cardsScope({ ...CATALOG, semesters: [] }, node('3')).assessments).toEqual([]);
  });
});

describe('lectureTitle', () => {
  it('the path from the scope down, the scope itself when it is the lecture, and «Otras tarjetas» for none', () => {
    expect(lectureTitle(node('4'), node('20'))).toBe('S1 - Semana de prueba › Mazo de prueba');
    expect(lectureTitle(node('4'), node('4'))).toBe('Certamen 1');
    expect(lectureTitle(node('4'), undefined)).toBe('Otras tarjetas');
  });
});

describe('unitOptions', () => {
  it('the whole course or the whole assessment first, then its units with cards', () => {
    expect(unitOptions(node('3'))).toEqual([
      { value: '', label: 'Todo el ramo' },
      { value: 'certamen-1', label: 'Certamen 1' },
    ]);
    expect(unitOptions(node('4'))[0]).toEqual({ value: '', label: 'Todo el certamen' });
  });

  it('a unit the list does not offer, from the address, goes after its week; with no week, at the end', () => {
    expect(unitOptions(node('4'), 's1-semana-de-prueba/mazo-de-prueba')).toEqual([
      { value: '', label: 'Todo el certamen' },
      { value: 's1-semana-de-prueba', label: 'S1 - Semana de prueba' },
      {
        value: 's1-semana-de-prueba/mazo-de-prueba',
        label: 'S1 - Semana de prueba › Mazo de prueba',
      },
    ]);
    expect(unitOptions(node('20'), 'extras')).toEqual([
      { value: '', label: 'Todo el certamen' },
      { value: 'extras', label: 'Extras' },
    ]);
    expect(unitOptions(node('4'), 'no-existe')).toHaveLength(2);
  });
});

describe('the units of an address', () => {
  it('a unit is found by its slugs below the scope, and a missing one or none is nothing', () => {
    expect(unitNode(node('4'), 's1-semana-de-prueba/mazo-de-prueba')?.id).toBe('20');
    expect(unitNode(node('4'), 's1-semana-de-prueba/nada')).toBeNull();
    expect(unitNode(node('4'), '')).toBeNull();
  });

  it('a deck’s unit is its path from the scope; outside the scope, none', () => {
    expect(unitOf(node('4'), node('21'))).toBe('s1-semana-de-prueba/mazo-de-prueba/extras');
    expect(unitOf(node('4'), node('4'))).toBe('');
    expect(unitOf(node('20'), node('4'))).toBeNull();
  });

  it('the scope of a deck is its nearest assessment or course with a page; above a course, none', () => {
    expect(scopeNodeOf(node('21'))?.id).toBe('4');
    expect(scopeNodeOf(node('3'))?.id).toBe('3');
    expect(scopeNodeOf(tree.byId.get('2')!)).toBeNull();
  });
});
