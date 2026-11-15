// The tab's title while a page is open: «<title> · El Quinto Ventrículo», and the site's name again when it closes.
import { useEffect } from 'react';

export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · El Quinto Ventrículo`;
    return () => {
      document.title = 'El Quinto Ventrículo';
    };
  }, [title]);
}
