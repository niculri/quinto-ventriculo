// The cards page's search box: its text follows the URL's, and what is typed goes to the URL a moment after typing
// stops.

import { useEffect, useEffectEvent, useState } from 'react';

export function useQueryBox(query: string, onQuery: (q: string) => void) {
  const [text, setText] = useState(query);
  const [shown, setShown] = useState(query);
  if (shown !== query) {
    setShown(query);
    setText(query);
  }
  // Reads the URL's query and `onQuery` of the render that changed the text, without the effect following them.
  const searchSoon = useEffectEvent((typed: string) => {
    if (typed === query.trim()) return undefined;
    const id = setTimeout(() => onQuery(typed), 250);
    return () => clearTimeout(id);
  });
  useEffect(() => searchSoon(text.trim()), [text]);
  return [text, setText] as const;
}
