// Tests «Uso» without React: how a figure is written (never an exact count below 5 students), the points of the chart
// by day, week or opens, the height of a bar, and the name and link of a deck, a test or a note.
import { FEW } from '@qv/schema';
import type { AnkiTreeDeck, Catalog, UsageFigures, UsageReport } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { buildAnkiTree } from '../../../catalog/model/tree';
import {
  barHeight,
  chartPoints,
  deckNamed,
  figure,
  isOpenKey,
  noteNamed,
  quizNamed,
  shortDay,
} from '../usage';

const figures = (n: number): UsageFigures => ({
  activeStudents: n,
  newStudents: n,
  ankiAnswers: n,
  newCards: n,
  roundsStarted: n,
  roundsFinished: n,
});

const report = (opens: UsageReport['opens']): UsageReport =>
  ({
    days: [
      { day: '2026-05-01', ...figures(1) },
      { day: '2026-05-02', ...figures(2) },
    ],
    weeks: [{ week: '2026-04-27', ...figures(3) }],
    opens,
  }) as UsageReport;

describe('a figure', () => {
  it.each([
    [null, false, '—'],
    [FEW, true, 'menos de 5'],
    [FEW, false, '—'],
    [0, false, '0'],
    [12345, false, '12.345'],
  ] as const)('%s (students: %s) reads %s', (v, students, text) => {
    expect(figure(v, students)).toBe(text);
  });
});

describe('the points of the chart', () => {
  it('nothing until the report comes', () => {
    expect(chartPoints(null, 'ankiAnswers', false)).toEqual([]);
  });

  it('a figure goes by day or by week', () => {
    const r = report(null);
    expect(chartPoints(r, 'ankiAnswers', false)).toEqual([
      { label: '2026-05-01', value: 1 },
      { label: '2026-05-02', value: 2 },
    ]);
    expect(chartPoints(r, 'ankiAnswers', true)).toEqual([{ label: '2026-04-27', value: 3 }]);
  });

  it('the opens go by day even when the week is chosen, and without opens there are no points', () => {
    const opens = {
      days: [{ day: '2026-05-02', notes: 7, decks: FEW, quizzes: 0, searches: 1 }],
    } as UsageReport['opens'];
    expect(chartPoints(report(opens), 'decks', true)).toEqual([
      { label: '2026-05-02', value: FEW },
    ]);
    expect(chartPoints(report(null), 'notes', false)).toEqual([]);
    expect(isOpenKey('searches')).toBe(true);
    expect(isOpenKey('newCards')).toBe(false);
  });
});

describe('the height of a bar', () => {
  it.each([
    [FEW, 10, '4%'],
    [0, 10, '0%'],
    [1, 1000, '2%'],
    [5, 10, '50%'],
    [10, 10, '100%'],
  ] as const)('%s of %s is %s', (v, max, height) => {
    expect(barHeight(v, max)).toBe(height);
  });
});

describe('the name of a deck', () => {
  const extra = (over: Partial<AnkiTreeDeck>): AnkiTreeDeck => ({
    ...CATALOG.anki.decks[0]!,
    parentId: '3',
    semester: null,
    courseId: null,
    assessmentId: null,
    ...over,
  });
  const catalog: Catalog = {
    ...CATALOG,
    anki: {
      ...CATALOG.anki,
      decks: [
        ...CATALOG.anki.decks,
        extra({ id: '90', name: '() Medicina UCH::1° Semestre::🦴 Anatomía I::Suelto' }),
      ],
    },
  };
  const tree = buildAnkiTree(catalog);

  it('a deck that is not in the tree reads by its id, without a link', () => {
    expect(deckNamed(tree, '999')).toEqual({ name: 'Mazo 999', detail: null, to: null });
  });

  it('a deck with a page links to it and says its course', () => {
    const named = deckNamed(tree, '3');
    expect([named.name, named.detail]).toEqual(['🦴 Anatomía I', 'Anatomía I']);
    expect(named.to).toMatch(/^\/semesters\/1\/courses\/anatomia-1/);
  });

  it('a deck without a page links to the closest ancestor that has one', () => {
    expect(deckNamed(tree, '90')).toEqual({
      name: 'Suelto',
      detail: null,
      to: deckNamed(tree, '3').to,
    });
  });

  it('the decks above the courses have no link', () => {
    expect(deckNamed(tree, '2')).toEqual({ name: '1° Semestre', detail: null, to: null });
  });
});

describe('the name of a test and a note', () => {
  it('a test of the catalog links to it with its course; an unknown one reads by its id', () => {
    const quiz = quizNamed(CATALOG, 'practica-biocel');
    expect([quiz.name, quiz.detail]).toEqual(['Práctica de Biocel', 'Biología celular']);
    expect(quiz.to).toMatch(/\/practica$/);
    expect(quizNamed(CATALOG, 'no-existe')).toEqual({ name: 'no-existe', detail: null, to: null });
  });

  it('a note of the catalog links to it with its course; an unknown one reads by its slug', () => {
    const note = noteNamed(CATALOG, '11-traduccion');
    expect([note.name, note.detail]).toEqual(['Traducción', 'Biología celular']);
    expect(note.to).toMatch(/\/11-traduccion$/);
    expect(noteNamed(CATALOG, 'otro')).toEqual({ name: 'otro', detail: null, to: null });
  });
});

describe('a short day', () => {
  it('is the day of the date itself, whatever the time zone', () => {
    expect(shortDay('2026-01-01')).toMatch(/^1 ene/);
  });
});
