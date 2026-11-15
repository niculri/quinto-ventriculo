// The cards page's search box: its text follows the URL's, and what is typed goes to the URL a moment after typing
// stops.

import { useEffect, useState } from 'react';

export function useQueryBox(query: string, onQuery: (q: string) => void) {
  const [text, setText] = useState(query);
  const [shown, setShown] = useState(query);
  if (shown !== query) {
    setShown(query);
    setText(query);
  }
  useEffect(() => {
    if (text.trim() === query.trim()) return;
    const id = setTimeout(() => onQuery(text.trim()), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return [text, setText] as const;
}
