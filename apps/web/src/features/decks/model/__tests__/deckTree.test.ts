// Tests the simple deck list: which subdecks show, which rows a fold or a depth hides, what each row's switch is and
// what «Estudiar» turns on.

import { describe, expect, it } from 'vitest';
import { activation, EMPTY_PLAN } from '@qv/study';
import type { StudyPlan } from '@qv/study';
import type { CourseDeckNode, DeckNode } from '../../../catalog/model/tree';
import {
  allNodes,
  isOff,
  rowsToTurnOn,
  rowSwitch,
  switchRows,
  treeRows,
  visibleChildren,
} from '../deckTree';
import { deckNode as deck } from '../../../../test/decksFakes';

// () Raíz › Semestre › Ramo › Certamen › Semana 1 › Clase (› Extras) and Semana 2 › Clase B; the ramo has its own Extras.
const root = deck('root', '() Raíz', null);
const semester = deck('sem', 'Semestre', root);
const course = deck('course', 'Ramo', semester);
deck('course-x', 'Extras', course);
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

  it('a subdeck without cards does not show: it has no page to go to', () => {
    const holder = deck('holder', 'Semana', null);
    deck('full', 'Clase', holder);
    deck('empty', 'Clase vacía', holder).cardCount = 0;
    expect(ids(visibleChildren(holder, EMPTY_PLAN))).toEqual(['full']);
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

describe('the switch of a row', () => {
  const nodes = allNodes(assessment);
  const on = (...rows: [string, boolean][]) =>
    activation(nodes, {
      ...EMPTY_PLAN,
      activations: rows.map(([deckId, active]) => ({ deckId, active })),
    });

  it('a video has its own; a week of videos is all of them, «en parte» while only some are', () => {
    const a = on(['l1', true]);
    expect(rowSwitch(lecture, nodes, a)).toEqual({ kind: 'switch', on: true });
    expect(rowSwitch(week1, nodes, a)).toEqual({ kind: 'unit', on: 1, total: 1 });
    expect(rowSwitch(week2, nodes, a)).toEqual({ kind: 'unit', on: 0, total: 1 });
    expect(isOff(rowSwitch(week2, nodes, a))).toBe(true);
    expect(isOff(rowSwitch(week1, nodes, a))).toBe(false);
  });

  it('an Extras is on with its video, and the assessment with anything below it', () => {
    expect(rowSwitch(extras, nodes, on(['l1', true]))).toEqual({ kind: 'inside', on: true });
    expect(rowSwitch(assessment, nodes, on(['l2', true]))).toEqual({ kind: 'above', on: true });
    expect(rowSwitch(assessment, nodes, on())).toEqual({ kind: 'above', on: false });
  });

  it('saves a video alone and a week with its videos', () => {
    const a = on();
    expect(switchRows(lecture, a, true)).toEqual([{ deckId: 'l1', active: true }]);
    expect(switchRows(week2, a, false)).toEqual([
      { deckId: 'w2', active: false },
      { deckId: 'l2', active: false },
    ]);
  });

  it('«Estudiar» turns on what is off, never what is already on, nor a whole assessment', () => {
    const a = on(['l1', true]);
    const turnOn = (n: DeckNode) => rowsToTurnOn(n, nodes, a, rowSwitch(n, nodes, a));
    expect(turnOn(lectureB)).toEqual([{ deckId: 'l2', active: true }]);
    expect(turnOn(week2)).toEqual([
      { deckId: 'w2', active: true },
      { deckId: 'l2', active: true },
    ]);
    expect(turnOn(lecture)).toEqual([]);
    expect(turnOn(week1)).toEqual([]);
    expect(turnOn(assessment)).toEqual([]);
    const off = on();
    expect(rowsToTurnOn(extras, nodes, off, rowSwitch(extras, nodes, off))).toEqual([
      { deckId: 'l1', active: true },
    ]);
    expect(rowsToTurnOn(assessment, nodes, off, rowSwitch(assessment, nodes, off))).toEqual([]);
  });
});
