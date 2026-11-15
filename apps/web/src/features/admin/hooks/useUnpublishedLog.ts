// «Fuera del sitio»'s record from the API.
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { unpublishedQuery } from '../api/queries';

export function useUnpublishedLog() {
  const api = useApi();
  return useQuery(unpublishedQuery(api));
}
