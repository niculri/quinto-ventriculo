// A test's chart colors for light and dark, as the custom properties its page sets (--t-<token>-l and -d).
import type { CSSProperties } from 'react';
import { QUIZ_THEME_TOKENS } from '@qv/schema';
import type { QuizDetail } from '@qv/schema';

export function themeStyle(quiz: QuizDetail): CSSProperties {
  const style: Record<string, string> = {};
  for (const t of QUIZ_THEME_TOKENS) {
    style[`--t-${t}-l`] = quiz.theme.light[t] ?? '';
    style[`--t-${t}-d`] = quiz.theme.dark[t] ?? '';
  }
  return style;
}
