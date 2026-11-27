// Tests the model of «Tarjetas»: the scope made valid, each card with its index's code and front and its explorer, the
// figures as text, the summary and the CSV file.
import type { CardQuality } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { CARD_INDEX } from '../../../../test/fixtures/cards';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { buildAnkiTree } from '../../../catalog/model/tree';
import {
  emptyText,
  indexRefs,
  interval,
  percent,
  qualityCsv,
  qualityRows,
  qualityScope,
  qualitySummary,
  rateText,
  seconds,
} from '../cardQuality';

const tree = buildAnkiTree(CATALOG);

const card = (over: Partial<CardQuality> = {}): CardQuality => ({
  noteGuid: 'cloze-1',
  ord: 1,
  deckId: '20',
  version: 2,
  students: 12,
  firstView: { n: 12, again: 4, low: 0.1381, high: 0.6094 },
  reviews: { n: 40, again: 10, low: 0.1422, high: 0.4004 },
  predicted: { n: 30, again: 9, expected: 0.1 },
  medianMs: 1450,
  suspended: 3,
  buried: 1,
  flagged: 2,
  leeches: 0,
  openReports: 1,
  reasons: ['unexpected', 'fast'],
  ...over,
});

describe('qualityScope', () => {
  it('starts on the first course, whole; a week narrows it and a course change drops what was below', () => {
    const first = qualityScope(tree, { course: '', assessment: '', unit: '' });
    expect(first.courses).toEqual([{ value: '3', label: 'Anatomía I' }]);
    expect(first.assessments.map((a) => a.label)).toEqual(['Todo el ramo', 'Certamen 1']);
    expect(first.units).toEqual([{ value: '', label: 'Todo el certamen' }]);
    expect(first.deck?.id).toBe('3');
    expect(first.title).toBe('Anatomía I');
    const week = qualityScope(tree, { course: '3', assessment: '4', unit: '5' });
    expect(week.units.map((u) => u.value)).toEqual(['', '5']);
    expect(week.deck?.id).toBe('5');
    expect(week.choice).toEqual({ course: '3', assessment: '4', unit: '5' });
    expect(qualityScope(tree, { course: '3', assessment: '4', unit: '' }).deck?.id).toBe('4');
    expect(qualityScope(tree, { course: '99', assessment: '4', unit: '5' }).choice).toEqual({
      course: '3',
      assessment: '4',
      unit: '5',
    });
    expect(qualityScope(tree, { course: '3', assessment: '77', unit: '5' }).choice).toEqual({
      course: '3',
      assessment: '',
      unit: '',
    });
  });

  it('without a tree or courses with cards, nothing to look at', () => {
    const none = qualityScope(null, { course: '', assessment: '', unit: '' });
    expect(none.deck).toBeNull();
    expect(none.title).toBe('');
    expect(none.courses).toEqual([]);
    expect(none.choice).toEqual({ course: '', assessment: '', unit: '' });
  });
});

describe('qualityRows', () => {
  it('the code and front without the answers, the deck and the card in the explorer of its assessment', () => {
    const [row] = qualityRows([card()], [CARD_INDEX], tree);
    expect(row).toMatchObject({
      code: 'T-PR-01-002',
      text: 'La columna tiene […] vértebras […]',
      deckLabel: 'Certamen 1 › S1 - Semana de prueba › Mazo de prueba',
    });
    expect(row!.explorer).toBe(
      '/semesters/1/courses/anatomia-1/anki/certamen-1/cards?card=1%3Acloze-1',
    );
  });

  it('a card right under the course opens in the course’s explorer', () => {
    expect(qualityRows([card({ deckId: '3' })], [], tree)[0]!.explorer).toBe(
      '/semesters/1/courses/anatomia-1/anki/cards?card=1%3Acloze-1',
    );
  });

  it('the indexes to read: one per assessment with an index, none for a deck it does not know', () => {
    expect(indexRefs([card(), card({ noteGuid: 'x' }), card({ deckId: '999' })], tree)).toEqual([
      {
        id: 'anatomia-1/certamen-1',
        hash: CATALOG.semesters[0]!.courses[0]!.assessments[0]!.cardIndex!.hash,
      },
    ]);
    expect(indexRefs([card({ deckId: '3' })], tree)).toEqual([]);
    expect(indexRefs([card()], null)).toEqual([]);
    const withoutIndex = structuredClone(CATALOG);
    delete withoutIndex.semesters[0]!.courses[0]!.assessments[0]!.cardIndex;
    expect(indexRefs([card()], buildAnkiTree(withoutIndex))).toEqual([]);
  });

  it('before its index, or of a deck the tree does not have: no text, no explorer', () => {
    expect(qualityRows([card()], [], tree)[0]).toMatchObject({ code: null, text: null });
    expect(qualityRows([card({ deckId: '999' })], [], tree)[0]).toMatchObject({
      deckLabel: '',
      explorer: null,
    });
    expect(qualityRows([card()], [], null)[0]!.explorer).toBeNull();
  });
});

describe('the figures as text', () => {
  it('percent, interval, seconds and a rate that has no figures', () => {
    expect(percent(0.333)).toBe('33 %');
    expect(interval({ n: 10, again: 5, low: 0.2366, high: 0.7634 })).toBe('24–76 %');
    expect(seconds(1450)).toBe('1,5 s');
    expect(seconds(null)).toBe('—');
    expect(rateText(null)).toBe('—');
    expect(rateText({ n: 40, again: 10, low: 0, high: 1 })).toBe('25 %');
  });

  it('the summary: when it was made and how many cards, or that it is not made yet', () => {
    const report = {
      status: 'ok' as const,
      deckId: '3',
      refreshedAt: '2026-11-26T09:37:00.000Z',
      minStudents: 5,
      measured: 1,
      few: 3,
      hardest: [],
      suspicious: [],
    };
    expect(qualitySummary(null)).toBe('');
    expect(qualitySummary(report)).toBe(
      'Calculado el 26 de noviembre de 2026 a las 06:37 · 1 tarjeta con cifras · 3 con menos de 5 estudiantes',
    );
    expect(qualitySummary({ ...report, measured: 2 })).toContain('2 tarjetas con cifras');
    expect(qualitySummary({ ...report, refreshedAt: null })).toBe(
      'Las cifras todavía no se calculan: se calculan cada noche.',
    );
    expect(emptyText({ ...report, measured: 0 }, 'hardest', 5)).toBe(
      'Todavía no hay ninguna tarjeta de aquí vista por 5 estudiantes o más.',
    );
    expect(emptyText(report, 'hardest', 5)).toContain('tiene repasos de 5 estudiantes');
    expect(emptyText(null, 'hardest', 5)).toContain('tiene repasos de 5 estudiantes');
    expect(emptyText(report, 'suspicious', 5)).toBe(
      'Ninguna tarjeta de aquí es sospechosa por ahora.',
    );
  });
});

describe('qualityCsv', () => {
  it('a row per card with its code, its figures in a spreadsheet’s Spanish, and nothing of a student', () => {
    const rows = qualityRows(
      [
        card(),
        card({
          noteGuid: 's@/AqX%n?#',
          ord: 0,
          version: null,
          firstView: null,
          reviews: null,
          predicted: null,
          medianMs: null,
          reasons: [],
        }),
      ],
      [CARD_INDEX],
      tree,
    );
    rows[1]!.text = 'Con "comillas"; y punto y coma';
    const csv = qualityCsv(rows);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, first, second] = csv.slice(1).split('\r\n');
    expect(header!.split(';')).toHaveLength(23);
    expect(header).toMatch(/^Código;Versión;Mazo;Frente;Estudiantes;/);
    expect(first!.split(';')).toEqual([
      'T-PR-01-002',
      '2',
      'Certamen 1 › S1 - Semana de prueba › Mazo de prueba',
      'La columna tiene […] vértebras […]',
      '12',
      '33,3',
      '13,8',
      '60,9',
      '12',
      '25',
      '14,2',
      '40',
      '40',
      '10',
      '1,5',
      '3',
      '1',
      '2',
      '0',
      '1',
      'Falla más de lo esperado · Respuesta en menos de 2 s',
      'cloze-1',
      '1',
    ]);
    expect(second).toBe(
      'T-PR-01-001;;Certamen 1 › S1 - Semana de prueba › Mazo de prueba;"Con ""comillas""; y punto y coma";12;;;;;;;;;;;3;1;2;0;1;;s@/AqX%n?#;0',
    );
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv).not.toMatch(/@ug\.uchile\.cl/);
  });

  it("a text that starts like a formula goes after a «'», a negative number goes as a number", () => {
    const [row] = qualityRows([card()], [], tree);
    const cells = (over: Partial<NonNullable<typeof row>>) =>
      qualityCsv([{ ...row!, ...over }])
        .slice(1)
        .split('\r\n')[1]!
        .split(';');
    const formula = cells({ code: '=HYPERLINK("http://x")', deckLabel: '-2+3', text: '@SUM(A1)' });
    expect(formula.slice(0, 1)).toEqual([`"'=HYPERLINK(""http://x"")"`]);
    expect(formula[2]).toBe("'-2+3");
    expect(formula[3]).toBe("'@SUM(A1)");
    expect(cells({ code: '+1' })[0]).toBe("'+1");
    expect(cells({ code: '\tx' })[0]).toBe("'\tx");
    expect(cells({ code: '\rx' })[0]).toBe(`"'\rx"`);
    expect(cells({ code: 'T-1=2' })[0]).toBe('T-1=2');
    expect(cells({ students: -3, suspended: -1.5 })[4]).toBe('-3');
    expect(cells({ students: -3, suspended: -1.5 })[15]).toBe('-1,5');
  });
});
