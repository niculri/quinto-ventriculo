// The user's account state (accepted terms, a deletion cancelled on entering), read once per page load.
import { useQuery } from '@tanstack/react-query';
import { LEGAL_VERSIONS } from '@qv/schema';
import { useAccountRepository } from './api/context';
import { useUser } from '../session/context';
import { AccountError } from './api/repository';
import type { AccountState } from './api/repository';
import { rememberAccount, rememberedAccount } from './remembered';

export const accountKey = (userId: string) => ['account', userId] as const;

export const acceptedNow = (state: AccountState | undefined) =>
  state?.accepted?.terms === LEGAL_VERSIONS.terms.version &&
  state.accepted.privacy === LEGAL_VERSIONS.privacy.version;

export function useAccount() {
  const account = useAccountRepository();
  const user = useUser();
  return useQuery({
    queryKey: accountKey(user.id),
    queryFn: async () =>
      rememberAccount(
        account,
        user.id,
        await account.resume({
          terms: LEGAL_VERSIONS.terms.version,
          privacy: LEGAL_VERSIONS.privacy.version,
        }),
      ),
    initialData: () => rememberedAccount(account, user.id),
    // Once per page load: entering is what cancels a deletion, and the versions do not change while it is open.
    staleTime: Number.POSITIVE_INFINITY,
    retry: (attempts, e) =>
      !(e instanceof AccountError && e.code === 'session_closed') && attempts < 2,
  });
}
