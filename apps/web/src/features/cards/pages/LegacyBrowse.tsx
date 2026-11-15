// `/anki/browse`, the old browser of every course: to the cards of the course or assessment of its search or of its
// card; with neither, the home page.

import { Navigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { useAnkiTree } from '../../catalog/hooks/useAnkiTree';
import { deckOfSearch, legacyTarget } from '../model/legacy';
import { cardParam } from '../model/urlState';
import { legacyCardQuery } from '../api/queries';

export function LegacyBrowse() {
  const [params] = useSearchParams();
  const { catalog, tree } = useAnkiTree();
  const api = useApi();
  const q = params.get('q') ?? '';
  const note = params.get('note');
  const ord = Number(params.get('ord') ?? '0');
  const byDeck = tree ? deckOfSearch(tree, q) : null;
  const card = useQuery(legacyCardQuery(api, note, ord, !!note && !!tree && !byDeck));
  if (catalog.isError) {
    return <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />;
  }
  if (!tree) return <Loading />;
  const open = note ? cardParam({ noteGuid: note, ord }) : undefined;
  const to = legacyTarget({ tree, byDeck, note, open, card });
  return to === null ? <Loading /> : <Navigate replace to={to} />;
}
