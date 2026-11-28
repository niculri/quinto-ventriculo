// «Errores»'s list from the API, for the period chosen; the one shown stays while the other one comes.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ClientErrorPeriod } from '@qv/schema';
import { useApi } from '../../../shared/hooks/useApi';
import { clientErrorsQuery } from '../api/queries';

export function useClientErrors(days: ClientErrorPeriod) {
  const api = useApi();
  return useQuery({ ...clientErrorsQuery(api, days), placeholderData: keepPreviousData });
}
