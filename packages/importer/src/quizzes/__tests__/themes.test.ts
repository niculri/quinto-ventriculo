// Tests the palettes of a test: the named ones and a custom one that only says what differs from «azul».
import { describe, expect, it } from 'vitest';
import { QUIZ_THEMES, customTheme } from '../themes';

describe('customTheme', () => {
  it('only the tokens named change, in the mode they are named for; the rest is «azul»', () => {
    const t = customTheme({ claro: { ac: '#111111' }, oscuro: { g2: '#222222' } });
    expect(t.light).toEqual({ ...QUIZ_THEMES.azul!.light, ac: '#111111' });
    expect(t.dark).toEqual({ ...QUIZ_THEMES.azul!.dark, g2: '#222222' });
  });

  it('anything that is not an object, in the theme or in a mode, is as if it were empty', () => {
    expect(customTheme(null)).toEqual(QUIZ_THEMES.azul);
    expect(customTheme([1])).toEqual(QUIZ_THEMES.azul);
    expect(customTheme({ claro: 'rojo', oscuro: [] })).toEqual(QUIZ_THEMES.azul);
  });

  it('does not alter the palette of «azul» it starts from', () => {
    customTheme({ claro: { ac: '#111111' } });
    expect(QUIZ_THEMES.azul!.light.ac).toBe('#2E5C7E');
  });
});
