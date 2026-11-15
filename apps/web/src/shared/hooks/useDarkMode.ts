// Whether the site is in its dark theme now (the `dark` class of <html>), following every change.
import { useEffect, useState } from 'react';

export function useDarkMode(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const read = () => setDark(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    read();
    return () => observer.disconnect();
  }, []);
  return dark;
}
