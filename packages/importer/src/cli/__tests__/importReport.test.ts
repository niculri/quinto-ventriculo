// Tests the lines `npm run import` prints after saving: what it says of each kind, of the images and of the notices.
import type { ContentBundle } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import type { BuildResult } from '../../bundle/types';
import { emptyReport } from '../../sync/report';
import type { Report } from '../../sync/report';
import { noticesOf, summaryOf } from '../importReport';
import type { SummaryInput } from '../importReport';

const built = (over: Partial<BuildResult> = {}): BuildResult =>
  ({
    notesIncluded: true,
    decksIncluded: true,
    testsIncluded: true,
    unpublished: [],
    taxonomy: [],
    ...over,
  }) as BuildResult;

const bundle = {
  notes: [{}, {}],
  ankiDecks: [{}, {}, {}],
  ankiNotes: [{ cards: [{}, {}] }, { cards: [{}] }],
  quizzes: [{ questionCount: 10 }, { questionCount: 5 }],
} as unknown as ContentBundle;

const input = (over: Partial<SummaryInput> = {}, report: Partial<Report> = {}): SummaryInput => ({
  built: built(),
  bundle,
  report: { ...emptyReport(), ...report },
  assessments: [],
  remote: false,
  images: { misses: 3, hits: 9 },
  reviewUrl: null,
  seconds: 12.34,
  ...over,
});

const lines = (i: SummaryInput) => summaryOf(i).split('\n');

describe('summaryOf', () => {
  it('starts with a blank line, says what it covers, and ends with the time to one decimal', () => {
    const out = lines(input());
    expect(out[0]).toBe('');
    expect(out[1]).toBe('Todas las evaluaciones.');
    expect(out.at(-1)).toBe('Tiempo: 12.3 s.');
    expect(lines(input({ assessments: ['a/1', 'b/2'] }))[1]).toBe('Solo: a/1, b/2.');
  });

  it('says each kind with its counts, or that it was not touched', () => {
    const out = lines(
      input(
        {},
        {
          changedNotes: ['a'],
          unchangedNotes: ['b'],
          removedNotes: 4,
          changedCards: ['x'],
          unchangedCards: ['y', 'z'],
          removedCards: 1,
          changedQuizzes: ['q'],
          removedQuizzes: 2,
        },
      ),
    );
    expect(out).toContain('2 apuntes: 1 con cambios, 1 iguales, 4 quitados.');
    expect(out).toContain(
      '3 mazos de Anki, 2 notas (3 tarjetas): 1 notas con cambios, 2 iguales, 1 quitadas.',
    );
    expect(out).toContain('2 tests (15 preguntas): 1 con cambios, 0 iguales, 2 quitados.');
    const none = lines(
      input({ built: built({ notesIncluded: false, decksIncluded: false, testsIncluded: false }) }),
    );
    expect(none).toContain('Apuntes: sin tocar.');
    expect(none).toContain('Mazos de Anki: sin tocar.');
    expect(none).toContain('Tests: sin tocar.');
  });

  it('cards that moved or left are told only when there are some, and either one is enough', () => {
    const deckLine = (report: Partial<Report>) =>
      lines(input({}, report)).find((l) => l.includes('mazos de Anki'))!;
    expect(deckLine({})).not.toContain('cambiaron de mazo');
    expect(deckLine({ movedCards: 2 })).toContain('volvieron: 2; que salieron: 0');
    expect(deckLine({ retiredCards: 3 })).toContain('volvieron: 0; que salieron: 3');
  });

  it('images: what was uploaded and converted; the note about the check only when it is remote', () => {
    const local = lines(input({}, { mediaUploaded: 5, mediaExisting: 7 })).find((l) =>
      l.startsWith('Imágenes'),
    )!;
    expect(local).toBe('Imágenes: 5 subidas, 7 ya estaban; convertidas 3, de la caché 9.');
    const remote = lines(input({ remote: true })).find((l) => l.startsWith('Imágenes'))!;
    expect(remote).toContain('ya estaban (solo se revisan las de lo que cambió); convertidas');
  });

  it('the browser indexes are told only when decks were imported, with the removed ones only if any', () => {
    const index = (i: SummaryInput) => lines(i).find((l) => l.startsWith('Índices'));
    expect(
      index(
        input({}, { indexesWritten: 1, indexesUnchanged: 2, thumbsUploaded: 4, thumbsExisting: 6 }),
      ),
    ).toBe('Índices del explorador: 1 escritos, 2 iguales; miniaturas: 4 subidas, 6 ya estaban.');
    expect(index(input({}, { indexesRemoved: 3 }))).toContain('0 iguales, 3 quitados;');
    expect(index(input({ built: built({ decksIncluded: false }) }))).toBeUndefined();
  });

  it('what is off the site, the taxonomy and the review link come in that order, each only if there is something', () => {
    const out = lines(
      input({
        built: built({
          unpublished: [
            { kind: 'quiz', id: 'q-1', what: '«Práctica»' },
            { kind: 'deck', id: '9', what: '«Mazo»' },
          ],
          taxonomy: [
            {
              assessmentId: 'a/1',
              version: null,
              units: 0,
              topics: 0,
              cards: 0,
              questions: 0,
              unchecked: [],
              notices: [],
            },
          ],
        }),
        reviewUrl: 'https://sitio.example/admin/releases',
      }),
    );
    const at = (start: string) => out.findIndex((l) => l.startsWith(start));
    expect(out[at('Fuera del sitio')]).toBe(
      'Fuera del sitio (content/unpublished.json), no se publica: quiz q-1 «Práctica»; deck 9 «Mazo».',
    );
    expect(at('Fuera del sitio')).toBeLessThan(at('Sin taxonomía'));
    expect(at('Sin taxonomía')).toBeLessThan(at('En el borrador'));
    expect(out[at('En el borrador')]).toBe(
      'En el borrador: lo publicado no cambió. Revisión: https://sitio.example/admin/releases',
    );
    expect(
      lines(input()).some((l) => l.startsWith('En el borrador') || l.startsWith('Fuera del sitio')),
    ).toBe(false);
  });
});

describe('noticesOf', () => {
  const report = (assessmentId: string, notices: string[]) => ({
    assessmentId,
    version: 1,
    units: 1,
    topics: 1,
    cards: 0,
    questions: 0,
    unchecked: [],
    notices,
  });

  it('nothing when no assessment has notices', () => {
    expect(noticesOf(built({ taxonomy: [report('a/1', []), report('b/1', [])] }))).toBeNull();
    expect(noticesOf(built())).toBeNull();
  });

  it('the count and each notice under its assessment, in order', () => {
    expect(
      noticesOf(built({ taxonomy: [report('a/1', ['uno', 'dos']), report('b/1', ['tres'])] })),
    ).toBe(
      '\nⓘ 3 avisos de la taxonomía (no frenan la importación):\n  - a/1: uno\n  - a/1: dos\n  - b/1: tres',
    );
  });
});
