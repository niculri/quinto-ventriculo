import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { splitStatements } from '@qv/quiz';
import type { Assessment, ImportedQuiz, QuizFigure, QuizQuestion } from '@qv/schema';
import { drawChart } from './quiz-charts';
import { convertQuiz, defaultQuizId, inlineHtml, questionId, sanitizeSvg } from './quizzes';
import type { QuizEntry, QuizImageProcessor } from './quizzes';
import type { ProcessedImage } from './images';
import { materialPath, privateMaterial, realMaterialHere } from './private-folder';

const ASSESSMENT: Assessment = {
  id: 'biologia-celular/certamen-2',
  courseId: 'biologia-celular',
  name: 'Certamen 2',
  position: 2,
};

/** An image processor that remembers what it got (the bytes of each image, by its key). */
function recordingProcessor() {
  const inputs = new Map<string, Buffer>();
  const process: QuizImageProcessor = async (data) => {
    const digest = createHash('sha256').update(data).digest('hex').slice(0, 32);
    const meta = await sharp(data).metadata();
    const key = `tests/${digest}.webp`;
    inputs.set(key, Buffer.from(data));
    return {
      key,
      width: meta.width ?? 1,
      height: meta.height ?? 1,
      contentType: 'image/webp',
      read: async () => Buffer.from(data),
    } satisfies ProcessedImage;
  };
  return { process, inputs };
}

describe('the skill’s inline syntax', () => {
  it('bold, italics, superscripts, subscripts and line breaks; the rest as it is', () => {
    expect(inlineHtml('**negrita** y *cursiva*')).toBe('<b>negrita</b> y <i>cursiva</i>');
    expect(inlineHtml('0,5^4^ y Al~2~(SO~4~)~3~')).toBe(
      '0,5<sup>4</sup> y Al<sub>2</sub>(SO<sub>4</sub>)<sub>3</sub>',
    );
    expect(inlineHtml('a\nb')).toBe('a<br>b');
    expect(inlineHtml('x < 1 & y > 2')).toBe('x &lt; 1 &amp; y &gt; 2');
    expect(inlineHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('a star inside a word is not italics (Python’s Unicode \\w)', () => {
    expect(inlineHtml('2*3*4')).toBe('2*3*4');
    expect(inlineHtml('ácido*graso*')).toBe('ácido*graso*');
    expect(inlineHtml('* suelto *')).toBe('* suelto *');
    expect(inlineHtml('el gen *LMNA*,')).toBe('el gen <i>LMNA</i>,');
  });

  it('a superscript or subscript has no spaces; ~~ is not a subscript', () => {
    expect(inlineHtml('a ^no esto^')).toBe('a ^no esto^');
    expect(inlineHtml('~~tachado~~')).toBe('~~tachado~~');
    expect(inlineHtml('Ca^2+^')).toBe('Ca<sup>2+</sup>');
  });

  it('a test’s id when the manifest does not fix one', () => {
    expect(defaultQuizId('biologia-celular/certamen-2', 'preguntas-de-practica')).toBe(
      'biologia-celular-certamen-2-preguntas-de-practica',
    );
  });
});

describe('question ids', () => {
  it('the skill’s id, else the source tag of the note, else group and number', () => {
    expect(questionId({ id: 'X-1', nota: '[D-p01-03] …' }, '01', 1)).toBe('X-1');
    expect(questionId({ nota: '[D-p01-02 + A-p03-02, A-p03] A también marca c)' }, '01', 4)).toBe(
      'D-p01-02',
    );
    expect(questionId({ nota: '[N03-12] Materia: …' }, '03', 12)).toBe('N03-12');
    expect(questionId({ nota: '[A-p21-43 + B-p21]' }, '07', 1)).toBe('A-p21-43');
    expect(questionId({ nota: 'Sin etiqueta' }, '05', 3)).toBe('05-3');
    expect(questionId({}, '05', 3)).toBe('05-3');
  });

  it('from the second tab on, the default id goes with its tab (every tab can have its «01»)', () => {
    expect(questionId({}, '01', 2, 'seminario')).toBe('seminario.01-2');
    expect(questionId({ nota: '[N-01] …' }, '01', 2, 'seminario')).toBe('N-01');
    expect(questionId({ id: 'X-1' }, '01', 2, 'seminario')).toBe('X-1');
  });
});

describe('SVG figures', () => {
  it('keep every drawing tag and attribute', () => {
    const svg =
      '<svg viewBox="0 0 10 10" width="10" role="img" aria-label="a &gt; b"><g transform="translate(1,1)"><rect x="1" y="1" width="2" height="2" fill="var(--g1)" fill-opacity="0.2"/><text x="1" y="2" font-family="var(--fbody)">5\'<tspan dy="-3">2</tspan></text><path d="M0 0L1 1" stroke="var(--ink)" stroke-dasharray="2 2"/></g></svg>';
    const r = sanitizeSvg(svg);
    expect(r.dropped).toEqual([]);
    expect(r.svg).toContain('viewBox="0 0 10 10"');
    expect(r.svg).toContain(
      '<rect x="1" y="1" width="2" height="2" fill="var(--g1)" fill-opacity="0.2" />',
    );
    expect(r.svg).toContain('<tspan dy="-3">2</tspan>');
  });

  it('drop scripts, events, links, foreign objects and external references, and say so', () => {
    const r = sanitizeSvg(
      '<svg viewBox="0 0 1 1" onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><rect width="1" height="1"/></a><foreignObject><div>x</div></foreignObject><image href="https://x/y.png"/><rect fill="url(https://x/#p)" width="1"/><use href="#a"/></svg>',
    );
    expect(r.svg).not.toMatch(/onload|script|javascript|href|foreignObject|image|use|url\(/);
    expect(r.svg).toContain('<rect width="1" height="1" />');
    expect(r.dropped.length).toBeGreaterThan(0);
  });

  it('drop ids (they would collide between figures on the same page) and say so', () => {
    const r = sanitizeSvg('<svg><rect id="a" width="1"/></svg>');
    expect(r.svg).toBe('<svg><rect width="1" /></svg>');
    expect(r.dropped).toEqual(['atributos quitados: id']);
  });

  it('drop a paint with a CSS escape (`u\\72 l(` is `url(`), also written as an entity', () => {
    const r = sanitizeSvg(
      '<svg><rect width="1" fill="u\\72 l(https://x/y.svg#p)"/><rect width="2" stroke="u&#92;72 l(//x/z.svg#p)"/></svg>',
    );
    expect(r.svg).toBe('<svg><rect width="1" /><rect width="2" /></svg>');
    expect(r.dropped.length).toBeGreaterThan(0);
  });
});

describe('a synthetic test in the skill’s format', () => {
  let root: string;
  const png = () =>
    sharp({ create: { width: 40, height: 20, channels: 3, background: '#c33' } })
      .png()
      .toBuffer();

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'qv-quiz-'));
    const t = join(root, 'Test - Prueba');
    await mkdir(join(t, 'preguntas'), { recursive: true });
    await mkdir(join(t, 'figuras'), { recursive: true });
    await writeFile(join(t, 'figuras', 'foto.png'), await png());
    await writeFile(
      join(t, 'test.json'),
      JSON.stringify({
        titulo: 'Prueba de formato',
        kicker: 'Kicker · **uno**',
        aviso: 'Aviso general',
        pie: 'Pie',
        tema: 'morado',
      }),
    );
    await writeFile(
      join(t, 'preguntas', '02.json'),
      JSON.stringify({
        nombre: 'Segundo',
        preguntas: [{ q: 'Corta', r: 'La respuesta', nota: '[S-2] nota interna' }],
      }),
    );
    await writeFile(
      join(t, 'preguntas', '01.json'),
      JSON.stringify({
        nombre: 'Primero',
        tema: 'Tema *uno*',
        preguntas: [
          {
            e: 'Caso',
            q: '¿Cuál?',
            o: ['a', 'b', 'c'],
            ok: 'B',
            exp: 'Idea',
            expo: ['**Falsa.** x', '**Verdadera.** y', '**Falsa.** z'],
            origen: 'Certamen 2021',
            cambio: 'Revisión: algo',
            fijas: true,
            fig: [
              { tipo: 'imagen', src: 'figuras/foto.png', alt: 'Foto', ancho: 300, pie: 'Recreada' },
              { tipo: 'barras', categorias: ['A', 'B'], valores: [1, 2], y_max: 3, y_paso: 1 },
            ],
            fig_izq: true,
            tabla: {
              titulo: 'T',
              cab: 1,
              col_cab: true,
              filas: [
                ['', 'x'],
                ['fila', { t: '**1**', hl: true, cs: 2 }],
              ],
            },
          },
          { q: 'Índice', o: ['uno', 'dos'], ok: 1 },
        ],
      }),
    );
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  it('converts every field of the skill', async () => {
    const { process, inputs } = recordingProcessor();
    const r = await convertQuiz(
      { slug: 'prueba', position: 3, folder: 'Test - Prueba', allowPositionalIds: true },
      ASSESSMENT,
      root,
      process,
    );
    expect(r.warnings).toEqual([]);
    const q = r.quiz;
    expect(q).toMatchObject({
      id: 'biologia-celular-certamen-2-prueba',
      slug: 'prueba',
      courseId: 'biologia-celular',
      assessmentId: ASSESSMENT.id,
      title: 'Prueba de formato',
      position: 3,
      questionCount: 3,
      sectionCount: 1,
      kicker: 'Kicker · <b>uno</b>',
      heading: '',
      footer: 'Pie',
    });
    expect(q.theme.light.ac).toBe('#5B4B9A');
    // Without sections: one, «all», with the general texts; groups by file name.
    const [s] = q.sections;
    expect(s).toMatchObject({
      id: 'all',
      name: '',
      notice: 'Aviso general',
      groupsTitle: 'Qué ensayar',
      questionCount: 3,
      hasChoices: true,
    });
    expect(s!.description).toContain('respuesta corta'); // there is a short-answer question
    expect(s!.groups.map((g) => g.id)).toEqual(['01', '02']);
    expect(s!.groups[0]!.topic).toBe('Tema <i>uno</i>');
    const [first, second] = s!.groups[0]!.questions as [QuizQuestion, QuizQuestion];
    expect(first).toMatchObject({
      id: '01-1',
      kind: 'choice',
      context: 'Caso',
      prompt: '¿Cuál?',
      options: ['a', 'b', 'c'],
      correct: 1,
      explanation: 'Idea',
      optionExplanations: ['<b>Falsa.</b> x', '<b>Verdadera.</b> y', '<b>Falsa.</b> z'],
      origin: 'Certamen 2021',
      fixedOrder: true,
      figureBeside: true,
    });
    expect(second).toMatchObject({
      id: '01-2',
      correct: 1,
      fixedOrder: false,
      figureBeside: false,
    });
    const [img, chart] = first.figures as [QuizFigure, QuizFigure];
    expect(img).toMatchObject({
      kind: 'image',
      alt: 'Foto',
      displayWidth: 300,
      caption: 'Recreada',
      width: 40,
      height: 20,
    });
    expect(inputs.get((img as { media: string }).media)).toEqual(
      readFileSync(join(root, 'Test - Prueba', 'figuras', 'foto.png')),
    );
    expect(q.media).toEqual([(img as { media: string }).media]);
    expect(chart).toMatchObject({ kind: 'svg' });
    expect((chart as { svg: string }).svg).toContain('aria-label="Gráfico de barras"');
    expect(first.table).toEqual({
      title: 'T',
      rows: [
        [
          { html: '', header: true },
          { html: 'x', header: true },
        ],
        [
          { html: 'fila', header: true },
          { html: '<b>1</b>', header: false, highlight: true, colSpan: 2 },
        ],
      ],
    });
    const short = s!.groups[1]!.questions[0]!;
    expect(short).toMatchObject({ id: 'S-2', kind: 'short', answer: 'La respuesta' });
    // The internal note is not published.
    expect(JSON.stringify(q)).not.toContain('nota interna');
    // Nor what a revision changed («cambio»).
    expect(JSON.stringify(q)).not.toContain('Revisión: algo');
  });

  it('the manifest gives its name on the site and leaves out what repeats the context', async () => {
    const r = await convertQuiz(
      {
        id: 'mi-test',
        slug: 'preguntas-de-practica',
        position: 1,
        folder: 'Test - Prueba',
        allowPositionalIds: true,
        title: 'Preguntas de práctica',
        kicker: null,
        heading: 'Otro *encabezado*',
        footer: null,
      },
      ASSESSMENT,
      root,
      recordingProcessor().process,
    );
    expect(r.quiz).toMatchObject({
      id: 'mi-test',
      slug: 'preguntas-de-practica',
      title: 'Preguntas de práctica',
      kicker: '',
      heading: 'Otro <i>encabezado</i>',
      footer: '',
    });
  });

  it('the manifest replaces the description and the notice of a section, or leaves the notice out', async () => {
    const base = { slug: 'p', position: 1, folder: 'Test - Prueba', allowPositionalIds: true };
    const r = await convertQuiz(
      { ...base, sections: { all: { description: 'Son {n}.', notice: null } } },
      ASSESSMENT,
      root,
      recordingProcessor().process,
    );
    expect(r.quiz.sections[0]).toMatchObject({ description: 'Son 3.' });
    expect(r.quiz.sections[0]!.notice).toBeUndefined();
    await expect(
      convertQuiz(
        { ...base, sections: { otra: { notice: 'x' } } },
        ASSESSMENT,
        root,
        recordingProcessor().process,
      ),
    ).rejects.toThrow(/sección «otra»/);
  });

  it('the manifest replaces the explanation of a question, by its id', async () => {
    const base = { slug: 'p', position: 1, folder: 'Test - Prueba', allowPositionalIds: true };
    const first = await convertQuiz(base, ASSESSMENT, root, recordingProcessor().process);
    const id = first.quiz.sections[0]!.groups[0]!.questions[0]!.id;
    const r = await convertQuiz(
      { ...base, questions: { [id]: { explanation: 'Otra **explicación**.' } } },
      ASSESSMENT,
      root,
      recordingProcessor().process,
    );
    expect(r.quiz.sections[0]!.groups[0]!.questions[0]).toMatchObject({
      explanation: 'Otra <b>explicación</b>.',
    });
    await expect(
      convertQuiz(
        { ...base, questions: { 'no-existe': { explanation: 'x' } } },
        ASSESSMENT,
        root,
        recordingProcessor().process,
      ),
    ).rejects.toThrow(/pregunta «no-existe»/);
  });

  it('stops with every error of the skill’s validation', async () => {
    const t = join(root, 'Test - Mala');
    await mkdir(join(t, 'preguntas'), { recursive: true });
    await writeFile(join(t, 'test.json'), JSON.stringify({ titulo: 'Mala' }));
    await writeFile(
      join(t, 'preguntas', '01.json'),
      JSON.stringify({
        preguntas: [
          { q: 'a', o: ['x', 'x'], ok: 'C' },
          { q: 'b', o: ['x', 'y'], ok: 'A', expo: ['solo una'] },
          { q: 'c' },
          { q: 'd', o: ['x', 'y'], ok: 'A', raro: 1 },
          { q: 'e', o: ['x', 'y'], ok: 'A', fig: { tipo: 'pastel' } },
        ],
      }),
    );
    const err = await convertQuiz(
      { slug: 'mala', position: 1, folder: 'Test - Mala' },
      ASSESSMENT,
      root,
      recordingProcessor().process,
    ).catch((e: Error) => e.message);
    expect(err).toContain('alternativas repetidas');
    expect(err).toContain('fuera de rango');
    expect(err).toContain('«expo»');
    expect(err).toContain('hace falta la respuesta');
    expect(err).toContain('campos desconocidos raro');
    expect(err).toContain('figura sin «tipo» válido');
  });

  it('stops if two questions of the test have the same id', async () => {
    const t = join(root, 'Test - Repetida');
    await mkdir(join(t, 'a'), { recursive: true });
    await mkdir(join(t, 'b'), { recursive: true });
    await writeFile(
      join(t, 'test.json'),
      JSON.stringify({
        titulo: 'Repetida',
        secciones: [
          { id: 'a', nombre: 'A', carpeta: 'a' },
          { id: 'b', nombre: 'B', carpeta: 'b' },
        ],
      }),
    );
    const one = { preguntas: [{ q: 'x', o: ['1', '2'], ok: 'A', nota: '[X-1] …' }] };
    await writeFile(join(t, 'a', '01.json'), JSON.stringify(one));
    await writeFile(join(t, 'b', '01.json'), JSON.stringify(one));
    await expect(
      convertQuiz(
        { slug: 'rep', position: 1, folder: 'Test - Repetida' },
        ASSESSMENT,
        root,
        recordingProcessor().process,
      ),
    ).rejects.toThrow(/X-1 está repetida/);
  });

  it('a question whose id would be its place stops the import, unless the manifest accepts it', async () => {
    const t = join(root, 'Test - Sin ids');
    await mkdir(join(t, 'preguntas'), { recursive: true });
    await writeFile(join(t, 'test.json'), JSON.stringify({ titulo: 'Sin ids' }));
    await writeFile(
      join(t, 'preguntas', '01.json'),
      JSON.stringify({
        preguntas: [
          { id: 'fija', q: 'x', o: ['1', '2'], ok: 'A' },
          { q: 'y', o: ['1', '2'], ok: 'B', nota: '[D-p02-04] de la pauta' },
          { q: 'z', o: ['1', '2'], ok: 'A' },
        ],
      }),
    );
    const entry = { slug: 'sin-ids', position: 1, folder: 'Test - Sin ids' };
    await expect(
      convertQuiz(entry, ASSESSMENT, root, recordingProcessor().process),
    ).rejects.toThrow(/1 pregunta\(s\) sin id estable \((preguntas\/)?01\.json #3\)/);
    const r = await convertQuiz(
      { ...entry, allowPositionalIds: true },
      ASSESSMENT,
      root,
      recordingProcessor().process,
    );
    expect(r.quiz.sections[0]!.groups[0]!.questions.map((q) => q.id)).toEqual([
      'fija',
      'D-p02-04',
      '01-3',
    ]);
  });

  it('two tabs with a group «01» and questions without ids (as the skill allows): one id each', async () => {
    const t = join(root, 'Test - Dos pestañas');
    await mkdir(join(t, 'a'), { recursive: true });
    await mkdir(join(t, 'b'), { recursive: true });
    await writeFile(
      join(t, 'test.json'),
      JSON.stringify({
        titulo: 'Dos pestañas',
        secciones: [
          { id: 'practica', nombre: 'Práctica', carpeta: 'a' },
          { id: 'seminario', nombre: 'Seminario', carpeta: 'b' },
        ],
      }),
    );
    const one = {
      preguntas: [
        { q: 'x', o: ['1', '2'], ok: 'A' },
        { q: 'y', r: 'z' },
      ],
    };
    await writeFile(join(t, 'a', '01.json'), JSON.stringify(one));
    await writeFile(join(t, 'b', '01.json'), JSON.stringify(one));
    const r = await convertQuiz(
      { slug: 'dos', position: 1, folder: 'Test - Dos pestañas', allowPositionalIds: true },
      ASSESSMENT,
      root,
      recordingProcessor().process,
    );
    expect(r.quiz.sections.map((s) => s.groups[0]!.questions.map((q) => q.id))).toEqual([
      ['01-1', '01-2'],
      ['seminario.01-1', 'seminario.01-2'],
    ]);
  });

  it('a photo outside the test’s folder stops it, also one whose folder starts the same', async () => {
    const t = join(root, 'Test - Fuera');
    await mkdir(join(t, 'preguntas'), { recursive: true });
    await mkdir(join(root, 'Test - Fuera 2'), { recursive: true });
    await writeFile(join(root, 'Test - Fuera 2', 'foto.png'), await png());
    await writeFile(join(t, 'test.json'), JSON.stringify({ titulo: 'Fuera' }));
    await writeFile(
      join(t, 'preguntas', '01.json'),
      JSON.stringify({
        preguntas: [
          {
            q: 'a',
            o: ['x', 'y'],
            ok: 'A',
            fig: { tipo: 'imagen', src: '../Test - Fuera 2/foto.png' },
          },
        ],
      }),
    );
    await expect(
      convertQuiz(
        { slug: 'fuera', position: 1, folder: 'Test - Fuera' },
        ASSESSMENT,
        root,
        recordingProcessor().process,
      ),
    ).rejects.toThrow(/fuera de la carpeta del test/);
  });
});

// ───────────────── compared with the skill (its page and its Python model) ─────────────────

// Where the skill and the real test are, and what the real test must give, is in the private repository
// (tests/real-material.json, step 2.4): these checks run where it is and are skipped in the public CI.
const PRIVATE = privateMaterial();
const REAL = PRIVATE.config?.quiz;
const MATERIAL = PRIVATE.root;
const SKILL = REAL ? materialPath(MATERIAL, REAL.skill) : '';
const REAL_FOLDER = REAL?.folder ?? '';
const REAL_HTML = REAL ? materialPath(MATERIAL, REAL.html) : '';

/* eslint-disable @typescript-eslint/no-explicit-any -- the skill's page data */
type Page = Record<string, any>;

/** The `TEST` of a page made with the skill (the published HTML). */
function pageData(html: string): Page {
  const start = html.indexOf('const TEST=') + 'const TEST='.length;
  const end = html.indexOf(';\nconst ERRORES');
  return JSON.parse(html.slice(start, end)) as Page;
}

/** The skill's own normalization of a test folder (modelo.py), as its page gets it. */
function skillNormalized(folder: string): Page {
  const out = execFileSync(
    'python3',
    [
      '-I',
      '-c',
      'import sys, json; sys.path.insert(0, sys.argv[1]); import modelo; from pathlib import Path; ' +
        'c = Path(sys.argv[2]); cfg, g = modelo.cargar(c); ' +
        'print(json.dumps(modelo.normalizar(cfg, g, c), ensure_ascii=False))',
      join(SKILL, 'scripts'),
      folder,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(out.toString('utf8')) as Page;
}

/** The page's `FIG` (plantilla/test.html), run as it is: the charts the page would draw. */
function pageCharts(): (spec: Page) => string {
  const html = readFileSync(join(SKILL, 'plantilla/test.html'), 'utf8');
  const from = html.indexOf('const f1=');
  const to = html.indexOf('function figuraHTML');
  const sandbox: Page = {};
  vm.runInNewContext(`${html.slice(from, to)}; this.FIG = FIG;`, sandbox);
  return (spec) => sandbox.FIG[spec.tipo](spec) as string;
}

/**
 * Every question of the page against ours, field by field: texts, key, explanations, origin,
 * figures (the same SVG once sanitized, the same image bytes), tables. Returns what differs.
 */
function compare(
  page: Page,
  quiz: Omit<ImportedQuiz, 'hash' | 'updatedAt'>,
  inputs: Map<string, Buffer>,
  chart: (s: Page) => string,
) {
  const diffs: string[] = [];
  const eq = (where: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null))
      diffs.push(
        `${where}: página ${JSON.stringify(a)?.slice(0, 160)} ≠ ${JSON.stringify(b)?.slice(0, 160)}`,
      );
  };
  const sections: Page[] = page.secciones?.length
    ? page.secciones
    : [{ id: 'all', nombre: '', grupos: page.grupos }];
  eq('secciones', sections.length, quiz.sections.length);
  eq('título', page.titulo, quiz.title);
  eq('kicker', page.kicker, quiz.kicker);
  eq('encabezado', page.encabezado, quiz.heading);
  eq('pie', page.pie, quiz.footer);
  let count = 0;
  sections.forEach((ps, si) => {
    const s = quiz.sections[si]!;
    const at = `sección ${s.id}`;
    if (page.secciones?.length) {
      eq(`${at} id`, ps.id, s.id);
      eq(`${at} nombre`, ps.nombre, s.name);
      eq(`${at} etiqueta`, ps.etiqueta, s.label);
      eq(`${at} descripción`, ps.descripcion, s.description);
      eq(`${at} aviso`, ps.aviso === undefined ? page.aviso : ps.aviso, s.notice);
      eq(`${at} grupos_titulo`, ps.grupos_titulo ?? page.grupos_titulo, s.groupsTitle);
      eq(
        `${at} listado`,
        ps.listado
          ? {
              title: ps.listado.titulo,
              items: ps.listado.items.map((x: any) =>
                typeof x === 'string' ? x : { title: x.titulo, items: x.items },
              ),
            }
          : undefined,
        s.listing,
      );
    } else {
      eq(`${at} descripción`, page.descripcion, s.description);
      eq(`${at} aviso`, page.aviso, s.notice);
      eq(`${at} grupos_titulo`, page.grupos_titulo, s.groupsTitle);
    }
    eq(`${at} grupos`, ps.grupos.length, s.groups.length);
    ps.grupos.forEach((pg: Page, gi: number) => {
      const g = s.groups[gi]!;
      eq(`${at} grupo ${gi} id`, pg.id, g.id);
      eq(`${at} grupo ${g.id} nombre`, pg.nombre, g.name);
      eq(`${at} grupo ${g.id} tema`, pg.tema || undefined, g.topic);
      eq(`${at} grupo ${g.id} preguntas`, pg.preguntas.length, g.questions.length);
      pg.preguntas.forEach((pq: Page, qi: number) => {
        count++;
        const q = g.questions[qi]!;
        const w = `${s.id}/${g.id} #${qi + 1} (${q.id})`;
        eq(`${w} e`, pq.e, q.context);
        eq(`${w} q`, pq.q, q.prompt);
        eq(`${w} exp`, pq.exp, q.explanation);
        // «cambio» is not published (the owner, 2026-11-01).
        if ('change' in q) diffs.push(`${w}: publica «cambio»`);
        eq(`${w} origen`, pq.origen, q.origin);
        if (q.kind === 'choice') {
          eq(`${w} o`, pq.o, q.options);
          eq(`${w} ok`, pq.ok, q.correct);
          eq(`${w} expo`, pq.expo, q.optionExplanations);
          eq(`${w} fijas`, !!pq.fijas, q.fixedOrder);
        } else {
          eq(`${w} r`, pq.r, q.answer);
        }
        eq(`${w} fig_izq`, !!pq.fig_izq, q.figureBeside);
        const pf: Page[] = pq.fig ? (Array.isArray(pq.fig) ? pq.fig : [pq.fig]) : [];
        eq(`${w} figuras`, pf.length, q.figures.length);
        pf.forEach((f, fi) => {
          const ours = q.figures[fi]!;
          eq(`${w} fig ${fi} pie`, f.pie, ours.caption);
          eq(`${w} fig ${fi} ancho`, f.ancho, ours.displayWidth);
          if (f.tipo === 'imagen') {
            eq(`${w} fig ${fi} tipo`, 'image', ours.kind);
            if (ours.kind !== 'image') return;
            eq(`${w} fig ${fi} alt`, f.alt ?? '', ours.alt);
            const bytes = Buffer.from(
              String(f.src).slice(String(f.src).indexOf(',') + 1),
              'base64',
            );
            if (!inputs.get(ours.media)?.equals(bytes)) diffs.push(`${w} fig ${fi}: otra imagen`);
          } else {
            eq(`${w} fig ${fi} tipo`, 'svg', ours.kind);
            if (ours.kind !== 'svg') return;
            const raw = f.tipo === 'svg' ? f.svg : chart(f);
            eq(`${w} fig ${fi} svg`, sanitizeSvg(raw).svg, ours.svg);
          }
        });
        if (pq.tabla) {
          const t = pq.tabla;
          const head = t.cab ?? 1;
          eq(
            `${w} tabla`,
            {
              ...(t.titulo ? { title: t.titulo } : {}),
              rows: t.filas.map((row: unknown[], i: number) =>
                row.map((c, j) => {
                  const o: Page = c !== null && typeof c === 'object' ? (c as Page) : { t: c };
                  return {
                    html: o.t ?? '',
                    header: i < head || (!!t.col_cab && j === 0),
                    ...(o.hl ? { highlight: true } : {}),
                    ...(o.vacia ? { empty: true } : {}),
                    ...(o.cs ? { colSpan: o.cs } : {}),
                    ...(o.rs ? { rowSpan: o.rs } : {}),
                  };
                }),
              ),
            },
            q.table,
          );
        } else eq(`${w} tabla`, undefined, q.table);
      });
    });
  });
  return { diffs, count };
}

const haveSkill = !!REAL && realMaterialHere([join(SKILL, 'plantilla/test.html')]);
const haveReal =
  haveSkill && realMaterialHere([join(MATERIAL, REAL_FOLDER, 'test.json'), REAL_HTML]);
const skipped = (name: string, here: boolean) =>
  here ? name : `${name} (se salta: ${PRIVATE.skipReason || 'falta el material real'})`;

describe.skipIf(!haveSkill)(
  skipped('the charts, as the skill’s page draws them', haveSkill),
  () => {
    it('the same SVG for every kind of chart of the skill’s examples', async () => {
      const chart = pageCharts();
      const specs: Page[] = [];
      for (const f of [
        'ejemplos/formato/preguntas/muestra.json',
        ...['02', '03', '04', '05'].map((n) => `ejemplos/bioestadistica/preguntas/${n}.json`),
      ]) {
        for (const q of JSON.parse(readFileSync(join(SKILL, f), 'utf8')).preguntas as Page[]) {
          for (const fig of q.fig ? (Array.isArray(q.fig) ? q.fig : [q.fig]) : []) {
            if (!['svg', 'imagen'].includes(fig.tipo)) specs.push(fig);
          }
        }
      }
      // Plus one of each kind with every option.
      specs.push(
        {
          tipo: 'histograma',
          barras: [
            [0, 10, 4],
            [10, 20, 9],
          ],
          x: [0, 20],
          y_max: 10,
          y_paso: 2,
          titulo: 'T',
          x_rotulo: 'x',
          y_rotulo: 'y',
          x_paso: 5,
          color: 2,
        },
        {
          tipo: 'cajas',
          grupos: [{ nombre: 'A', min: 1, q1: 2, med: 3, q3: 4, max: 5, atipicos: [7] }],
          y: [0, 8],
          y_marcas: [0, 4, 8],
        },
        {
          tipo: 'dispersion',
          puntos: [
            [1, 2],
            [3, 4],
          ],
          x: [0, 5],
          y: [0, 5],
          x_paso: 1,
          y_paso: 1,
          tendencia: [
            [0, 1],
            [5, 5],
          ],
          radio: 3,
        },
        {
          tipo: 'lineas',
          series: [
            {
              nombre: 'a',
              puntos: [
                [0, 0],
                [1, 1],
              ],
            },
            {
              nombre: 'b',
              puntos: [
                [0, 1],
                [1, 0],
              ],
              discontinua: true,
            },
          ],
          x: [0, 1],
          y: [0, 1],
          x_paso: 0.5,
          y_paso: 0.5,
          escalonada: true,
          marcadores: true,
        },
        {
          tipo: 'barras',
          categorias: ['a', 'b'],
          valores: [1.25, 2],
          y_max: 3,
          y_paso: 1,
          valores_visibles: false,
          color: '#123456',
        },
      );
      expect(new Set(specs.map((s) => s.tipo))).toEqual(
        new Set(['histograma', 'cajas', 'dispersion', 'barras', 'lineas']),
      );
      for (const s of specs) expect(drawChart(s)).toBe(chart(s));
    });

    it('the skill’s examples convert like its own model normalizes them', async () => {
      const chart = pageCharts();
      for (const folder of ['ejemplos/formato', 'ejemplos/bioestadistica']) {
        const { process, inputs } = recordingProcessor();
        const r = await convertQuiz(
          { slug: 'x', position: 1, folder, allowPositionalIds: true },
          ASSESSMENT,
          SKILL,
          process,
        );
        const { diffs, count } = compare(
          skillNormalized(join(SKILL, folder)),
          r.quiz,
          inputs,
          chart,
        );
        expect(diffs).toEqual([]);
        expect(count).toBe(r.quiz.questionCount);
        expect(r.warnings).toEqual([]);
      }
    });
  },
);

describe.skipIf(!haveReal)(
  skipped('a real test, compared with its page and the skill', haveReal),
  () => {
    // Only read inside the tests, which run only with the config (haveReal).
    const want = REAL?.expect as NonNullable<typeof REAL>['expect'];
    let converted: Awaited<ReturnType<typeof convertQuiz>>;
    let inputs: Map<string, Buffer>;
    beforeAll(async () => {
      const p = recordingProcessor();
      inputs = p.inputs;
      converted = await convertQuiz(
        { slug: 'real', position: 1, folder: REAL_FOLDER },
        ASSESSMENT,
        MATERIAL,
        p.process,
      );
    });

    it('its questions, tabs and stable ids from the sources', () => {
      const q = converted.quiz;
      expect(converted.warnings).toEqual([]);
      expect(q.id).toBe(defaultQuizId(ASSESSMENT.id, 'real'));
      expect(q.questionCount).toBe(want.questions);
      expect(q.sections.map((s) => [s.id, s.questionCount])).toEqual(want.sections);
      const ids = q.sections.flatMap((s) => s.groups.flatMap((g) => g.questions.map((x) => x.id)));
      expect(new Set(ids).size).toBe(want.questions);
      if (want.newIdPattern) {
        const pattern = new RegExp(want.newIdPattern);
        expect(ids.filter((id) => pattern.test(id))).toHaveLength(want.newIds ?? 0);
      }
      expect(ids.every((id) => !/^\d\d-\d+$/.test(id))).toBe(true); // none by position
      expect(q.media).toHaveLength(want.media);
    });

    it('every question, key, explanation and figure as the published page shows it', () => {
      const page = pageData(readFileSync(REAL_HTML, 'utf8'));
      const { diffs, count } = compare(page, converted.quiz, inputs, pageCharts());
      expect(diffs).toEqual([]);
      expect(count).toBe(want.questions);
    });

    it('the questions of statements (I, II, III…) are recognized, every one in order from I', () => {
      const all = converted.quiz.sections.flatMap((s) => s.groups.flatMap((g) => g.questions));
      const split = all
        .flatMap((q) => [q.prompt, q.context ?? ''].map((t) => [q.id, splitStatements(t)] as const))
        .filter(([, x]) => x);
      expect(split).toHaveLength(want.statements);
      if (want.statementExample) {
        // As the source writes them (lowercase, and a IV in capitals, in the one of the config).
        const example = want.statementExample;
        expect(split.find(([id]) => id === example.id)?.[1]?.items.map((i) => i.numeral)).toEqual(
          example.numerals,
        );
      }
      // Every question with a line that starts with a numeral was split.
      const missed = all.filter(
        (q) =>
          /(^|<br>)\s*(I|II|III|i|ii|iii)\s*[.)-]/.test(q.prompt) && !splitStatements(q.prompt),
      );
      expect(missed.map((q) => q.id)).toEqual([]);
    });

    it('as the manifest publishes it, without what repeats the context', async () => {
      const manifest = JSON.parse(
        readFileSync(materialPath(PRIVATE.folder!, REAL!.manifest), 'utf8'),
      ) as { tests: QuizEntry[] };
      const entry = manifest.tests.find((t) => t.folder === REAL_FOLDER)!;
      const r = await convertQuiz(entry, ASSESSMENT, MATERIAL, recordingProcessor().process);
      expect(r.quiz).toMatchObject(want.published);
      // The notices say where the questions come from, not how they were made nor what is for another exam.
      const [first, second] = r.quiz.sections;
      expect(first!.notice).toBe(want.notices.first);
      expect(second!.notice).toMatch(new RegExp(want.notices.second));
      const texts = JSON.stringify(r.quiz.sections.map(({ groups: _g, ...s }) => s));
      expect(texts).not.toMatch(new RegExp(want.notices.forbidden, 'i'));
      expect(first!.description).toMatch(new RegExp(want.notices.firstDescription));
    });

    it('as the skill’s model normalizes the folder today', () => {
      const { diffs } = compare(
        skillNormalized(join(MATERIAL, REAL_FOLDER)),
        converted.quiz,
        inputs,
        pageCharts(),
      );
      expect(diffs).toEqual([]);
    });
  },
);
