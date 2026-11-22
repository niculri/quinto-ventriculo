// Turns the figures of a question into the published ones: charts and raw SVGs sanitized, images processed.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sanitizeSvg } from '@qv/html/sanitize';
import type { QuizFigure } from '@qv/schema';
import { ImportError } from '../ImportError';
import type { ProcessedImage } from '../media/images';
import { drawChart } from './charts';
import type { FigureSpec } from './chartSpecs';
import { textOk } from './inline';

export type QuizImageProcessor = (data: Uint8Array) => Promise<ProcessedImage>;

/** What converting a test needs to keep: its images and warnings, and the images it already processed. */
export interface QuizState {
  slug: string;
  folder: string;
  processImage: QuizImageProcessor;
  media: Map<string, ProcessedImage>;
  warnings: string[];
  images: Map<string, ProcessedImage>;
  /** The questions whose id would be their place in the group. */
  positional: string[];
}

export const where = (state: QuizState, message: string) => `${state.slug}: ${message}`;

async function imageFigure(state: QuizState, f: FigureSpec & { tipo: 'imagen' }, at: string) {
  const { src } = f;
  let img = state.images.get(src);
  if (!img) {
    const data = src.startsWith('data:')
      ? Buffer.from(src.slice(src.indexOf(',') + 1), 'base64')
      : await readFile(resolve(state.folder, src)).catch(() => {
          throw new ImportError('material', where(state, `${at}: no existe la imagen ${src}`));
        });
    img = await state.processImage(data);
    state.images.set(src, img);
  }
  state.media.set(img.key, img);
  return img;
}

function drawn(state: QuizState, f: Exclude<FigureSpec, { tipo: 'imagen' | 'svg' }>, at: string) {
  try {
    return drawChart(f);
  } catch (e) {
    throw new ImportError(
      'material',
      where(state, `${at}: no se pudo dibujar el gráfico «${f.tipo}» (${(e as Error).message})`),
      { cause: e },
    );
  }
}

export async function convertFigure(
  state: QuizState,
  f: FigureSpec,
  at: string,
): Promise<QuizFigure> {
  const caption = textOk(f.pie) ? f.pie : undefined;
  const displayWidth = typeof f.ancho === 'number' && f.ancho > 0 ? f.ancho : undefined;
  if (f.tipo === 'imagen') {
    const img = await imageFigure(state, f, at);
    return {
      kind: 'image',
      media: img.key,
      width: img.width,
      height: img.height,
      alt: typeof f.alt === 'string' ? f.alt : '',
      ...(displayWidth ? { displayWidth } : {}),
      ...(caption ? { caption } : {}),
    };
  }
  const raw = f.tipo === 'svg' ? f.svg : drawn(state, f, at);
  const { svg, dropped } = sanitizeSvg(raw);
  for (const d of dropped) state.warnings.push(where(state, `${at}: figura SVG con ${d}`));
  return {
    kind: 'svg',
    svg,
    ...(displayWidth ? { displayWidth } : {}),
    ...(caption ? { caption } : {}),
  };
}
