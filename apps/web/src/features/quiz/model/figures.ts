// How a question's figures are laid out: the caption they share, a photo's height and the width of a figure beside.
import type { CSSProperties } from 'react';
import type { QuizFigure } from '@qv/schema';

/** The caption of all the figures when there are several and they all have the same one; '' otherwise. */
export function commonCaption(figures: QuizFigure[]): string {
  return figures.length > 1 && figures.every((f) => f.caption && f.caption === figures[0]!.caption)
    ? figures[0]!.caption!
    : '';
}

export function shownHeight(f: Extract<QuizFigure, { kind: 'image' }>): number {
  return f.displayWidth ? Math.round((f.height / f.width) * f.displayWidth) : f.height;
}

export function besideStyle(figures: QuizFigure[]): CSSProperties | undefined {
  const w = figures[0]?.displayWidth;
  return w ? ({ '--fw': `min(${w}px, 58%)` } as CSSProperties) : undefined;
}
