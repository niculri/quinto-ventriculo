// The tab's title while a page is open: «<title> · El Quinto Ventrículo», and the site's name again when it closes.
import { useEffect } from 'react';
import { sharedStrings } from '../strings/shared.strings';

/** With `null` (the page is still loading, or what it shows instead names the tab itself) the tab is left alone. */
export function useTitle(title: string | null) {
  useEffect(() => {
    if (title === null) return;
    document.title = sharedStrings.pageTitle(title);
    return () => {
      document.title = sharedStrings.siteName;
    };
  }, [title]);
}
