// Tests for the release review list (one case per rule) and what a publication keeps of its review.
import { describe, expect, it } from 'vitest';
import { releasePlainText as plainText } from '@qv/html/text';
import type { ReleaseAssessment, ReleaseFinding, ReleaseSummary } from '@qv/schema/release';
import { buildReview, onlyInCatalog, releaseTitle, reviewChecks } from '../review';
import { CHECK_RULES } from '../reviewTypes';
import type { CheckRule, ReleaseReviewInput } from '../reviewTypes';

const FP = 'a'.repeat(32);
const assessment = (o: Partial<ReleaseAssessment> = {}): ReleaseAssessment => ({
  id: 'biologia-celular/certamen-2',
  courseId: 'biologia-celular',
  courseName: 'Biología celular',
  semester: 2,
  name: 'Certamen 2',
  suggestedDate: null,
  suggestedDateBefore: null,
  articles: { added: 0, removed: 0, content: 1, format: 0 },
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
  ...o,
});
const summary = (o: Partial<ReleaseSummary> = {}): ReleaseSummary => ({
  fingerprint: FP,
  schemaVersion: 1,
  unpublished: [],
  marks: [],
  catalog: [],
  noteTypes: [],
  presets: [],
  decks: [],
  assessments: [assessment()],
  findings: [],
  ...o,
});
const finding = (rule: string, key: string, detail: Record<string, unknown>): ReleaseFinding => ({
  rule,
  assessmentId: 'biologia-celular/certamen-2',
  key,
  detail,
});
const review = (o: Partial<ReleaseReviewInput> = {}) =>
  buildReview({
    summary: summary(),
    supportedSchemaVersion: 1,
    missingImages: [],
    phrases: [],
    today: '2026-11-07',
    ...o,
  });
const failing = (r: ReturnType<typeof review>) =>
  Object.fromEntries(
    r.checks.filter((c) => c.items.length).map((c) => [c.rule, c.items.map((i) => i.text)]),
  );
const only = (r: ReturnType<typeof review>, rule: CheckRule) =>
  r.checks.find((c) => c.rule === rule)!.items.map((i) => i.text);

describe('the review list', () => {
  it('a clean draft: nothing fails, and it is ready only with the marks by hand', () => {
    const r = review();
    expect(failing(r)).toEqual({});
    expect(r).toMatchObject({ blocking: 0, pending: 0, ready: false, empty: false });
    expect(r.manual.map((m) => [m.mark, m.checked])).toEqual([
      ['phone', false],
      ['answers', false],
    ]);
    const marked = review({
      summary: summary({
        marks: [
          { mark: 'phone', checkedBy: 'a@ug.uchile.cl', checkedAt: '2026-11-07T12:00:00Z' },
          { mark: 'answers', checkedBy: 'a@ug.uchile.cl', checkedAt: '2026-11-07T12:00:00Z' },
        ],
      }),
    });
    expect(marked.ready).toBe(true);
    expect(review({ marks: ['phone', 'answers', 'announcement'] }).manual.at(-1)).toMatchObject({
      mark: 'announcement',
      label: 'Leí el anuncio',
    });
  });

  it('every rule is in the list, blocks first', () => {
    const r = review();
    expect(r.checks.map((c) => c.rule)).toEqual(CHECK_RULES.map((c) => c.rule));
    const severities = r.checks.map((c) => c.severity);
    expect(severities.indexOf('warn')).toBeGreaterThan(severities.lastIndexOf('block'));
  });

  it('a draft without changes is empty and never ready', () => {
    const r = review({ summary: summary({ assessments: [] }) });
    expect(r).toMatchObject({ empty: true, ready: false });
  });

  it('while the images and the texts are being read, it is not ready', () => {
    const r = review({ missingImages: null, phrases: null });
    expect(r.pending).toBe(2);
    expect(r.checks.filter((c) => c.pending).map((c) => c.rule)).toEqual([
      'missing_image',
      'process_phrase',
    ]);
  });

  it('missing_image', () => {
    const r = review({ missingImages: ['cards/abc.webp'] });
    expect(only(r, 'missing_image')).toEqual(['cards/abc.webp no está en el almacén de imágenes.']);
    expect(r.blocking).toBe(1);
  });

  it('guid_changed: the same code, or almost the same text; guid_maybe when none is', () => {
    const r = review({
      summary: summary({
        findings: [
          finding('guid_candidates', 'biologia-celular/certamen-2', {
            removed: [
              { guid: 'a', code: 'T-BC-C2-11-001', text: 'El ribosoma tiene dos subunidades' },
              { guid: 'b', code: null, text: '¿Qué enzima carga el aminoácido en el tRNA?' },
            ],
            added: [
              { guid: 'x', code: 'T-BC-C2-11-001', text: 'Otro texto' },
              { guid: 'y', code: null, text: '¿Qué enzima carga el aminoácido en el tRNA? ' },
            ],
          }),
        ],
      }),
    });
    expect(only(r, 'guid_changed')).toHaveLength(2);
    expect(only(r, 'guid_maybe')).toEqual([]);
    const maybe = review({
      summary: summary({
        findings: [
          finding('guid_candidates', 'biologia-celular/certamen-2', {
            removed: [{ guid: 'a', code: 'T-BC-C2-11-001', text: 'Ribosomas' }],
            added: [{ guid: 'x', code: 'T-BC-C2-11-099', text: 'Proteasoma 26S' }],
          }),
        ],
      }),
    });
    expect(only(maybe, 'guid_changed')).toEqual([]);
    expect(only(maybe, 'guid_maybe')).toEqual([
      'Biología celular · Certamen 2: sale 1 nota y entra 1, sin ninguna casi igual a otra.',
    ]);
  });

  it('guid_changed from the same code the database paired, once; and the candidates limit', () => {
    const r = review({
      summary: summary({
        findings: [
          finding('guid_same_code', 'a>x', {
            removed: 'a',
            added: 'x',
            codeBefore: 'T-BC-C2-11-001',
            code: 'T-BC-C2-11-001',
          }),
          finding('guid_candidates', 'biologia-celular/certamen-2', {
            removed: [{ guid: 'a', code: 'T-BC-C2-11-001', text: 'Ribosomas' }],
            added: [{ guid: 'x', code: 'T-BC-C2-11-001', text: 'Ribosomas' }],
            removedTotal: 400,
            addedTotal: 1,
          }),
        ],
      }),
    });
    expect(only(r, 'guid_changed')).toEqual([
      'T-BC-C2-11-001 sale y entra T-BC-C2-11-001, con el mismo código: el avance de los alumnos quedaría en la vieja.',
    ]);
    expect(r.blocking).toBe(1);
    expect(only(r, 'guid_maybe')).toEqual([
      'Biología celular · Certamen 2: salen 400 notas y entran 1; el texto se comparó solo en las primeras 1 y 1.',
    ]);
  });

  it('ord_meaning: holes swapped or one inserted in the middle; mask_moved for a mask that moved', () => {
    const cloze = (before: object, after: object, occlusion = false) =>
      finding('cloze_signatures', 'g', { code: 'T-X-1', occlusion, before, after });
    const r = review({
      summary: summary({
        findings: [
          cloze({ 0: '7', 1: '12' }, { 0: '12', 1: '7' }),
          cloze({ 0: '7', 1: '12' }, { 0: '7', 1: '5', 2: '12' }),
        ],
      }),
    });
    expect(only(r, 'ord_meaning')).toEqual([
      'T-X-1: los huecos c1, c2 preguntan ahora lo que preguntaba otro número.',
      'T-X-1: los huecos c2 preguntan ahora lo que preguntaba otro número.',
    ]);
    // A hole that only changed its answer is not renumbered.
    expect(
      only(
        review({ summary: summary({ findings: [cloze({ 0: '7' }, { 0: 'siete' })] }) }),
        'ord_meaning',
      ),
    ).toEqual([]);
    const m = (l: number, t: number) => `rect:left=${l}:top=${t}:width=.1:height=.05`;
    const masks = review({
      summary: summary({
        findings: [
          cloze({ 0: m(0.1, 0.1), 1: m(0.5, 0.5) }, { 0: m(0.5, 0.5), 1: m(0.1, 0.1) }, true),
          // Narrowed to its letters: the same place.
          cloze({ 0: m(0.1, 0.1) }, { 0: 'rect:left=0.105:top=0.102:width=.09:height=.045' }, true),
          cloze({ 0: m(0.1, 0.1) }, { 0: m(0.8, 0.8) }, true),
        ],
      }),
    });
    expect(only(masks, 'ord_meaning')).toEqual([
      'T-X-1: las máscaras c1, c2 preguntan ahora lo que preguntaba otro número.',
    ]);
    expect(only(masks, 'mask_moved')).toEqual(['T-X-1: c1 tapan ahora otro lugar de la imagen.']);
  });

  it('question_id_shifted, both kinds', () => {
    const r = review({
      summary: summary({
        findings: [
          finding('question_id_shifted', 'q/1', { kind: 'shifted', other: '2' }),
          finding('question_id_shifted', 'q/9', { kind: 'renamed', other: '3' }),
        ],
      }),
    });
    expect(only(r, 'question_id_shifted')).toEqual([
      'q/1 tiene ahora el texto de 2: el historial de una quedaría en la otra.',
      'q/9 es la pregunta 3 con otro id: su historial se perdería.',
    ]);
  });

  it('key_out_of_range', () => {
    const r = review({
      summary: summary({
        findings: [finding('key_out_of_range', 'q/1', { correct: 3, options: 3 })],
      }),
    });
    expect(only(r, 'key_out_of_range')).toEqual(['q/1: la correcta es la 4 de 3 alternativas.']);
  });

  it('schema_version: newer than the Worker, older, or not said', () => {
    expect(only(review({ summary: summary({ schemaVersion: 2 }) }), 'schema_version')[0]).toMatch(
      /despliega primero el sitio/,
    );
    expect(only(review({ summary: summary({ schemaVersion: 0 }) }), 'schema_version')[0]).toMatch(
      /súbelo de nuevo/,
    );
    expect(
      only(review({ summary: summary({ schemaVersion: null }) }), 'schema_version')[0],
    ).toMatch(/no dice con qué versión/);
    expect(
      only(
        review({ summary: summary({ schemaVersion: null, assessments: [] }) }),
        'schema_version',
      ),
    ).toEqual([]);
  });

  it('practice_broken', () => {
    const r = review({
      summary: summary({
        findings: [
          finding('practice_broken', 'AP-1', {
            title: 'Traducción',
            what: 'deck',
            value: '11 - Traducción',
          }),
          finding('practice_broken', 'AP-2', { title: 'Núcleo', what: 'quiz', value: null }),
        ],
      }),
    });
    expect(only(r, 'practice_broken')).toEqual([
      'Traducción: su mazo no está («11 - Traducción»).',
      'Núcleo: su test no está.',
    ]);
  });

  it('class_without_year', () => {
    const r = review({
      summary: summary({ findings: [finding('class_without_year', 'AP-1', { title: 'Núcleo' })] }),
    });
    expect(only(r, 'class_without_year')).toEqual([
      'Núcleo (AP-1) no dice de qué año es la clase.',
    ]);
  });

  it('unpublished_in_draft', () => {
    const r = review({
      summary: summary({
        findings: [finding('unpublished_in_draft', 'AP-1', { kind: 'note', title: 'Núcleo' })],
      }),
    });
    expect(only(r, 'unpublished_in_draft')).toEqual([
      'El artículo «Núcleo» está en content/unpublished.json y sigue en el borrador.',
    ]);
  });

  it('imaios', () => {
    const r = review({
      summary: summary({ findings: [finding('imaios', 'g', { code: 'T-A2-S4-06I-001' })] }),
    });
    expect(only(r, 'imaios')).toEqual(['T-A2-S4-06I-001 nombra IMAIOS.']);
  });

  it('process_phrase', () => {
    const r = review({
      phrases: [
        {
          key: 'a:1#',
          assessmentId: null,
          label: 'Clase 1',
          rule: 'this-term',
          snippet: 'este semestre',
        },
      ],
    });
    expect(only(r, 'process_phrase')).toEqual([
      'Clase 1: «este semestre» (el calendario de este semestre).',
    ]);
    expect(r.blocking).toBe(0);
  });

  it('deck_drop, only beyond 10 %', () => {
    const deck = (cardsBefore: number, cardsAfter: number) => ({
      id: String(cardsAfter),
      name: '() Medicina UCH::…::11 - Traducción',
      nameBefore: null,
      op: 'changed' as const,
      cardsBefore,
      cardsAfter,
      presetBefore: 'Default',
      presetAfter: 'Default',
    });
    const r = review({
      summary: summary({ assessments: [assessment({ decks: [deck(100, 90), deck(100, 89)] })] }),
    });
    expect(only(r, 'deck_drop')).toEqual(['11 - Traducción: de 100 a 89 tarjetas.']);
  });

  it('near_test_date, from today to 7 days', () => {
    const at = (suggestedDate: string) =>
      only(
        review({ summary: summary({ assessments: [assessment({ suggestedDate })] }) }),
        'near_test_date',
      );
    expect(at('2026-11-14')).toEqual([
      'Biología celular · Certamen 2: la prueba sugerida es en 7 días (2026-11-14).',
    ]);
    expect(at('2026-11-07')[0]).toMatch(/es hoy/);
    expect(at('2026-11-15')).toEqual([]);
    expect(at('2026-11-06')).toEqual([]);
  });

  it('preset_changed: a preset of the author, or the one of a deck', () => {
    const r = review({
      summary: summary({
        presets: [{ name: 'Extras', op: 'changed' }],
        assessments: [
          assessment({
            decks: [
              {
                id: '1',
                name: 'A::01 - Tema',
                nameBefore: 'A::01 - Tema',
                op: 'changed',
                cardsBefore: 5,
                cardsAfter: 5,
                presetBefore: 'Default',
                presetAfter: 'Extras',
              },
            ],
          }),
        ],
      }),
    });
    expect(only(r, 'preset_changed')).toEqual([
      '01 - Tema: de «Default» a «Extras».',
      'La configuración «Extras» cambia.',
    ]);
  });

  it('a deck above the assessments, alone, is a change and its preset warns', () => {
    const r = review({
      summary: summary({
        assessments: [],
        decks: [
          {
            id: '9',
            name: '() Medicina UCH::2° Semestre::🧬 Biología celular',
            nameBefore: '() Medicina UCH::2° Semestre::🧬 Biología celular',
            op: 'changed',
            cardsBefore: 0,
            cardsAfter: 0,
            presetBefore: 'Default',
            presetAfter: null,
          },
        ],
      }),
    });
    expect(r.empty).toBe(false);
    expect(only(r, 'preset_changed')).toEqual([
      '🧬 Biología celular: de «Default» a «sin configuración».',
    ]);
  });
});

describe('the helpers', () => {
  it('plain text as release_text() reads it', () => {
    expect(plainText('<b>7</b>&nbsp;y <img src="a.png"> &amp; más')).toBe('7 y [img a.png] & más');
    // The same cases as release_text() in SQL (db/tests/__tests__/release.flow.test.ts).
    expect(plainText(`<img src='a.png'> x`)).toBe('[img a.png] x');
    expect(plainText('<IMG class="x" SRC=b.png> x')).toBe('[img b.png] x');
    expect(plainText('<img src="c.png" data-media="cards/c.webp">')).toBe('[img cards/c.webp]');
    expect(plainText('p<0.05 y q>1 <b>z</b><!-- nota -->')).toBe('p<0.05 y q>1 z');
  });
});
describe('what a publication keeps', () => {
  it('the review list in short: blocking, pending, ready, the warnings that warn and the marks', () => {
    const r = review({
      summary: summary({
        marks: [
          { mark: 'phone', checkedBy: 'ana@ug.uchile.cl', checkedAt: '2026-11-07T12:00:00Z' },
          { mark: 'answers', checkedBy: 'ana@ug.uchile.cl', checkedAt: '2026-11-07T12:00:00Z' },
        ],
        presets: [{ name: 'Extras', op: 'changed' }],
      }),
    });
    expect(reviewChecks(r)).toEqual({
      blocking: 0,
      pending: 0,
      ready: true,
      warnings: [{ rule: 'preset_changed', title: 'Configuraciones de mazo cambiadas', count: 1 }],
      marks: [
        { mark: 'phone', checkedBy: 'ana@ug.uchile.cl' },
        { mark: 'answers', checkedBy: 'ana@ug.uchile.cl' },
      ],
    });
  });

  it('its name, from the assessments it changes', () => {
    const a = (id: string, courseName: string, name: string) =>
      assessment({ id, courseId: id.split('/')[0]!, courseName, name });
    expect(releaseTitle(summary({ assessments: [] }))).toBe('Cambios del sitio');
    expect(releaseTitle(summary())).toBe('Biología celular · Certamen 2');
    const four = [
      a('a/c1', 'Anatomía I', 'Certamen 1'),
      a('b/c2', 'Biología celular', 'Certamen 2'),
      a('c/c3', 'Histología', 'Certamen 3'),
      a('d/c1', 'Física', 'Certamen 1'),
    ];
    expect(releaseTitle(summary({ assessments: four.slice(0, 2) }))).toBe(
      'Anatomía I · Certamen 1 y Biología celular · Certamen 2',
    );
    expect(releaseTitle(summary({ assessments: four.slice(0, 3) }))).toBe(
      'Anatomía I · Certamen 1, Biología celular · Certamen 2 y Histología · Certamen 3',
    );
    expect(releaseTitle(summary({ assessments: four }))).toBe(
      'Anatomía I · Certamen 1, Biología celular · Certamen 2 y 2 más',
    );
  });

  it('the assessments that only come into the catalog, empty, are not in its name', () => {
    const none = { added: 0, removed: 0, content: 0, format: 0 };
    const empty = (id: string, courseName: string) =>
      assessment({
        id,
        courseId: id.split('/')[0]!,
        courseName,
        name: 'Certamen 1',
        articles: none,
      });
    const added = (id: string) => ({
      kind: 'assessment' as const,
      id,
      op: 'added' as const,
      before: null,
      after: { id, name: 'Certamen 1' },
    });
    const ids = ['quimica/certamen-1', 'matematicas/certamen-1', 'fisica/certamen-1'];
    const s = summary({
      catalog: ids.map(added),
      assessments: [
        empty(ids[0]!, 'Química'),
        empty(ids[1]!, 'Matemáticas'),
        assessment({ id: 'biologia-celular/certamen-3', name: 'Certamen 3' }),
        empty(ids[2]!, 'Física'),
      ],
    });
    expect(s.assessments.map((a) => onlyInCatalog(s, a))).toEqual([true, true, false, true]);
    expect(releaseTitle(s)).toBe('Biología celular · Certamen 3');
    expect(
      releaseTitle({ ...s, assessments: s.assessments.filter((a) => a.name !== 'Certamen 3') }),
    ).toBe('Cambios del sitio');
    // An assessment already published whose name changes is not «only in the catalog».
    const renamed = summary({
      catalog: [{ ...added('biologia-celular/certamen-2'), op: 'changed' }],
    });
    expect(onlyInCatalog(renamed, assessment({ articles: none }))).toBe(false);
  });
});

describe('what the findings leave out', () => {
  const run = (...findings: ReleaseFinding[]) => review({ summary: summary({ findings }) });

  it('a key out of range with no count of alternatives says «?»', () => {
    expect(
      only(run(finding('key_out_of_range', 'p1', { correct: 4 })), 'key_out_of_range'),
    ).toEqual(['p1: la correcta es la 5 de ? alternativas.']);
    expect(
      only(run(finding('key_out_of_range', 'p1', { correct: 4, options: 4 })), 'key_out_of_range'),
    ).toEqual(['p1: la correcta es la 5 de 4 alternativas.']);
  });

  it('a broken «Ponte a prueba» link names what is missing, as it is if the kind is not known, and the value if any', () => {
    const text = (detail: Record<string, unknown>) =>
      only(run(finding('practice_broken', 'art-1', detail)), 'practice_broken')[0];
    expect(text({ title: 'Núcleo', what: 'deck', value: 'Mazo 8' })).toBe(
      'Núcleo: su mazo no está («Mazo 8»).',
    );
    expect(text({ what: 'quiz' })).toBe('art-1: su test no está.');
    expect(text({ what: 'section' })).toBe('art-1: la pestaña del test no está.');
    expect(text({ what: 'group', value: 3 })).toBe('art-1: un tema del test no está («3»).');
    expect(text({ what: 'other' })).toBe('art-1: other.');
    expect(text({})).toBe('art-1: .');
  });

  it('a class without a year names its title or, failing that, its key', () => {
    const text = (detail: Record<string, unknown>) =>
      only(run(finding('class_without_year', 'c-8', detail)), 'class_without_year')[0];
    expect(text({ title: 'Traducción' })).toBe('Traducción (c-8) no dice de qué año es la clase.');
    expect(text({})).toBe('c-8 (c-8) no dice de qué año es la clase.');
  });

  it('material taken out of the site is named by kind, or just «material»', () => {
    const text = (detail: Record<string, unknown>) =>
      only(run(finding('unpublished_in_draft', 'k', detail)), 'unpublished_in_draft')[0];
    expect(text({ kind: 'note', title: 'T' })).toMatch(
      /^El artículo «T» está en content\/unpublished\.json/,
    );
    expect(text({ kind: 'quiz' })).toMatch(/^El test «k»/);
    expect(text({ kind: 'deck' })).toMatch(/^El mazo/);
    expect(text({ kind: 'image' })).toMatch(/^El imagen/);
    expect(text({ kind: 'odd' })).toMatch(/^El material/);
    expect(text({})).toMatch(/^El material/);
  });

  it('IMAIOS names the code, else the title, else the key', () => {
    const text = (detail: Record<string, unknown>) =>
      only(run(finding('imaios', 'k', detail)), 'imaios')[0];
    expect(text({ code: 'T-1', title: 'x' })).toBe('T-1 nombra IMAIOS.');
    expect(text({ title: 'x' })).toBe('x nombra IMAIOS.');
    expect(text({})).toBe('k nombra IMAIOS.');
  });

  it('a question id that shifted with no other named has an empty other', () => {
    expect(
      only(run(finding('question_id_shifted', 'q', { kind: 'renamed' })), 'question_id_shifted'),
    ).toEqual(['q es la pregunta  con otro id: su historial se perdería.']);
    expect(
      only(run(finding('question_id_shifted', 'q', { other: 'z' })), 'question_id_shifted'),
    ).toEqual(['q tiene ahora el texto de z: el historial de una quedaría en la otra.']);
  });

  it('a pair the database found with the same code is said once, with «?» for what it does not say', () => {
    const r = run(
      finding('guid_same_code', 'k1', {}),
      finding('guid_same_code', 'k1', { code: 'ignored' }),
      finding('guid_same_code', 'k2', { removed: 'a', added: 'b' }),
      finding('guid_same_code', 'k3', { codeBefore: 'A-1', code: 'A-2' }),
    );
    expect(only(r, 'guid_changed')).toEqual([
      '? sale y entra ?, con el mismo código: el avance de los alumnos quedaría en la vieja.',
      'a sale y entra b, con el mismo código: el avance de los alumnos quedaría en la vieja.',
      'A-1 sale y entra A-2, con el mismo código: el avance de los alumnos quedaría en la vieja.',
    ]);
  });

  it('a pair found from the candidates is skipped if the database already paired it', () => {
    const r = run(
      finding('guid_same_code', 'a>x', { codeBefore: 'T-1', code: 'T-1' }),
      finding('guid_candidates', 'k', {
        removed: [{ guid: 'a', code: 'T-1', text: 'abc' }],
        added: [{ guid: 'x', code: 'T-1', text: 'abc' }],
      }),
    );
    expect(only(r, 'guid_changed')).toHaveLength(1);
  });

  it('candidates with no lists, or with only one side, make no pair and no «maybe»', () => {
    const r = run(
      finding('guid_candidates', 'k1', {}),
      finding('guid_candidates', 'k2', {
        removed: [{ guid: 'a', code: null, text: 'abcdefghij' }],
      }),
      finding('guid_candidates', 'k3', { added: [{ guid: 'a', code: null, text: 'abcdefghij' }] }),
    );
    expect(only(r, 'guid_changed')).toEqual([]);
    expect(only(r, 'guid_maybe')).toEqual([]);
  });

  it('the «maybe» says «notas» in the plural on each side', () => {
    const note = (guid: string, text: string) => ({ guid, code: null, text });
    const r = run(
      finding('guid_candidates', 'k', {
        removed: [note('a', 'primero largo'), note('b', 'segundo largo')],
        added: [note('x', 'zzzzzzzzz'), note('y', 'wwwwwwwww'), note('z', 'vvvvvvvvv')],
      }),
    );
    expect(only(r, 'guid_maybe')).toEqual([
      'Biología celular · Certamen 2: salen 2 notas y entran 3, sin ninguna casi igual a otra.',
    ]);
  });

  it('a cloze signature with no before or after, or no code, is read as empty and named by its key', () => {
    const r = run(
      finding('cloze_signatures', 'k', {}),
      finding('cloze_signatures', 'k2', {
        code: 'T-1',
        before: { '0': 'a', '1': 'b' },
        after: { '0': 'b', '1': 'a' },
      }),
    );
    expect(only(r, 'ord_meaning')).toEqual([
      'T-1: los huecos c1, c2 preguntan ahora lo que preguntaba otro número.',
    ]);
    expect(only(r, 'mask_moved')).toEqual([]);
  });

  it('the preset of a deck that had none or has none says «sin configuración», on either side', () => {
    const deck = (presetBefore: string | null, presetAfter: string | null) => ({
      id: 'd',
      name: 'A::01 - Tema',
      nameBefore: null,
      op: 'changed' as const,
      cardsBefore: 5,
      cardsAfter: 5,
      presetBefore,
      presetAfter,
    });
    const r = review({
      summary: summary({
        assessments: [
          assessment({ decks: [deck(null, 'Extras')] }),
          assessment({ id: 'otro', decks: [deck('Default', null)] }),
        ],
      }),
    });
    expect(only(r, 'preset_changed')).toEqual([
      '01 - Tema: de «sin configuración» a «Extras».',
      '01 - Tema: de «Default» a «sin configuración».',
    ]);
  });

  it('a preset that is new, gone or changed says so', () => {
    const r = review({
      summary: summary({
        presets: [
          { name: 'A', op: 'added' },
          { name: 'B', op: 'removed' },
          { name: 'C', op: 'changed' },
        ],
      }),
    });
    expect(only(r, 'preset_changed')).toEqual([
      'La configuración «A» es nueva.',
      'La configuración «B» sale.',
      'La configuración «C» cambia.',
    ]);
  });

  it('a test coming tomorrow says «mañana», also when the date before the change is the near one', () => {
    const r = review({
      summary: summary({
        assessments: [
          assessment({ suggestedDate: '2027-01-01', suggestedDateBefore: '2026-11-08' }),
        ],
      }),
    });
    expect(only(r, 'near_test_date')).toEqual([
      'Biología celular · Certamen 2: la prueba sugerida es mañana (2026-11-08).',
    ]);
  });

  it('a phrase of a rule that is not in the list is named by its id', () => {
    const hit = { key: 'k', assessmentId: null, label: 'Texto', rule: 'new-rule', snippet: 'algo' };
    expect(only(review({ phrases: [hit] }), 'process_phrase')).toEqual([
      'Texto: «algo» (new-rule).',
    ]);
    expect(only(review({ phrases: [{ ...hit, rule: 'date' }] }), 'process_phrase')[0]).toMatch(
      /\(una fecha de este semestre\)\.$/,
    );
  });
});

describe('naming an assessment', () => {
  const name = (a: Partial<ReleaseAssessment>) =>
    releaseTitle(summary({ assessments: [assessment({ id: 'x', ...a })] }));

  it('is the course and the assessment, the course id when the course has no name, the id when there is no name', () => {
    expect(name({})).toBe('Biología celular · Certamen 2');
    expect(name({ courseName: null })).toBe('biologia-celular · Certamen 2');
    expect(name({ courseName: null, courseId: null })).toBe(' · Certamen 2');
    expect(name({ name: null })).toBe('Biología celular · x');
  });

  it('a note about an assessment that is not in the release is just its id', () => {
    const r = review({
      summary: summary({
        findings: [
          {
            rule: 'guid_candidates',
            assessmentId: 'ghost',
            key: 'k',
            detail: {
              removed: [{ guid: 'a', code: null, text: 'abcdefghij' }],
              added: [{ guid: 'b', code: null, text: 'zzzzzzzzzzz' }],
            },
          },
        ],
      }),
    });
    expect(only(r, 'guid_maybe')[0]).toMatch(/^ghost: sale 1 nota/);
    const none = review({
      summary: summary({
        findings: [
          {
            rule: 'guid_candidates',
            assessmentId: null,
            key: 'k',
            detail: {
              removed: [{ guid: 'a', code: null, text: 'abcdefghij' }],
              added: [{ guid: 'b', code: null, text: 'zzzzzzzzzzz' }],
            },
          },
        ],
      }),
    });
    expect(only(none, 'guid_maybe')[0]).toMatch(/^: sale 1 nota/);
  });
});

describe('decks above the assessments', () => {
  const deck = (
    op: 'added' | 'removed' | 'changed',
    presetBefore: string | null,
    presetAfter: string | null,
  ) => ({
    id: `${op}-${presetBefore ?? ''}-${presetAfter ?? ''}`,
    name: 'R::S::Curso',
    nameBefore: null,
    op,
    cardsBefore: 0,
    cardsAfter: 0,
    presetBefore,
    presetAfter,
  });

  it('only a deck that changed its preset warns; one added, removed or with the same preset does not', () => {
    const r = review({
      summary: summary({
        assessments: [],
        decks: [deck('added', null, 'A'), deck('removed', 'A', null), deck('changed', 'A', 'A')],
      }),
    });
    expect(only(r, 'preset_changed')).toEqual([]);
  });

  it('a preset that appears or goes away says «sin configuración» for the missing side', () => {
    const r = review({
      summary: summary({
        assessments: [],
        decks: [deck('changed', null, 'A'), deck('changed', 'B', null)],
      }),
    });
    expect(only(r, 'preset_changed')).toEqual([
      'Curso: de «sin configuración» a «A».',
      'Curso: de «B» a «sin configuración».',
    ]);
  });
});
