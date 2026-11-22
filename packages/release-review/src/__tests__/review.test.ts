// Tests for the release review list (one case per rule), the process and calendar phrases, and what a publication
// keeps of its review.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { releasePlainText as plainText } from '@qv/html/text';
import type { ReleaseAssessment, ReleaseFinding, ReleaseSummary } from '@qv/schema/release';
import {
  CHECK_RULES,
  PROCESS_RULES,
  buildReview,
  changedGuids,
  findProcessPhrases,
  maskOverlap,
  onlyInCatalog,
  processPhrases,
  releaseTitle,
  renumbered,
  reviewChecks,
  similarity,
  wordDiff,
} from '../review';
import type { CheckRule, ReleaseReviewInput } from '../review';

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

describe('the process and calendar phrases', () => {
  const cases: Record<string, [string, string]> = {
    deduced: [
      'La letra de la tabla se dedujo de la pauta.',
      'Su sitio de acción se dedujo por exclusión.',
    ],
    copied: [
      'Las afirmaciones tachadas no se copian de la pauta.',
      'La cola poli-A no se copia del DNA.',
    ],
    translated: [
      'Los números de la imagen van traducidos aquí.',
      'La proteína difiere de la que se tradujo.',
    ],
    edition: ['La figura es de una edición anterior.', 'La edición del RNA cambia su secuencia.'],
    revision: ['Tras la revisión de cero, quedó así.', 'Se revisa la hebra recién sintetizada.'],
    tools: ['Las alternativas las escribió ChatGPT.', 'El agente infeccioso entra por la mucosa.'],
    'this-term': [
      'Esto no lo veremos este semestre.',
      'El semestre de primavera tiene 18 semanas.',
    ],
    enters: ['La vía endocítica no entra en el certamen.', 'El calcio entra en la célula.'],
    date: ['La clase del 26-10-2026 se suspendió.', 'Ohsumi recibió el Nobel en 2016.'],
  };

  it('has a case for every rule', () => {
    expect(Object.keys(cases).sort()).toEqual(PROCESS_RULES.map((r) => r.id).sort());
  });

  it.each(Object.entries(cases))(
    '%s: finds the phrase, and not the content that looks like it',
    (rule, [yes, no]) => {
      expect(findProcessPhrases(yes).map((h) => h.rule)).toEqual([rule]);
      expect(findProcessPhrases(no)).toEqual([]);
    },
  );

  it('gives the phrase with a little around it', () => {
    const [hit] = findProcessPhrases(
      `${'x'.repeat(80)} esto vale este año y nada más ${'y'.repeat(80)}`,
    );
    expect(hit!.snippet).toMatch(/^….{10,}este año.{10,}…$/);
  });

  // The published articles as the importer's dry run built them; without that folder (as in the CI), nothing to read.
  const OUTPUT = join(import.meta.dirname, '..', '..', '..', '..', '.output', 'content.json');
  it.skipIf(!existsSync(OUTPUT))('gives 0 in the articles of the dry run of the importer', () => {
    const bundle = JSON.parse(readFileSync(OUTPUT, 'utf8')) as {
      notes: {
        id: string;
        title: string;
        subtitle?: string;
        sources: string[];
        html: string;
        sections: { title: string; text: string }[];
      }[];
    };
    expect(bundle.notes.length).toBeGreaterThanOrEqual(10);
    const hits = bundle.notes.flatMap((n) =>
      [
        n.title,
        n.subtitle ?? '',
        ...n.sources,
        plainText(n.html),
        ...n.sections.map((s) => `${s.title} ${s.text}`),
      ]
        .flatMap(findProcessPhrases)
        .map((h) => `${n.id}: ${h.snippet}`),
    );
    expect(hits).toEqual([]);
  });
});

describe('the helpers', () => {
  it('similarity and the codes of a changed GUID', () => {
    expect(similarity('El ribosoma', 'el  ribosoma')).toBe(1);
    expect(similarity('abc', 'xyz')).toBe(0);
    expect(
      changedGuids(
        [{ guid: 'a', code: 'T-A1-S3-01-047', text: 'x' }],
        [{ guid: 'b', code: 'T-A1-S3-01-047.2', text: 'y' }],
      ),
    ).toEqual([expect.objectContaining({ why: 'code' })]);
  });

  it('mask overlap, and renumbered or moved', () => {
    const a = 'rect:left=0.1:top=0.1:width=0.1:height=0.1';
    expect(maskOverlap(a, a)).toBe(1);
    expect(maskOverlap(a, 'rect:left=0.5:top=0.5:width=0.1:height=0.1')).toBe(0);
    expect(renumbered({ 0: '7' }, { 0: '7', 1: '8' }, false)).toEqual({
      renumbered: [],
      moved: [],
    });
  });

  it('plain text and the word diff', () => {
    expect(plainText('<b>7</b>&nbsp;y <img src="a.png"> &amp; más')).toBe('7 y [img a.png] & más');
    // The same cases as release_text() in SQL (db/tests/__tests__/release.flow.test.ts).
    expect(plainText(`<img src='a.png'> x`)).toBe('[img a.png] x');
    expect(plainText('<IMG class="x" SRC=b.png> x')).toBe('[img b.png] x');
    expect(plainText('<img src="c.png" data-media="cards/c.webp">')).toBe('[img cards/c.webp]');
    expect(plainText('p<0.05 y q>1 <b>z</b><!-- nota -->')).toBe('p<0.05 y q>1 z');
    expect(
      wordDiff('el ribosoma tiene dos subunidades', 'el ribosoma tiene tres subunidades'),
    ).toEqual([
      { op: 'same', text: 'el ribosoma tiene ' },
      { op: 'del', text: 'dos' },
      { op: 'add', text: 'tres' },
      { op: 'same', text: ' subunidades' },
    ]);
    expect(wordDiff('', 'nuevo')).toEqual([{ op: 'add', text: 'nuevo' }]);
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

describe('the text helpers of the review', () => {
  it('similarity is 0 when either text has fewer than two letters, and 1 when they are the same after trimming and folding case', () => {
    expect(similarity('a', 'b')).toBe(0);
    expect(similarity('abc', 'x')).toBe(0);
    expect(similarity('', 'abc')).toBe(0);
    expect(similarity(' Hola  Mundo ', 'hola mundo')).toBe(1);
    expect(similarity('night', 'nacht')).toBeCloseTo(0.25, 5);
  });

  it('a removed note with a very short text is never paired by its text, even with the same text added', () => {
    expect(
      changedGuids(
        [{ guid: 'a', code: null, text: 'corto' }],
        [{ guid: 'b', code: null, text: 'corto' }],
      ),
    ).toEqual([]);
    expect(
      changedGuids(
        [{ guid: 'a', code: null, text: 'abcdefgh' }],
        [{ guid: 'b', code: null, text: 'short' }],
      ),
    ).toEqual([]);
  });

  it('process phrases come out of every text, with the text’s key and label', () => {
    const hits = processPhrases([
      {
        kind: 'article',
        key: 'a',
        assessmentId: 'x',
        label: 'Artículo',
        text: 'Se copió tal cual del libro, y es el próximo semestre.',
      },
      { kind: 'quiz', key: 'b', assessmentId: null, label: 'Test', text: 'Nada que decir.' },
    ]);
    expect(hits.map((h) => [h.key, h.assessmentId, h.label, h.rule])).toEqual([
      ['a', 'x', 'Artículo', 'copied'],
      ['a', 'x', 'Artículo', 'this-term'],
    ]);
    expect(processPhrases([])).toEqual([]);
  });

  it('a phrase near the start or the end of a text has no dots on that side', () => {
    const [start] = findProcessPhrases('Se usó ChatGPT aquí.');
    expect(start!.snippet).toBe('Se usó ChatGPT aquí.');
    const long = `${'a'.repeat(60)} ChatGPT ${'b'.repeat(60)}`;
    const [middle] = findProcessPhrases(long);
    expect(middle!.snippet.startsWith('…')).toBe(true);
    expect(middle!.snippet.endsWith('…')).toBe(true);
    const [end] = findProcessPhrases(`${'a'.repeat(60)} ChatGPT`);
    expect(end!.snippet.startsWith('…')).toBe(true);
    expect(end!.snippet.endsWith('…')).toBe(false);
  });

  it('finds every occurrence of a phrase, not only the first', () => {
    expect(findProcessPhrases('Whisper y Whisper otra vez')).toHaveLength(2);
  });
});

describe('masks as boxes', () => {
  const rect = (left: number, top: number, w: number, h: number) =>
    `rect:left=${left}:top=${top}:width=${w}:height=${h}`;

  it('an ellipse is read as the box of its radii, so one that is the same ellipse overlaps itself', () => {
    const ellipse = 'ellipse:left=.1:top=.1:rx=.05:ry=.03';
    expect(maskOverlap(ellipse, ellipse)).toBe(1);
    expect(maskOverlap(ellipse, rect(0.1, 0.1, 0.1, 0.06))).toBe(1);
    expect(maskOverlap(ellipse, 'ellipse:left=.5:top=.5:rx=.05:ry=.03')).toBe(0);
  });

  it('a shape that cannot be put in a box is left out, and if nothing is left the masks are equal only if the text is', () => {
    expect(maskOverlap('polygon:points=1,2', 'polygon:points=1,2')).toBe(1);
    expect(maskOverlap('polygon:points=1,2', 'polygon:points=3,4')).toBe(0);
    expect(maskOverlap('polygon:points=1,2', rect(0, 0, 1, 1))).toBe(0);
    expect(maskOverlap(`polygon:points=1,2;${rect(0, 0, 1, 1)}`, rect(0, 0, 1, 1))).toBe(1);
    expect(maskOverlap('ellipse:left=.1:top=.1:rx=.05', 'ellipse:left=.1:top=.1:rx=.05')).toBe(1);
  });

  it('boxes with no area never overlap, and a box inside another overlaps by the share it covers', () => {
    expect(maskOverlap(rect(0, 0, 0, 0), rect(0, 0, 0, 0))).toBe(0);
    expect(maskOverlap(rect(0, 0, 2, 1), rect(0, 0, 1, 1))).toBe(0.5);
  });

  it('with several shapes the worse side decides, so adding a shape lowers the overlap', () => {
    const one = rect(0, 0, 0.1, 0.1);
    const two = `${one};${rect(0.5, 0.5, 0.1, 0.1)}`;
    expect(maskOverlap(one, two)).toBe(0.5);
    expect(maskOverlap(two, one)).toBe(0.5);
  });

  it('negative coordinates are read, and a missing one makes the shape unreadable', () => {
    expect(
      maskOverlap(
        'rect:left=-.1:top=-.1:width=.2:height=.2',
        'rect:left=-.1:top=-.1:width=.2:height=.2',
      ),
    ).toBe(1);
    expect(maskOverlap('rect:left=.1:width=.2:height=.2', 'rect:left=.1:width=.2:height=.2')).toBe(
      1,
    );
    expect(maskOverlap('rect:left=.1:width=.2:height=.2', 'rect:left=.2:width=.2:height=.2')).toBe(
      0,
    );
  });

  it('two masks that move are listed in order of their number', () => {
    const r = renumbered(
      { '0': rect(0, 0, 0.1, 0.1), '1': rect(0.5, 0.5, 0.1, 0.1), '2': rect(0.2, 0.2, 0.05, 0.05) },
      {
        '0': rect(0.8, 0.8, 0.1, 0.1),
        '1': rect(0.9, 0.1, 0.1, 0.1),
        '2': rect(0.2, 0.2, 0.05, 0.05),
      },
      true,
    );
    expect(r).toEqual({ renumbered: [], moved: [0, 1] });
    expect(
      renumbered({ '0': 'a', '1': 'b', '2': 'c' }, { '0': 'b', '1': 'a', '2': 'c' }, false),
    ).toEqual({
      renumbered: [0, 1],
      moved: [],
    });
  });

  it('a new ord, or one with the same text, changes nothing', () => {
    expect(renumbered({ '0': 'a' }, { '0': 'a', '1': 'b' }, false)).toEqual({
      renumbered: [],
      moved: [],
    });
  });
});

describe('wordDiff', () => {
  const text = (parts: ReturnType<typeof wordDiff>) => parts.map((p) => `${p.op}:${p.text}`);

  it('the same text is one same part, and an empty text has no parts', () => {
    expect(wordDiff('a b', 'a b')).toEqual([{ op: 'same', text: 'a b' }]);
    expect(wordDiff('', '')).toEqual([]);
  });

  it('keeps what both share and shows what went out and what came in, joined as runs', () => {
    expect(text(wordDiff('a b c d e', 'a x c y e'))).toEqual([
      'same:a ',
      'del:b',
      'add:x',
      'same: c ',
      'del:d',
      'add:y',
      'same: e',
    ]);
    expect(text(wordDiff('a b c', 'a c'))).toEqual(['same:a ', 'del:b ', 'same:c']);
    expect(text(wordDiff('a c', 'a b c'))).toEqual(['same:a ', 'add:b ', 'same:c']);
  });

  it('words that only come out, or only go in, at the end are runs of their own', () => {
    expect(text(wordDiff('a b c d', 'a'))).toEqual(['same:a', 'del: b c d']);
    expect(text(wordDiff('a', 'a b c d'))).toEqual(['same:a', 'add: b c d']);
    expect(text(wordDiff('x y', 'z w'))).toEqual(['del:x', 'add:z', 'same: ', 'del:y', 'add:w']);
  });

  it('a text too long for the table goes out and comes in whole, around what is shared at both ends', () => {
    const words = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');
    const before = `start ${words('a', 2100)} end`;
    const after = `start ${words('b', 2100)} end`;
    const parts = wordDiff(before, after);
    expect(parts.map((p) => p.op)).toEqual(['same', 'del', 'add', 'same']);
    expect(parts[0]!.text).toBe('start ');
    expect(parts[3]!.text).toBe(' end');
    expect(parts[1]!.text.startsWith('a0 ')).toBe(true);
    expect(parts[2]!.text.startsWith('b0 ')).toBe(true);
  });

  it('too long and with nothing shared, there is no «same» part', () => {
    const words = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');
    expect(wordDiff(words('a', 2100), words('b', 2100)).map((p) => p.op)).toEqual(['del', 'add']);
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
