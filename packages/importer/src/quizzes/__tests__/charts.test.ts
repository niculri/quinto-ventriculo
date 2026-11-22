// Tests the rules of the SVG charts: sizes and defaults, titles, ticks, colors, legends and the guard against NaN.
import { describe, expect, it } from 'vitest';
import { drawChart } from '../charts';
import { ChartSpec } from '../chartSpecs';

const draw = (spec: object) => drawChart(ChartSpec.parse(spec));
const count = (svg: string, pattern: RegExp) => (svg.match(pattern) ?? []).length;
const attr = (svg: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(svg)?.[1];

const bars = { tipo: 'barras', categorias: ['A', 'B'], valores: [1, 2], y_max: 4, y_paso: 2 };
const histogram = {
  tipo: 'histograma',
  barras: [
    [0, 5, 3],
    [5, 10, 9],
  ],
  x: [0, 10],
  y_max: 6,
  y_paso: 3,
  x_paso: 5,
};
const lines = {
  tipo: 'lineas',
  series: [
    {
      puntos: [
        [0, 0],
        [1, 1],
        [2, 4],
      ],
    },
  ],
  x: [0, 2],
  y: [0, 4],
};

describe('what every chart shares', () => {
  it('the size is the chart’s own default, or the one asked for; a zero size is not a size', () => {
    expect(attr(draw(bars), 'viewBox')).toBe('0 0 330 250');
    expect(attr(draw({ ...bars, ancho: 400, alto: 300 }), 'viewBox')).toBe('0 0 400 300');
    expect(attr(draw({ ...bars, ancho: 0, alto: 0 }), 'viewBox')).toBe('0 0 330 250');
    expect(attr(draw(histogram), 'viewBox')).toBe('0 0 306 232');
    expect(attr(draw(lines), 'viewBox')).toBe('0 0 330 240');
  });

  it('the accessible name is the label, else the title, else a default for the kind; text is escaped', () => {
    expect(attr(draw({ ...bars, etiqueta: 'Etiqueta', titulo: 'Título' }), 'aria-label')).toBe(
      'Etiqueta',
    );
    expect(attr(draw({ ...bars, titulo: 'T <1> & "2"' }), 'aria-label')).toBe(
      'T &lt;1&gt; &amp; &quot;2&quot;',
    );
    expect(attr(draw({ ...bars, etiqueta: '' }), 'aria-label')).toBe('Gráfico de barras');
    expect(attr(draw(histogram), 'aria-label')).toBe('Histograma');
    expect(attr(draw(lines), 'aria-label')).toBe('Gráfico de líneas');
  });

  it('a title is drawn and moves the plot down; without it, nothing is drawn at the top', () => {
    const plain = draw(bars);
    const titled = draw({ ...bars, titulo: 'Mi título' });
    expect(plain).not.toContain('font-size="12.5"');
    expect(titled).toContain('>Mi título</text>');
    const topOfFirstBar = (svg: string) => Number(/<rect x="[^"]+" y="([^"]+)"/.exec(svg)![1]);
    expect(topOfFirstBar(titled)).toBeGreaterThan(topOfFirstBar(plain));
  });

  it('the title of every kind of chart is drawn, centered over the plot', () => {
    for (const spec of [histogram, lines, bars]) {
      const svg = draw({ ...spec, titulo: 'Un título' });
      expect(svg).toMatch(/<text x="[\d.]+" y="14" text-anchor="middle"[^>]*>Un título<\/text>/);
      expect(draw(spec)).not.toContain('Un título');
    }
  });

  it('axis labels are drawn only when given, the vertical one rotated', () => {
    expect(draw(bars)).not.toContain('rotate(-90)');
    const labeled = draw({ ...bars, x_rotulo: 'Grupos', y_rotulo: 'Casos' });
    expect(labeled).toContain('>Grupos</text>');
    expect(labeled).toMatch(/rotate\(-90\)[^>]*>Casos<\/text>/);
  });

  it('a color is a number of the page’s palette or a ready value; empty is the first of the palette', () => {
    expect(draw({ ...bars, color: 3 })).toContain('fill="var(--g3)"');
    expect(draw({ ...bars, color: '#ff0000' })).toContain('fill="#ff0000"');
    expect(draw({ ...bars, color: '' })).toContain('fill="var(--g1)"');
    expect(draw(bars)).toContain('fill="var(--g1)"');
  });

  it('a value that is not a number never reaches the page', () => {
    expect(() => draw({ ...bars, valores: [1] })).toThrow(/hay valores que no son números/);
    expect(() => draw({ ...histogram, x: [5, 5] })).toThrow(/valores que no son números/);
  });
});

describe('ticks', () => {
  it('a step draws a line every step up to the end, the end included, and no step draws none', () => {
    expect(count(draw(bars), /stroke="var\(--line2\)"/g)).toBe(3);
    expect(count(draw({ ...bars, y_paso: 0 }), /stroke="var\(--line2\)"/g)).toBe(0);
    expect(count(draw({ ...bars, y_paso: -1 }), /stroke="var\(--line2\)"/g)).toBe(0);
    expect(
      count(draw({ ...bars, y_max: 1, y_paso: 0.5, valores: [0, 1] }), /stroke="var\(--line2\)"/g),
    ).toBe(3);
  });

  it('a step that would never end is cut after 500 ticks', () => {
    expect(
      count(
        draw({ ...bars, y_max: 100000, y_paso: 1, valores: [1, 2] }),
        /stroke="var\(--line2\)"/g,
      ),
    ).toBe(500);
  });

  it('numbers are written with a decimal comma and no rounding noise', () => {
    const svg = draw({ ...bars, y_max: 0.3, y_paso: 0.1, valores: [0.1, 0.25] });
    expect(svg).toContain('>0,3</text>');
    expect(svg).toContain('>0,25</text>');
    expect(svg).not.toContain('0.30000000000000004');
  });
});

describe('histogram', () => {
  it('marks given by hand win over the step, and a bar above the top is cut at it', () => {
    const marks = draw({ ...histogram, x_marcas: [2, 8] });
    expect(marks).toContain('>2</text>');
    expect(marks).toContain('>8</text>');
    expect(marks).not.toContain('>5</text>');
    const tall = draw({ ...histogram, barras: [[0, 10, 60]] });
    const rect = /<rect x="[^"]+" y="([^"]+)" width="[^"]+" height="([^"]+)"/.exec(tall)!;
    const plain = draw({ ...histogram, barras: [[0, 10, 6]] });
    expect(/<rect x="[^"]+" y="([^"]+)"/.exec(plain)![1]).toBe(rect[1]);
  });

  it('draws one rect per bar, the second wider than the first only if its interval is', () => {
    const svg = draw({
      ...histogram,
      barras: [
        [0, 2, 1],
        [2, 10, 1],
      ],
    });
    const widths = [...svg.matchAll(/<rect x="[^"]+" y="[^"]+" width="([^"]+)"/g)].map((m) =>
      Number(m[1]),
    );
    expect(widths).toHaveLength(2);
    expect(widths[1]! / widths[0]!).toBeCloseTo(4, 0);
  });
});

describe('box plot', () => {
  const boxes = {
    tipo: 'cajas',
    y: [0, 10],
    y_paso: 5,
    grupos: [
      { nombre: 'A & B', min: 1, q1: 2, med: 3, q3: 4, max: 5, atipicos: [8, 9] },
      { nombre: 2, min: 0, q1: 1, med: 2, q3: 3, max: 4, color: 4 },
    ],
  };

  it('draws a box per group with its median, whiskers, outliers and escaped name', () => {
    const svg = draw(boxes);
    expect(count(svg, /<circle /g)).toBe(2);
    expect(count(svg, /stroke-width="2.4"/g)).toBe(2);
    expect(svg).toContain('>A &amp; B</text>');
    expect(svg).toContain('>2</text>');
    expect(attr(draw({ ...boxes, titulo: 'Cajas' }), 'aria-label')).toBe('Cajas');
    expect(attr(draw(boxes), 'aria-label')).toBe('Diagrama de cajas');
  });

  it('a group’s own color wins over the chart’s; the box is never wider than 80', () => {
    const svg = draw({ ...boxes, color: 2 });
    expect(svg).toContain('fill="var(--g4)"');
    expect(svg).toContain('fill="var(--g2)"');
    const wide = draw({ ...boxes, ancho: 2000, grupos: [boxes.grupos[1]] });
    expect(attr(/<rect[^>]*stroke="var\(--ink\)"[^>]*>/.exec(wide)![0], 'width')).toBe('80.0');
  });

  it('marks given by hand win over the step', () => {
    const svg = draw({ ...boxes, y_marcas: [7] });
    expect(count(svg, /stroke="var\(--line2\)"/g)).toBe(1);
  });
});

describe('scatter', () => {
  const scatter = {
    tipo: 'dispersion',
    puntos: [
      [1, 1],
      [2, 3],
    ],
    x: [0, 4],
    y: [0, 4],
    x_paso: 2,
    y_paso: 2,
  };

  it('draws a point each, with the default radius or the given one, and a dashed trend line if there is one', () => {
    const plain = draw(scatter);
    expect(count(plain, /<circle /g)).toBe(2);
    expect(plain).toContain('r="2.3"');
    expect(plain).not.toContain('stroke-dasharray');
    const custom = draw({
      ...scatter,
      radio: 5,
      tendencia: [
        [0, 0],
        [4, 4],
      ],
    });
    expect(custom).toContain('r="5"');
    expect(custom).toContain('stroke-dasharray="5 4"');
    expect(attr(plain, 'aria-label')).toBe('Gráfico de dispersión');
  });

  it('marks given by hand win over the steps on both axes', () => {
    const svg = draw({ ...scatter, x_marcas: [1], y_marcas: [1, 3], titulo: 'Puntos' });
    expect(svg).toContain('>1</text>');
    expect(svg).not.toContain('>2</text>');
    expect(count(svg, /text-anchor="end"/g)).toBe(2);
    expect(svg).toContain('>Puntos</text>');
  });
});

describe('bars', () => {
  it('shows the value above each bar unless told not to; a taller bar than the top is cut at it', () => {
    expect(draw(bars)).toContain('font-size="10.5"');
    expect(draw({ ...bars, valores_visibles: false })).not.toContain('font-size="10.5"');
    expect(draw({ ...bars, valores_visibles: true })).toContain('font-size="10.5"');
    const cut = draw({ ...bars, valores: [40, 4] });
    const tops = [...cut.matchAll(/<rect x="[^"]+" y="([^"]+)"/g)].map((m) => m[1]);
    expect(tops[0]).toBe(tops[1]);
  });

  it('escapes the names of the categories and accepts numbers as names', () => {
    const svg = draw({ ...bars, categorias: ['<x>', 7] });
    expect(svg).toContain('>&lt;x&gt;</text>');
    expect(svg).toContain('>7</text>');
  });
});

describe('lines', () => {
  const two = {
    ...lines,
    series: [
      {
        puntos: [
          [0, 0],
          [2, 4],
        ],
        nombre: 'Primera & única',
        discontinua: true,
      },
      {
        puntos: [
          [0, 4],
          [2, 0],
        ],
        color: 'tomato',
      },
    ],
  };

  it('with several series the legend names them and keeps the dash; with one there is no legend', () => {
    const svg = draw(two);
    expect(svg).toContain('>Primera &amp; única</text>');
    expect(count(svg, /stroke-dasharray="6 4"/g)).toBe(2);
    expect(svg).toContain('stroke="var(--g1)"');
    expect(svg).toContain('stroke="tomato"');
    expect(draw(lines)).not.toContain('font-size="11.5"');
    expect(
      count(
        draw({ ...lines, series: [{ ...lines.series[0], discontinua: true }] }),
        /stroke-dasharray="6 4"/g,
      ),
    ).toBe(1);
  });

  it('the legend sits above the plot, and under the title when there is one', () => {
    const y = (svg: string) =>
      Number(/<line x1="[^"]+" y1="(\d+)"[^>]*stroke-width="2.4"/.exec(svg)![1]);
    expect(y(draw(two))).toBe(12);
    expect(y(draw({ ...two, titulo: 'Con título' }))).toBe(30);
  });

  it('a stepped series moves horizontally and then vertically; the others go straight; markers only if asked', () => {
    const stepped = /<path d="([^"]+)"/.exec(draw({ ...lines, escalonada: true }))![1]!;
    expect(stepped).toMatch(/^M[\d.]+ [\d.]+H[\d.]+V[\d.]+H[\d.]+V[\d.]+$/);
    const straight = /<path d="([^"]+)"/.exec(draw(lines))![1]!;
    expect(straight).toMatch(/^M[\d.]+ [\d.]+L[\d.]+ [\d.]+L[\d.]+ [\d.]+$/);
    expect(count(draw(lines), /<circle /g)).toBe(0);
    expect(count(draw({ ...lines, marcadores: true }), /<circle /g)).toBe(3);
  });

  it('marks by hand win over the steps and the title names the chart', () => {
    const svg = draw({
      ...lines,
      titulo: 'Curva',
      x_marcas: [1],
      y_marcas: [2],
      x_paso: 1,
      y_paso: 1,
    });
    expect(count(svg, /stroke="var\(--line2\)"/g)).toBe(1);
    expect(attr(svg, 'aria-label')).toBe('Curva');
  });
});
