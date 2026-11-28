// The light, dark or system theme: light unless another was chosen, saved in localStorage and applied as the `dark`
// class on <html>, with the same rule as public/theme.js.
import { storageKeys } from './storage';
export type Theme = 'system' | 'light' | 'dark';

const KEY = storageKeys.theme;

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'dark' || t === 'system' ? t : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme): void {
  try {
    if (theme === 'light') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // No storage (private browsing): the theme lasts until reload.
  }
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}
