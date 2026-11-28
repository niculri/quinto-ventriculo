// Tests the theme: light by default, what is saved, what is read back, and when <html> is dark, also without storage.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, readTheme } from '../theme';

const prefersDark = (dark: boolean) =>
  vi
    .spyOn(window, 'matchMedia')
    .mockImplementation(
      (q: string) =>
        ({ matches: dark && q === '(prefers-color-scheme: dark)', media: q }) as MediaQueryList,
    );
const isDark = () => document.documentElement.classList.contains('dark');

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.classList.remove('dark');
});

describe('the theme', () => {
  it('reads what was saved, and light for nothing or anything else', () => {
    expect(readTheme()).toBe('light');
    localStorage.setItem('qv-theme', 'dark');
    expect(readTheme()).toBe('dark');
    localStorage.setItem('qv-theme', 'system');
    expect(readTheme()).toBe('system');
    localStorage.setItem('qv-theme', 'sepia');
    expect(readTheme()).toBe('light');
  });

  it('dark and the system’s are saved and set <html>; light, the default, forgets the choice whatever the system says', () => {
    prefersDark(true);
    applyTheme('dark');
    expect(localStorage.getItem('qv-theme')).toBe('dark');
    expect(isDark()).toBe(true);
    applyTheme('system');
    expect(localStorage.getItem('qv-theme')).toBe('system');
    expect(isDark()).toBe(true);
    applyTheme('light');
    expect(localStorage.getItem('qv-theme')).toBeNull();
    expect(isDark()).toBe(false);
  });

  it('the system’s is light when the system is', () => {
    prefersDark(false);
    document.documentElement.classList.add('dark');
    applyTheme('system');
    expect(isDark()).toBe(false);
  });

  it('without storage, it still applies the choice, and reads as light', () => {
    prefersDark(true);
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
    }
    applyTheme('dark');
    expect(isDark()).toBe(true);
    applyTheme('light');
    expect(isDark()).toBe(false);
    expect(readTheme()).toBe('light');
  });
});
