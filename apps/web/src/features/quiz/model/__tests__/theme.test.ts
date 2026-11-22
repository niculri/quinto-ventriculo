// Tests the custom properties of a test's chart colors for light and dark.
import { describe, expect, it } from 'vitest';
import { QUIZ_THEME_TOKENS } from '@qv/schema';
import type { QuizDetail } from '@qv/schema';
import { QUIZ } from '../../../../test/fixtures/quiz';
import { themeStyle } from '../theme';

describe('themeStyle', () => {
  it('each token gives a light and a dark property, empty for a color the theme lacks', () => {
    const theme = { light: { ac: '#111' }, dark: { g1: '#222' } } as unknown as QuizDetail['theme'];
    const style = themeStyle({ ...QUIZ, theme }) as Record<string, string>;
    expect(Object.keys(style)).toHaveLength(QUIZ_THEME_TOKENS.length * 2);
    expect(style['--t-ac-l']).toBe('#111');
    expect(style['--t-ac-d']).toBe('');
    expect(style['--t-g1-l']).toBe('');
    expect(style['--t-g1-d']).toBe('#222');
  });
});
