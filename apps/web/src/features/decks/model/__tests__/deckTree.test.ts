// Tests the simple deck list: which subdecks show, which rows a fold or a depth hides, and which units are on.

import { describe, expect, it } from 'vitest';
import { EMPTY_PLAN } from '@qv/study';
import type { StudyPlan } from '@qv/study';
import type { CourseDeckNode, DeckNode } from '../../../catalog/model/tree';
import { allNodes, isOn, treeRows, visibleChildren } from '../deckTree';
import { deckNode as deck } from '../../../../test/decksFakes';

// () Raíz › Semestre › Ramo › Certamen › Semana 1 › Clase (› Extras) and Semana 2 › Clase B; the ramo has its own Extras.
const root = deck('root', '() Raíz', null);
const semester = deck('sem', 'Semestre', root);
const course = deck('course', 'Ramo', semester);
const courseExtras = deck('course-x', 'Extras', course);
const assessment = deck('cert', 'Certamen', course);
const week1 = deck('w1', 'Semana 1', assessment);
const lecture = deck('l1', 'Clase', week1);
const extras = deck('l1-x', 'Extras', lecture);
const week2 = deck('w2', 'Semana 2', assessment);
const lectureB = deck('l2', 'Clase B', week2);

const withExtras = (deckId: string, includeExtras: boolean): StudyPlan => ({
  ...EMPTY_PLAN,
  assessments: [{ deckId, includeExtras, newPerDay: null }],
});
const ids = (nodes: DeckNode[]) => nodes.map((n) => n.id);

describe('the subdecks a deck shows', () => {
  it('an Extras shows only when its assessment includes the extras', () => {
    expect(ids(visibleChildren(lecture, EMPTY_PLAN))).toEqual([]);
    expect(ids(visibleChildren(lecture, withExtras('cert', true)))).toEqual(['l1-x']);
    expect(ids(visibleChildren(lecture, withExtras('cert', false)))).toEqual([]);
    expect(ids(visibleChildren(lecture, withExtras('other', true)))).toEqual([]);
  });

  it('a deck named Extras above the units is an ordinary deck', () => {
    expect(ids(visibleChildren(course, EMPTY_PLAN))).toEqual(['course-x', 'cert']);
  });

  it('an Extras whose assessment is missing from the tree does not show', () => {
    const holder = deck('holder', 'Suelto', null);
    const orphan: CourseDeckNode = {
      ...deck('orphan', 'Extras', null),
      name: '() Raíz::Semestre::Ramo::Otro certamen::Semana::Clase::Extras',
      depth: 6,
    };
    holder.children.push(orphan);
    expect(ids(visibleChildren(holder, withExtras('cert', true)))).toEqual([]);
  });
});

describe('the rows of the list', () => {
  it('walks depth first, in the order of the children', () => {
    expect(ids(treeRows(assessment, EMPTY_PLAN, new Set(), undefined))).toEqual([
      'w1',
      'l1',
      'w2',
      'l2',
    ]);
  });

  it('a folded deck shows its row but not its subdecks', () => {
    expect(ids(treeRows(assessment, EMPTY_PLAN, new Set(['w1']), undefined))).toEqual([
      'w1',
      'w2',
      'l2',
    ]);
  });

  it('stops opening decks at the given depth, which still shows', () => {
    expect(ids(treeRows(assessment, EMPTY_PLAN, new Set(), week1.depth))).toEqual(['w1', 'w2']);
    expect(ids(treeRows(assessment, EMPTY_PLAN, new Set(), lecture.depth))).toEqual([
      'w1',
      'l1',
      'w2',
      'l2',
    ]);
  });

  it('includes the Extras rows when the assessment takes them', () => {
    expect(ids(treeRows(assessment, withExtras('cert', true), new Set(), undefined))).toContain(
      'l1-x',
    );
  });
});

describe('all the decks of an assessment', () => {
  it('from a lecture: the whole assessment, breadth first from the assessment', () => {
    expect(ids(allNodes(lecture))).toEqual(['cert', 'w1', 'w2', 'l1', 'l2', 'l1-x']);
  });

  it('from the assessment or a deck above it: that deck and everything below', () => {
    expect(ids(allNodes(assessment))).toEqual(ids(allNodes(week2)));
    expect(ids(allNodes(course))[0]).toBe('course');
  });
});

describe('whether a deck is on', () => {
  it('a deck inside a unit is on when its unit is', () => {
    expect(isOn(extras, new Set(['w1']))).toBe(true);
    expect(isOn(extras, new Set(['w2']))).toBe(false);
    expect(isOn(week2, new Set(['w2']))).toBe(true);
  });

  it('a deck above the units is always on', () => {
    expect(isOn(assessment, new Set())).toBe(true);
    expect(isOn(courseExtras, new Set())).toBe(true);
  });

  it('tells apart two units with the same lectures', () => {
    expect([lectureB, lecture].map((n) => isOn(n, new Set(['w2'])))).toEqual([true, false]);
  });
});
