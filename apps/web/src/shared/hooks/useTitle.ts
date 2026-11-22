// The tab's title while a page is open: «<title> · El Quinto Ventrículo», and the site's name again when it closes.
import { useEffect } from 'react';
import { sharedStrings } from '../strings/shared.strings';

export function useTitle(title: string) {
  useEffect(() => {
    document.title = sharedStrings.pageTitle(title);
    return () => {
      document.title = sharedStrings.siteName;
    };
  }, [title]);
}
