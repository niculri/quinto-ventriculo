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
});
