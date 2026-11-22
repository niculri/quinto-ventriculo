// Tests the theme: what is saved, what is read back, and when <html> is dark, also without storage.
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
  it('reads what was saved, and the system’s for nothing or anything else', () => {
    expect(readTheme()).toBe('system');
    localStorage.setItem('qv-theme', 'dark');
    expect(readTheme()).toBe('dark');
    localStorage.setItem('qv-theme', 'light');
    expect(readTheme()).toBe('light');
    localStorage.setItem('qv-theme', 'sepia');
    expect(readTheme()).toBe('system');
  });

  it('light and dark are saved and set <html> whatever the system says; the system’s forgets the choice', () => {
    prefersDark(true);
    applyTheme('light');
    expect(localStorage.getItem('qv-theme')).toBe('light');
    expect(isDark()).toBe(false);
    applyTheme('dark');
    expect(localStorage.getItem('qv-theme')).toBe('dark');
    expect(isDark()).toBe(true);
    applyTheme('system');
    expect(localStorage.getItem('qv-theme')).toBeNull();
    expect(isDark()).toBe(true);
  });

  it('the system’s is light when the system is', () => {
    prefersDark(false);
    document.documentElement.classList.add('dark');
    applyTheme('system');
    expect(isDark()).toBe(false);
  });

  it('without storage, it still applies the choice, and reads as the system’s', () => {
    prefersDark(false);
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
    }
    applyTheme('dark');
    expect(isDark()).toBe(true);
    applyTheme('system');
    expect(isDark()).toBe(false);
    expect(readTheme()).toBe('system');
  });
});
