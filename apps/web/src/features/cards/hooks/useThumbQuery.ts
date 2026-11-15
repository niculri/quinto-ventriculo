// The signature the thumbnails of the cards page's list are asked with, or null while it is on its way.

import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { thumbsQuery } from '../api/queries';

export function useThumbQuery() {
  const api = useApi();
  const q = useQuery(thumbsQuery(api));
  return q.data?.query ?? null;
}
