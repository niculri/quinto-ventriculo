// The quick search's state: the text, the selected result, and the keys that move and open (counting the search).
import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { useApi } from '../../../shared/hooks/useApi';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { countSearch } from '../../usage/count';
import { resultLink, searchContext } from '../model/results';
import { useSearch } from './useSearch';

export function usePalette(close: () => void) {
  const [text, setText] = useState('');
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const catalog = useCatalog().data;
  const { pathname } = useLocation();
  const api = useApi();
  const { results, active, isFetching, query } = useSearch(text, 8);
  const go = (to: string) => {
    countSearch(api, text, searchContext(pathname));
    close();
    void navigate(to);
  };
  const seeAll = paths.search(text);
  const typed = text.trim().length >= 2;
  // Not «nothing» while the debounced query has not caught up with the text.
  const noResults = active && query === text.trim() && !isFetching && results.length === 0;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => Math.max(0, Math.min(i + 1, results.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && text.trim()) {
      e.preventDefault();
      const r = results[selected];
      go(r ? resultLink(r, catalog) : seeAll);
    }
  };
  const type = (value: string) => {
    setText(value);
    setSelected(0);
  };
  return {
    text,
    type,
    selected,
    setSelected,
    results,
    isFetching,
    query,
    typed,
    noResults,
    catalog,
    go,
    seeAll,
    onKeyDown,
  };
}
