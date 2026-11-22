// Tests the lines of «Publicaciones» without React: the review status, the names that fall back when the draft lacks
// them, the summary of the popup to publish, the record's line and the error shown when a call fails.
import type { ReviewList } from '@qv/release-review';
import type { ReleaseAssessment, ReleaseOverview, ReleaseRecord } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { RELEASE_SUMMARY } from '../../../../test/releases';
import {
  assessmentNames,
  assessmentTitle,
  classTone,
  failure,
  indexLines,
  letter,
  releaseLine,
  releaseLines,
  reviewStatus,
  santiagoToday,
  siteLines,
  textOf,
} from '../releases';

type Summary = ReleaseOverview['summary'];

const assessment = (over: Partial<ReleaseAssessment> = {}): ReleaseAssessment => ({
  id: 'curso/c1',
  courseId: 'curso',
  courseName: 'Curso',
  semester: 1,
  name: 'Certamen 1',
  suggestedDate: null,
  suggestedDateBefore: null,
  articles: { added: 0, removed: 0, content: 0, format: 0 },
  questions: {
    added: 0,
    removed: 0,
    answer: 0,
    noAnswer: 0,
    format: 0,
    moved: 0,
    keyChanged: 0,
    total: 0,
  },
  quizzes: [],
  cards: { added: 0, removed: 0, moved: 0, answer: 0, noAnswer: 0, format: 0, notes: 0 },
  decks: [],
  impactDecks: [],
  ...over,
});

const summary = (over: Partial<Summary> = {}): Summary => ({
  ...RELEASE_SUMMARY,
  catalog: [],
  noteTypes: [],
  presets: [],
  decks: [],
  assessments: [],
  ...over,
});

const review = (over: Partial<ReviewList>): ReviewList => ({
  checks: [],
  manual: [],
  blocking: 0,
  pending: 0,
  ready: true,
  empty: false,
  ...over,
});

const deck = (over: Partial<Summary['decks'][number]>): Summary['decks'][number] => ({
  id: 'd',
  name: 'Medicina::Curso::Mazo',
  nameBefore: null,
  op: 'changed',
  cardsBefore: 1,
  cardsAfter: 1,
  presetBefore: null,
  presetAfter: null,
  ...over,
});

describe('the review status', () => {
  const mark = (checked: boolean) => ({ checked }) as ReviewList['manual'][number];
  it.each([
    ['still checking wins over everything', review({ pending: 2, blocking: 3 }), 'Revisando'],
    ['one blocking rule is singular', review({ blocking: 1 }), 'Hay 1 regla que impide'],
    ['several blocking rules', review({ blocking: 4 }), 'Hay 4 reglas'],
    ['all the marks by hand checked', review({ manual: [mark(true)] }), 'Nada impide publicar.'],
    [
      'one mark by hand missing',
      review({ manual: [mark(true), mark(false)] }),
      'faltan las marcas',
    ],
  ])('%s', (_, r, text) => {
    expect(reviewStatus(r)).toContain(text);
  });
});

describe('the tone of a change', () => {
  it.each([
    ['answer', 'warn'],
    ['content', 'warn'],
    ['format', 'muted'],
    ['no_answer', 'muted'],
    [null, 'muted'],
  ] as const)('%s is %s', (c, tone) => {
    expect(classTone(c)).toBe(tone);
  });
});

describe('the lines of the site', () => {
  it('names an assessment with its course, and with its course id when the draft has no course name', () => {
    const named = assessment({ id: 'a1', courseName: 'Física' });
    const unnamed = assessment({ id: 'a2', courseName: null, courseId: 'quimica' });
    const lines = siteLines(
      summary({
        assessments: [named, unnamed],
        catalog: [
          { kind: 'assessment', id: 'a1', op: 'added', before: null, after: { name: 'C1' } },
          { kind: 'assessment', id: 'a2', op: 'removed', before: { name: 'C2' }, after: null },
          { kind: 'course', id: 'ramo', op: 'changed', before: null, after: null },
        ],
      }),
    );
    expect(lines).toEqual([
      'La evaluación «Física · C1» es nueva.',
      'La evaluación «quimica · C2» sale.',
      'El ramo «ramo» cambia.',
    ]);
  });

  it('an assessment that is not in the summary keeps only its own name', () => {
    const lines = siteLines(
      summary({
        catalog: [
          { kind: 'assessment', id: 'x', op: 'changed', before: null, after: { name: 'C3' } },
        ],
      }),
    );
    expect(lines).toEqual(['La evaluación «C3» cambia.']);
  });

  it('a deck: new, gone, renamed, a new preset, or only moved, by the last part of its name', () => {
    const lines = siteLines(
      summary({
        decks: [
          deck({ op: 'added' }),
          deck({ op: 'removed' }),
          deck({ nameBefore: 'A::Viejo' }),
          deck({ nameBefore: 'Medicina::Curso::Mazo', presetBefore: null, presetAfter: 'Rápido' }),
          deck({}),
        ],
      }),
    );
    expect(lines).toEqual([
      'El mazo «Mazo» es nuevo.',
      'El mazo «Mazo» sale.',
      'El mazo «Viejo» pasa a llamarse «Mazo».',
      'El mazo «Mazo» pasa de la configuración «ninguna» a «Rápido».',
      'El mazo «Mazo» cambia de lugar.',
    ]);
  });
});

describe('the lines of the card browser', () => {
  it('each op has its line, and an assessment the catalog does not have reads by its id', () => {
    const names = assessmentNames(CATALOG);
    const lines = indexLines(
      {
        supportedSchemaVersion: 1,
        summary: summary(),
        browseIndexes: [
          { assessmentId: 'anatomia-1/certamen-1', op: 'added' },
          { assessmentId: 'otro/c9', op: 'removed' },
          { assessmentId: 'biologia-celular/certamen-2', op: 'changed' },
        ],
      },
      names,
    );
    expect(lines).toEqual([
      'Las tarjetas de «Anatomía I · Certamen 1» se pueden explorar.',
      'Las tarjetas de «otro/c9» dejan de poder explorarse.',
      'El explorador de tarjetas de «Biología celular · Certamen 2» se actualiza.',
    ]);
  });

  it('without a catalog there are no names', () => {
    expect(assessmentNames(undefined).size).toBe(0);
  });
});

describe('the title of an assessment', () => {
  it.each([
    ['course name and name', assessment(), 'Curso · Certamen 1'],
    ['course id without the name', assessment({ courseName: null }), 'curso · Certamen 1'],
    [
      'nothing of the course, id of the assessment',
      assessment({ courseName: null, courseId: null, name: null }),
      ' · curso/c1',
    ],
  ])('%s', (_, a, title) => {
    expect(assessmentTitle(a)).toBe(title);
  });
});

describe('the popup to publish', () => {
  it('counts each kind once, joins content and format, and skips what is zero', () => {
    const a = assessment({
      articles: { added: 1, removed: 2, content: 1, format: 1 },
      cards: { added: 3, removed: 0, moved: 1, answer: 1, noAnswer: 1, format: 1, notes: 4 },
      questions: {
        added: 0,
        removed: 1,
        answer: 2,
        noAnswer: 0,
        format: 1,
        moved: 0,
        keyChanged: 0,
        total: 3,
      },
    });
    expect(releaseLines(summary({ assessments: [a] }), [])).toEqual([
      'Curso · Certamen 1: 1 artículo nuevo, 2 artículos cambiados, 2 artículos que salen, 3 tarjetas nuevas, ' +
        '1 tarjeta que puede cambiar la respuesta, 2 tarjetas corregidas, 1 tarjeta que cambia de mazo, ' +
        '2 preguntas que pueden cambiar la respuesta, 1 pregunta corregida, 1 pregunta que sale.',
    ]);
  });

  it('an assessment with changes the counts do not show reads «cambios menores»; one without a course reads «null»', () => {
    const byId = assessment({
      courseName: null,
      name: null,
      cards: { ...assessment().cards, added: 2 },
    });
    expect(releaseLines(summary({ assessments: [byId] }), [])).toEqual([
      'curso · curso/c1: 2 tarjetas nuevas.',
    ]);
    const a = assessment({
      courseName: null,
      courseId: null,
      quizzes: [{ id: 'q', title: 'T', op: 'changed' }],
    });
    expect(releaseLines(summary({ assessments: [a] }), [])).toEqual([
      'null · Certamen 1: cambios menores.',
    ]);
  });

  it('an assessment that only comes into the catalog is left out, the site changes count as one line, and the indexes go last', () => {
    const empty = assessment({ id: 'vacia' });
    const lines = releaseLines(
      summary({
        assessments: [empty],
        catalog: [
          { kind: 'assessment', id: 'vacia', op: 'added', before: null, after: { name: 'X' } },
        ],
        presets: [{ name: 'P', op: 'added' }],
        decks: [deck({})],
      }),
      ['índice'],
    );
    expect(lines).toEqual(['Además, 3 cambios del catálogo o de los mazos de arriba.', 'índice']);
  });
});

describe('the record of a publication', () => {
  const record = (over: Partial<ReleaseRecord>): ReleaseRecord => ({
    id: 1,
    status: 'published',
    title: 't',
    schemaVersion: 1,
    publishedAt: '2026-03-10T15:00:00Z',
    publishedBy: 'autor@x.cl',
    revertedAt: null,
    revertedBy: null,
    changes: {},
    canRevert: true,
    ...over,
  });

  it('a published one says when and who', () => {
    expect(releaseLine(record({}))).toMatch(
      /^Publicada el 10 de marzo de 2026.* por autor@x\.cl\.$/,
    );
  });

  it('an undone one says when it was undone, and who only if known', () => {
    const undone = record({ status: 'reverted', revertedAt: '2026-03-11T15:00:00Z' });
    expect(releaseLine(undone)).toMatch(/^Deshecha el 11 de marzo de 2026 a las [^r]*\.$/);
    expect(releaseLine(undone)).not.toContain(' por ');
    expect(releaseLine({ ...undone, revertedBy: 'otra@x.cl' })).toMatch(/ por otra@x\.cl\.$/);
  });

  it('marked as undone but without the date it still reads as published', () => {
    expect(releaseLine(record({ status: 'reverted' }))).toMatch(/^Publicada el/);
  });
});

describe('small readers', () => {
  it('the error of a call: its message, or the fallback for an empty message or something that is not an Error', () => {
    expect(failure(new Error('falló'), 'otro')).toBe('falló');
    expect(failure(new Error(''), 'otro')).toBe('otro');
    expect(failure('texto', 'otro')).toBe('otro');
  });

  it('the letter of an alternative is a) for 0, and a dash for anything that is not a number', () => {
    expect([letter(0), letter(2), letter('1'), letter(undefined)]).toEqual(['a)', 'c)', '—', '—']);
  });

  it('textOf keeps only strings', () => {
    expect([textOf('a'), textOf(1), textOf(null)]).toEqual(['a', null, null]);
  });

  it('today is the date in Santiago, which is the day before in UTC early in the morning', () => {
    expect(santiagoToday(new Date('2026-06-02T02:00:00Z'))).toBe('2026-06-01');
    expect(santiagoToday(new Date('2026-06-02T12:00:00Z'))).toBe('2026-06-02');
  });
});
