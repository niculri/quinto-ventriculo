// Step 1.7, part 2 (B5): the review list, one case per rule, and the process and calendar check (CON-9), one case per
// phrase and 0 in the articles that are on line.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ReleaseAssessment, ReleaseFinding, ReleaseSummary } from './release';
import {
  CHECK_RULES,
  PROCESS_RULES,
  buildReview,
  changedGuids,
  findProcessPhrases,
  maskOverlap,
  plainText,
  onlyInCatalog,
  releaseTitle,
  renumbered,
  reviewChecks,
  similarity,
  wordDiff,
} from './review';
import type { CheckRule, ReviewInput } from './review';

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
const review = (o: Partial<ReviewInput> = {}) =>
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
    // The announcement's mark only when there are announcements (step C1).
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

  // ─────────────────────────── blocks ───────────────────────────

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

  it('Revisión de cero (1.7, parte 2): guid_changed from the same code the database paired, once; and the limit', () => {
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
          // Narrowed to its letters (cenir_mascaras.py): the same place.
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
    // Without changes, nothing to publish: no stop.
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

  // ─────────────────────────── warnings ───────────────────────────

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

  it('Revisión de cero (1.7, parte 2): a deck above the assessments, alone, is a change and its preset warns', () => {
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

describe('the process and calendar phrases (CON-9)', () => {
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

  // The 10 articles on line (Biología celular, Certamen 2) as the importer built them in dry-run mode. Without that
  // folder (the CI), there is nothing to read.
  const OUTPUT = join(import.meta.dirname, '..', '..', '..', '.output', 'content.json');
  it.skipIf(!existsSync(OUTPUT))('gives 0 in the 10 articles on line', () => {
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
    expect(bundle.notes).toHaveLength(10);
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
    // Revisión de cero (1.7, parte 2): as release_text() in SQL (db/tests/release.test.ts has the same cases).
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

// Step 1.7, part 3: what a publication keeps of its review list, and its name.
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

  it('Revisión de cero (1.8): the assessments that only come into the catalog, empty, are not in its name', () => {
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
    // Only the catalog: the site's changes.
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
