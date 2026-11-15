// «Uso»'s figures from the API.
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { usageQuery } from '../api/queries';

export function useUsageReport() {
  const api = useApi();
  return useQuery(usageQuery(api));
}
