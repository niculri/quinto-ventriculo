// Tests the validation of a test in the skill's format: every problem of the test at once, worded as the skill words it.
import { describe, expect, it } from 'vitest';
import { correctIndex, validateTest } from '../schema';
import type { LoadedGroup } from '../schema';

const group = (preguntas: unknown[], over: Partial<LoadedGroup> = {}): LoadedGroup => ({
  data: { preguntas },
  id: '01',
  file: 'preguntas/01.json',
  section: null,
  ...over,
});

const errorsOf = (cfg: Record<string, unknown>, groups: LoadedGroup[]) =>
  validateTest({ titulo: 'T', ...cfg }, groups, '/tmp/test').errors;

describe('correctIndex', () => {
  it('takes a letter or a number from 0, and says what is wrong with any other', () => {
    expect(correctIndex('b', 3)).toBe(1);
    expect(correctIndex(2, 3)).toBe(2);
    expect(() => correctIndex('Z', 3)).toThrow('usa una letra (A–C) o un índice desde 0');
    expect(() => correctIndex(3, 3)).toThrow('fuera de rango: hay 3 alternativas');
  });
});

describe('validateTest', () => {
  it('a test with its questions has no errors, and its parsed groups', () => {
    const r = validateTest(
      { titulo: 'T' },
      [
        group([
          { q: 'a', o: ['x', 'y'], ok: 'A' },
          { q: 'b', r: 'sí' },
        ]),
      ],
      '/tmp/test',
    );
    expect(r.errors).toEqual([]);
    expect(r.test?.groups[0]?.questions).toHaveLength(2);
  });

  it('a test without title or questions', () => {
    expect(validateTest({}, [], '/tmp/test').errors).toEqual([
      'test.json: falta «titulo» (el nombre del test)',
      'no hay archivos de preguntas',
    ]);
  });

  it('a question that is not an object, and the fields it does not know', () => {
    const errors = errorsOf({}, [group(['texto', { q: 'a', r: 'b', raro: 1, otro: 2 }])]);
    expect(errors).toContain('preguntas/01.json #1: no es un objeto');
    expect(errors).toContain('preguntas/01.json #2: campos desconocidos raro, otro');
  });

  it('the rules between the fields of a question are checked even if another field is wrong', () => {
    const errors = errorsOf({}, [group([{ q: ' ', o: ['x', 'x'], ok: 'A', expo: ['solo una'] }])]);
    expect(errors).toEqual([
      'preguntas/01.json #1: falta el texto de la pregunta («q»)',
      'preguntas/01.json #1: hay alternativas repetidas',
      'preguntas/01.json #1: «expo» debe tener una explicación (texto) por alternativa, en el orden de «o»',
    ]);
  });

  it('a table needs its rows, and every cell a text or a number or an object with «t»', () => {
    const errors = errorsOf({}, [
      group([
        { q: 'a', r: 'b', tabla: {} },
        { q: 'a', r: 'b', tabla: { filas: [['x', { hl: true }, null]] } },
      ]),
    ]);
    expect(errors).toEqual([
      'preguntas/01.json #1: «tabla» necesita «filas» (una lista de filas)',
      'preguntas/01.json #2: celda sin «t»',
      'preguntas/01.json #2: celda inválida null',
    ]);
  });

  it('a figure of a type the skill does not know, one without its data, and a chart whose data is not numbers', () => {
    const errors = errorsOf({}, [
      group([
        { q: 'a', r: 'b', fig: { tipo: 'pastel' } },
        { q: 'a', r: 'b', fig: { tipo: 'barras', categorias: ['A'] } },
        {
          q: 'a',
          r: 'b',
          fig: { tipo: 'barras', categorias: ['A'], valores: ['x'], y_max: 3, y_paso: 1 },
        },
      ]),
    ]);
    expect(errors[0]).toContain('figura sin «tipo» válido (histograma, cajas');
    expect(errors[1]).toBe(
      'preguntas/01.json #2: la figura «barras» necesita valores, y_max, y_paso',
    );
    expect(errors[2]).toBe(
      'preguntas/01.json #3: se esperaba un número y llegó un texto (figura 1, «valores.0»)',
    );
  });

  it('what is wrong with the data of a chart is said in Spanish, with the figure and the field', () => {
    const chart = (extra: Record<string, unknown>) => ({
      q: 'a',
      r: 'b',
      fig: [
        { tipo: 'imagen', src: 'data:image/png;base64,AA==' },
        { tipo: 'dispersion', puntos: [[1, 2]], x: [0, 1], y: [0, 1], ...extra },
      ],
    });
    const errors = errorsOf({}, [
      group([
        chart({ puntos: [[1, null]] }),
        chart({ puntos: [[1, 2, 3]] }),
        chart({ puntos: [[1]] }),
        chart({ radio: 'grande', tendencia: 'recta' }),
      ]),
    ]);
    expect(errors).toEqual([
      'preguntas/01.json #1: se esperaba un número y llegó vacío (null) (figura 2, «puntos.0.1»)',
      'preguntas/01.json #2: la lista tiene más de 2 elementos (figura 2, «puntos.0»)',
      'preguntas/01.json #3: la lista tiene menos de 2 elementos (figura 2, «puntos.0»)',
      'preguntas/01.json #4: se esperaba una lista de largo fijo y llegó un texto (figura 2, «tendencia»)',
      'preguntas/01.json #4: se esperaba un número y llegó un texto (figura 2, «radio»)',
    ]);
  });

  it('the sections: a list with a section each, a short id, a name and the folder with its questions', () => {
    expect(errorsOf({ secciones: [] }, [group([{ q: 'a', r: 'b' }])])).toEqual([
      'test.json: «secciones» debe ser una lista con al menos una sección',
    ]);
    const errors = errorsOf(
      { secciones: [{ id: 'A b', carpeta: 'x' }, 5, { id: 'ok', nombre: 'N', carpeta: 'c' }] },
      [group([{ q: 'a', r: 'b' }], { section: 'ok' })],
    );
    expect(errors).toEqual([
      'test.json: sección 1: «id» debe ser corto, en minúsculas y sin espacios',
      'test.json: sección 1: falta «nombre»',
      'test.json: sección 1: no hay preguntas en x/*.json',
      'test.json: sección 2 no es un objeto',
    ]);
  });

  it('a group id repeated in a section, and a group without questions', () => {
    const errors = errorsOf({}, [
      group([{ q: 'a', r: 'b' }]),
      group([], { file: 'preguntas/02.json' }),
    ]);
    expect(errors).toEqual([
      'id de grupo repetido: 01',
      'preguntas/02.json: «preguntas» está vacía o no es una lista',
    ]);
  });

  it('the figures: a caption must be text, an SVG must be an SVG, an image must stay inside the test’s folder', () => {
    const fig = (f: unknown) => group([{ q: 'a', r: 'b', fig: f }]);
    const errors = [
      fig({ tipo: 'imagen', src: 'a.png', pie: 3 }),
      fig({ tipo: 'svg', svg: '  <div/>' }),
      fig({ tipo: 'imagen', src: '../otro/a.png' }),
      fig({ tipo: 'imagen', src: '' }),
      fig({ tipo: 'imagen', src: 'dentro/../a.png' }),
      fig({ tipo: 'svg', svg: '  <svg viewBox="0 0 1 1"/>' }),
      fig(null),
    ].flatMap((g) => errorsOf({}, [g]));
    expect(errors).toEqual([
      'preguntas/01.json #1: «pie» de la figura debe ser un texto',
      'preguntas/01.json #1: «svg» debe empezar con <svg',
      'preguntas/01.json #1: la imagen ../otro/a.png está fuera de la carpeta del test',
      'preguntas/01.json #1: la imagen  está fuera de la carpeta del test',
      expect.stringContaining('figura sin «tipo» válido'),
    ]);
  });

  it('a figure may be one object or a list of them', () => {
    const svg = { tipo: 'svg', svg: '<svg/>' };
    expect(errorsOf({}, [group([{ q: 'a', r: 'b', fig: svg }])])).toEqual([]);
    expect(errorsOf({}, [group([{ q: 'a', r: 'b', fig: [svg, svg] }])])).toEqual([]);
  });

  it('a question with alternatives needs its correct one, and it has to exist', () => {
    const errors = errorsOf({}, [
      group([
        { q: 'a', o: ['x', 'y'] },
        { q: 'b', o: ['x', 'y'], ok: 'C' },
        { q: 'c', o: ['x', 'y'], ok: 5 },
        { q: 'd', o: ['x', ' X '], ok: 'A', expo: ['uno', 'dos'] },
      ]),
    ]);
    expect(errors).toEqual([
      'preguntas/01.json #1: falta «ok» (la alternativa correcta)',
      'preguntas/01.json #2: «ok» = "C" fuera de rango: hay 2 alternativas',
      'preguntas/01.json #3: «ok» = 5 fuera de rango: hay 2 alternativas',
      'preguntas/01.json #4: hay alternativas repetidas',
    ]);
  });

  it('a question without alternatives cannot carry their fields and needs its answer; a side figure needs a figure', () => {
    const errors = errorsOf({}, [
      group([
        { q: 'a', r: 'b', ok: 'A', expo: ['x'] },
        { q: 'b' },
        { q: 'c', r: 'd', fig_izq: true },
        { q: 'd', r: 'e', fig_izq: true, fig: { tipo: 'svg', svg: '<svg/>' } },
        { q: 'e', o: 'sola', r: 'x' },
      ]),
    ]);
    expect(errors).toEqual([
      'preguntas/01.json #1: tiene «expo» pero no alternativas («o»)',
      'preguntas/01.json #1: tiene «ok» pero no alternativas («o»)',
      'preguntas/01.json #2: sin alternativas («o») hace falta la respuesta («r»)',
      'preguntas/01.json #3: «fig_izq» sin figura («fig»)',
      'preguntas/01.json #5: «o» debe ser una lista de 2 a 6 alternativas con texto',
    ]);
  });

  it('a section id repeated, or missing, is reported once and the section still gets its checks', () => {
    const ok = { nombre: 'N', carpeta: 'c' };
    const errors = errorsOf({ secciones: [{ id: 'a', ...ok }, { id: 'a', ...ok }, { ...ok }] }, [
      group([{ q: 'a', r: 'b' }], { section: 'a' }),
    ]);
    expect(errors).toEqual([
      'test.json: id de sección repetido: a',
      'test.json: sección 3: «id» debe ser corto, en minúsculas y sin espacios',
      'test.json: sección 3: no hay preguntas en c/*.json',
    ]);
  });

  it('a question id must be a short plain name', () => {
    const errors = errorsOf({}, [
      group([
        { id: 'p-1.a_2', q: 'a', r: 'b' },
        { id: 'con espacio', q: 'a', r: 'b' },
        { id: '-empieza', q: 'a', r: 'b' },
        { id: 'x'.repeat(65), q: 'a', r: 'b' },
      ]),
    ]);
    expect(errors).toEqual([
      'preguntas/01.json #2: «id» inválido (letras, números, «.», «_», «-»)',
      'preguntas/01.json #3: «id» inválido (letras, números, «.», «_», «-»)',
      'preguntas/01.json #4: «id» inválido (letras, números, «.», «_», «-»)',
    ]);
  });

  it('a valid test with sections gives back each section with its id and its parsed groups', () => {
    const r = validateTest(
      {
        titulo: 'T',
        secciones: [
          { id: 'a', nombre: 'Primera', carpeta: 'a' },
          { id: 'b', nombre: 'Segunda', carpeta: 'b', listado: { items: ['x'] } },
        ],
      },
      [
        group([{ q: 'a', r: 'b' }], { section: 'a', file: 'a/01.json' }),
        group([{ q: 'c', r: 'd' }], { section: 'b', file: 'b/01.json' }),
      ],
      '/tmp/test',
    );
    expect(r.errors).toEqual([]);
    expect(r.test!.sections!.map((s) => [s.id, s.section.nombre])).toEqual([
      ['a', 'Primera'],
      ['b', 'Segunda'],
    ]);
    expect(r.test!.groups.map((g) => g.section)).toEqual(['a', 'b']);
  });

  it('a section field that does not belong, or a listing that is not a list of texts', () => {
    const errors = errorsOf(
      {
        secciones: [
          { id: 'a', nombre: 'N', carpeta: 'c', raro: 1, listado: { items: [1] } },
          {
            id: 'b',
            nombre: 'N',
            carpeta: 'd',
            listado: { titulo: 'T', items: ['x', { titulo: 'U', items: ['y'] }] },
          },
        ],
      },
      [
        group([{ q: 'a', r: 'b' }], { section: 'a' }),
        group([{ q: 'a', r: 'b' }], { id: '02', section: 'b' }),
      ],
    );
    expect(errors).toEqual([
      'test.json: sección 1: «listado» debe ser {"titulo": …, "items": [textos]}',
      'test.json: sección 1: campos desconocidos raro',
    ]);
  });

  it('a value of another kind is described by what it is: nothing, a function, a big number', () => {
    const point = (p: unknown) =>
      group([
        {
          q: 'a',
          r: 'b',
          fig: { tipo: 'dispersion', puntos: [[1, 2]], x: [0, 1], y: [0, 1], radio: p },
        },
      ]);
    const say = (p: unknown) => errorsOf({}, [point(p)])[0];
    expect(say(() => 1)).toContain('llegó function (figura 1, «radio»)');
    expect(say(10n)).toContain('llegó bigint (figura 1, «radio»)');
    expect(say(true)).toContain('llegó verdadero o falso');
    expect(say({})).toContain('llegó un objeto');
    expect(say([])).toContain('llegó una lista');
    expect(
      errorsOf({}, [
        group([
          {
            q: 'a',
            r: 'b',
            fig: { tipo: 'barras', categorias: ['A'], valores: [undefined], y_max: 1, y_paso: 1 },
          },
        ]),
      ])[0],
    ).toContain('llegó nada');
  });

  it('a value that fits no type of the union is told so, with the figure and the field', () => {
    const errors = errorsOf({}, [
      group([
        {
          q: 'a',
          r: 'b',
          fig: { tipo: 'dispersion', puntos: [[1, 2]], x: [0, 1], y: [0, 1], color: [1] },
        },
      ]),
    ]);
    expect(errors).toEqual([
      'preguntas/01.json #1: el valor no es de un tipo que se acepte aquí (figura 1, «color»)',
    ]);
  });

  it('a problem at the top of a question is placed without a figure; one in a field with a path says it', () => {
    const errors = errorsOf({}, [
      group([
        { q: 'a', r: 'b', tabla: { filas: 'x' } },
        { q: 'a', r: 'b', fijas: 'sí' },
      ]),
    ]);
    expect(errors).toEqual([
      'preguntas/01.json #1: «tabla» necesita «filas» (una lista de filas)',
      'preguntas/01.json #2: «fijas» debe ser true o false',
    ]);
  });
});
