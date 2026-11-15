// The user's account state (accepted terms, a deletion cancelled on entering), read once per page load.
import { useQuery } from '@tanstack/react-query';
import { useAccountRepository } from '../api/context';
import { useUser } from '../../session/context';
import { accountQuery } from '../api/queries';

export function useAccount() {
  const account = useAccountRepository();
  const user = useUser();
  return useQuery(accountQuery(account, user.id));
}
