// How long an article's lines of text are: 70 letters by default; `?measure=65|75|full` shows the others, to compare.
import { COLUMN_PX } from './figures';

/** In px of the 17 px Inter, about 8.5 px a letter in the articles; `full` is the whole column. */
export const MEASURES = { '65': 552, '70': 596, '75': 640, full: COLUMN_PX } as const;
export type Measure = keyof typeof MEASURES;
export const DEFAULT_MEASURE: Measure = '70';

const isMeasure = (value: string): value is Measure => Object.hasOwn(MEASURES, value);

export function measureOf(search: string): Measure {
  const value = new URLSearchParams(search).get('measure') ?? '';
  return isMeasure(value) ? value : DEFAULT_MEASURE;
}
