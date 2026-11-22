// The shape of the figures of a test.json: charts drawn by the importer, a raw SVG or an image.
import { z } from 'zod';

const num = z.number();
const pair = z.tuple([num, num]);
const color = z.union([num, z.string()]);

const Plot = {
  titulo: z.string().nullish(),
  etiqueta: z.string().nullish(),
  ancho: num.nullish(),
  alto: num.nullish(),
  x_rotulo: z.string().nullish(),
  y_rotulo: z.string().nullish(),
  color: color.nullish(),
  pie: z.string().nullish(),
};

const Histogram = z.looseObject({
  ...Plot,
  tipo: z.literal('histograma'),
  barras: z.array(z.tuple([num, num, num])),
  x: pair,
  y_max: num,
  y_paso: num,
  x_marcas: z.array(num).nullish(),
  x_paso: num.nullish(),
});

const Box = z.looseObject({
  nombre: z.union([z.string(), num]),
  min: num,
  max: num,
  q1: num,
  q3: num,
  med: num,
  atipicos: z.array(num).nullish(),
  color: color.nullish(),
});

const BoxPlot = z.looseObject({
  ...Plot,
  tipo: z.literal('cajas'),
  grupos: z.array(Box),
  y: pair,
  y_marcas: z.array(num).nullish(),
  y_paso: num.nullish(),
});

const Scatter = z.looseObject({
  ...Plot,
  tipo: z.literal('dispersion'),
  puntos: z.array(pair),
  x: pair,
  y: pair,
  x_marcas: z.array(num).nullish(),
  y_marcas: z.array(num).nullish(),
  x_paso: num.nullish(),
  y_paso: num.nullish(),
  tendencia: z.tuple([pair, pair]).nullish(),
  radio: num.nullish(),
});

const Bars = z.looseObject({
  ...Plot,
  tipo: z.literal('barras'),
  categorias: z.array(z.union([z.string(), num])),
  valores: z.array(num),
  y_max: num,
  y_paso: num,
  valores_visibles: z.boolean().nullish(),
});

const Series = z.looseObject({
  puntos: z.array(pair),
  color: color.nullish(),
  discontinua: z.boolean().nullish(),
  nombre: z.string().nullish(),
});

const Lines = z.looseObject({
  ...Plot,
  tipo: z.literal('lineas'),
  series: z.array(Series),
  x: pair,
  y: pair,
  x_marcas: z.array(num).nullish(),
  y_marcas: z.array(num).nullish(),
  x_paso: num.nullish(),
  y_paso: num.nullish(),
  escalonada: z.boolean().nullish(),
  marcadores: z.boolean().nullish(),
});

const RawSvg = z.looseObject({
  tipo: z.literal('svg'),
  svg: z.string(),
  ancho: num.nullish(),
  pie: z.string().nullish(),
});

const Picture = z.looseObject({
  tipo: z.literal('imagen'),
  src: z.string(),
  alt: z.string().nullish(),
  ancho: num.nullish(),
  pie: z.string().nullish(),
});

export const ChartSpec = z.discriminatedUnion('tipo', [Histogram, BoxPlot, Scatter, Bars, Lines]);
export type ChartSpec = z.infer<typeof ChartSpec>;

export const FigureSpec = z.discriminatedUnion('tipo', [
  Histogram,
  BoxPlot,
  Scatter,
  Bars,
  Lines,
  RawSvg,
  Picture,
]);
export type FigureSpec = z.infer<typeof FigureSpec>;

export type HistogramSpec = z.infer<typeof Histogram>;
export type BoxPlotSpec = z.infer<typeof BoxPlot>;
export type ScatterSpec = z.infer<typeof Scatter>;
export type BarsSpec = z.infer<typeof Bars>;
export type LinesSpec = z.infer<typeof Lines>;

/** The figure types the skill knows, with what each one needs before it can be drawn. */
export const FIGURE_REQUIRED: Record<string, string[]> = {
  histograma: ['barras', 'x', 'y_max', 'y_paso'],
  cajas: ['grupos', 'y'],
  dispersion: ['puntos', 'x', 'y'],
  barras: ['categorias', 'valores', 'y_max', 'y_paso'],
  lineas: ['series', 'x', 'y'],
  svg: ['svg'],
  imagen: ['src'],
};
