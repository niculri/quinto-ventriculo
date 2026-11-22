// A test's chart colors for light and dark, as the custom properties its page sets (--t-<token>-l and -d).
import type { CSSProperties } from 'react';
import { QUIZ_THEME_TOKENS } from '@qv/schema';
import type { QuizDetail } from '@qv/schema';

type QuizToken = (typeof QUIZ_THEME_TOKENS)[number];

/** A token the stored theme lacks is an empty value. */
const colorOf = (colors: Partial<QuizDetail['theme']['light']>, token: QuizToken) =>
  colors[token] ?? '';

export function themeStyle(quiz: QuizDetail): CSSProperties {
  const style: Record<string, string> = {};
  for (const t of QUIZ_THEME_TOKENS) {
    style[`--t-${t}-l`] = colorOf(quiz.theme.light, t);
    style[`--t-${t}-d`] = colorOf(quiz.theme.dark, t);
  }
  return style;
}
