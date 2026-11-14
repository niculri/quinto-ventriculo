// The light, dark or system theme: saved in localStorage and applied as the `dark` class on <html>, with the same rule
// as public/theme.js.
export type Theme = 'system' | 'light' | 'dark';

const KEY = 'qv-theme';

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: Theme): void {
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // No storage (private browsing): the theme lasts until reload.
  }
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}
