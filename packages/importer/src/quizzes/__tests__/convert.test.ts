// Tests converting a test in the skill's format.
import sharp from 'sharp';
import type { QuizFigure, QuizQuestion } from '@qv/schema';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ASSESSMENT, recordingProcessor } from '../../test/quizFixtures';
import { convertQuiz } from '../convert';

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
    const [s] = q.sections;
    expect(s).toMatchObject({
      id: 'all',
      name: '',
      notice: 'Aviso general',
      groupsTitle: 'Qué ensayar',
      questionCount: 3,
      hasChoices: true,
    });
    expect(s!.description).toContain('respuesta corta');
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
    expect(JSON.stringify(q)).not.toContain('nota interna');
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
    ).catch((e: unknown) => (e as Error).message);
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

  it('more than three questions without a stable id: the first three are named and the rest hinted at', async () => {
    const t = join(root, 'Test - Muchas sin ids');
    await mkdir(join(t, 'preguntas'), { recursive: true });
    await writeFile(join(t, 'test.json'), JSON.stringify({ titulo: 'Muchas' }));
    const q = { q: 'x', r: 'y' };
    await writeFile(join(t, 'preguntas', '01.json'), JSON.stringify({ preguntas: [q, q, q, q] }));
    const entry = { slug: 'muchas', position: 1, folder: 'Test - Muchas sin ids' };
    const error = await convertQuiz(entry, ASSESSMENT, root, recordingProcessor().process).catch(
      (e: unknown) => (e as Error).message,
    );
    expect(error).toMatch(/4 pregunta\(s\) sin id estable \([^)]*#1, [^)]*#2, [^)]*#3…\)/);
  });

  it('a custom palette of test.json is used; a name that does not exist lists the ones that do', async () => {
    const t = join(root, 'Test - Tema');
    await mkdir(join(t, 'preguntas'), { recursive: true });
    await writeFile(
      join(t, 'preguntas', '01.json'),
      JSON.stringify({ preguntas: [{ id: 'a', q: 'x', r: 'y' }] }),
    );
    const entry = { slug: 'tema', position: 1, folder: 'Test - Tema' };
    const convert = (tema: unknown) =>
      writeFile(join(t, 'test.json'), JSON.stringify({ titulo: 'Tema', tema })).then(() =>
        convertQuiz(entry, ASSESSMENT, root, recordingProcessor().process),
      );
    const custom = await convert({ claro: { ac: '#123456' } });
    expect(custom.quiz.theme.light.ac).toBe('#123456');
    expect(custom.quiz.theme.dark.ac).not.toBe('#123456');
    expect((await convert('bronce')).quiz.theme.light.ac).toBe('#8A5A14');
    expect((await convert(undefined)).quiz.theme.light.ac).toBe('#2E5C7E');
    await expect(convert('fucsia')).rejects.toThrow(/no existe el tema «fucsia» \(hay: azul,/);
  });

  it('a notice in the manifest replaces the one of the test, an empty text of the test means none', async () => {
    const t = join(root, 'Test - Aviso');
    await mkdir(join(t, 'preguntas'), { recursive: true });
    await writeFile(
      join(t, 'preguntas', '01.json'),
      JSON.stringify({ preguntas: [{ id: 'a', q: 'x', r: 'y' }] }),
    );
    const entry = { slug: 'aviso', position: 1, folder: 'Test - Aviso' };
    const run = async (cfg: object, e: object = {}, own?: object) => {
      await writeFile(
        join(t, 'test.json'),
        JSON.stringify({
          titulo: 'Aviso',
          ...(own ? { secciones: [{ id: 'all', nombre: 'S', carpeta: 'preguntas', ...own }] } : {}),
          ...cfg,
        }),
      );
      return (await convertQuiz({ ...entry, ...e }, ASSESSMENT, root, recordingProcessor().process))
        .quiz.sections[0]!;
    };
    expect((await run({ aviso: 'Del test' })).notice).toBe('Del test');
    expect(
      (await run({ aviso: 'Del test' }, { sections: { all: { notice: 'Del *manifiesto*' } } }))
        .notice,
    ).toBe('Del <i>manifiesto</i>');
    expect((await run({ aviso: 'Del test' }, {}, { aviso: 'De la sección' })).notice).toBe(
      'De la sección',
    );
    expect((await run({ aviso: 'Del test' }, {}, { aviso: '' })).notice).toBeUndefined();
    expect((await run({ aviso: '  ' })).notice).toBeUndefined();
    expect((await run({ aviso: 'Del test' }, {})).notice).toBe('Del test');
    expect(
      (await run({ aviso: 'Del test' }, { sections: { all: { description: 'Sola' } } })).notice,
    ).toBe('Del test');
  });

  it('a table without «cab» has one header row, and an empty cell is an empty cell, not the word null', async () => {
    const t = join(root, 'Test - Tabla');
    await mkdir(join(t, 'preguntas'), { recursive: true });
    await writeFile(join(t, 'test.json'), JSON.stringify({ titulo: 'Tabla' }));
    await writeFile(
      join(t, 'preguntas', '01.json'),
      JSON.stringify({
        preguntas: [
          {
            id: 'a',
            q: 'x',
            r: 'y',
            tabla: {
              filas: [
                ['Cabecera', { t: null }],
                ['dato', { t: null, vacia: true }, { t: 'x', rs: 2 }],
              ],
            },
          },
        ],
      }),
    );
    const r = await convertQuiz(
      { slug: 'tabla', position: 1, folder: 'Test - Tabla' },
      ASSESSMENT,
      root,
      recordingProcessor().process,
    );
    expect(r.quiz.sections[0]!.groups[0]!.questions[0]).toMatchObject({
      table: {
        rows: [
          [
            { html: 'Cabecera', header: true },
            { html: '', header: true },
          ],
          [
            { html: 'dato', header: false },
            { html: '', header: false, empty: true },
            { html: 'x', header: false, rowSpan: 2 },
          ],
        ],
      },
    });
  });

  it('the description of a section: its own text, else the test’s, else the standard one', async () => {
    const t = join(root, 'Test - Descripción');
    await mkdir(join(t, 'a'), { recursive: true });
    await writeFile(
      join(t, 'a', '01.json'),
      JSON.stringify({ preguntas: [{ id: 'a', q: 'x', o: ['1', '2'], ok: 'A' }] }),
    );
    const entry = { slug: 'desc', position: 1, folder: 'Test - Descripción' };
    const run = async (cfg: object, section: object = {}) => {
      await writeFile(
        join(t, 'test.json'),
        JSON.stringify({
          titulo: 'D',
          secciones: [{ id: 'a', nombre: 'A', carpeta: 'a', ...section }],
          ...cfg,
        }),
      );
      return (await convertQuiz(entry, ASSESSMENT, root, recordingProcessor().process)).quiz
        .sections[0]!;
    };
    expect((await run({}, { descripcion: 'De la **sección** ({n})' })).description).toBe(
      'De la <b>sección</b> (1)',
    );
    expect((await run({ descripcion: 'Del test' })).description).toBe('Del test');
    expect((await run({})).description).toContain('Las <b>1 preguntas</b>');
    expect((await run({}, { etiqueta: 'Pestaña *1*' })).label).toBe('Pestaña <i>1</i>');
    expect((await run({})).label).toBeUndefined();
  });

  it('the title over the groups of a section: its own, else the test’s, else «Qué ensayar»', async () => {
    const t = join(root, 'Test - Grupos');
    await mkdir(join(t, 'a'), { recursive: true });
    await writeFile(
      join(t, 'a', '01.json'),
      JSON.stringify({ preguntas: [{ id: 'a', q: 'x', o: ['1', '2'], ok: 'A' }] }),
    );
    const run = async (cfg: object, section: object = {}) => {
      await writeFile(
        join(t, 'test.json'),
        JSON.stringify({
          titulo: 'G',
          secciones: [{ id: 'a', nombre: 'A', carpeta: 'a', ...section }],
          ...cfg,
        }),
      );
      const entry = { slug: 'grupos', position: 1, folder: 'Test - Grupos' };
      return (await convertQuiz(entry, ASSESSMENT, root, recordingProcessor().process)).quiz
        .sections[0]!.groupsTitle;
    };
    expect(await run({ grupos_titulo: 'Del test' }, { grupos_titulo: 'De la sección' })).toBe(
      'De la sección',
    );
    expect(await run({ grupos_titulo: 'Del test' }, { grupos_titulo: '  ' })).toBe('Del test');
    expect(await run({})).toBe('Qué ensayar');
  });

  it('the listing of a section: plain items and items with their own list, under a title or the default one', async () => {
    const t = join(root, 'Test - Listado');
    await mkdir(join(t, 'a'), { recursive: true });
    await writeFile(
      join(t, 'a', '01.json'),
      JSON.stringify({ preguntas: [{ id: 'a', q: 'x', r: 'y' }] }),
    );
    const sectionWith = (listado: object) => ({
      titulo: 'L',
      secciones: [{ id: 'a', nombre: 'A', carpeta: 'a', listado }],
    });
    const run = async (listado: object) => {
      await writeFile(join(t, 'test.json'), JSON.stringify(sectionWith(listado)));
      const r = await convertQuiz(
        { slug: 'listado', position: 1, folder: 'Test - Listado' },
        ASSESSMENT,
        root,
        recordingProcessor().process,
      );
      return r.quiz.sections[0]!.listing;
    };
    expect(
      await run({ titulo: 'Temas', items: ['uno *a*', { titulo: 'Dos', items: ['x', 'y^2^'] }] }),
    ).toEqual({
      title: 'Temas',
      items: ['uno <i>a</i>', { title: 'Dos', items: ['x', 'y<sup>2</sup>'] }],
    });
    expect((await run({ items: ['solo'] }))!.title).toBe('Listado');
  });

  it('a figure goes beside the alternatives only for a question that has them, and only if it asked', async () => {
    const t = join(root, 'Test - Figura al lado');
    await mkdir(join(t, 'preguntas'), { recursive: true });
    await writeFile(join(t, 'test.json'), JSON.stringify({ titulo: 'Al lado' }));
    const fig = [{ tipo: 'svg', svg: '<svg viewBox="0 0 1 1"/>' }];
    await writeFile(
      join(t, 'preguntas', '01.json'),
      JSON.stringify({
        preguntas: [
          { id: 'a', q: 'x', o: ['1', '2'], ok: 'A', fig, fig_izq: true },
          { id: 'b', q: 'x', o: ['1', '2'], ok: 'A', fig },
          { id: 'c', q: 'x', r: 'y', fig, fig_izq: true },
        ],
      }),
    );
    const r = await convertQuiz(
      { slug: 'lado', position: 1, folder: 'Test - Figura al lado' },
      ASSESSMENT,
      root,
      recordingProcessor().process,
    );
    expect(r.quiz.sections[0]!.groups[0]!.questions.map((q) => q.figureBeside)).toEqual([
      true,
      false,
      false,
    ]);
  });
});
