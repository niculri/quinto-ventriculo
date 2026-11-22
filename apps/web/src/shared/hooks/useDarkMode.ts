// Whether the site is in its dark theme now (the `dark` class of <html>), following every change.
import { useSyncExternalStore } from 'react';

const isDark = () => document.documentElement.classList.contains('dark');

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

export function useDarkMode(): boolean {
  return useSyncExternalStore(subscribe, isDark);
}
