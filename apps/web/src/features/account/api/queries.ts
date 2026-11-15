// The account's state, with its keys: read once per page load, and at once from what this page already knew.
import { queryOptions } from '@tanstack/react-query';
import { LEGAL_VERSIONS } from '@qv/schema';
import { AccountError } from './repository';
import type { AccountRepository } from './repository';
import { rememberAccount, rememberedAccount } from './remembered';

export const accountKeys = {
  all: ['account'] as const,
  user: (userId: string) => ['account', userId] as const,
};

export const accountQuery = (account: AccountRepository, userId: string) =>
  queryOptions({
    queryKey: accountKeys.user(userId),
    queryFn: async () =>
      rememberAccount(
        account,
        userId,
        await account.resume({
          terms: LEGAL_VERSIONS.terms.version,
          privacy: LEGAL_VERSIONS.privacy.version,
        }),
      ),
    initialData: () => rememberedAccount(account, userId),
    // Once per page load: entering is what cancels a deletion, and the versions do not change while it is open.
    staleTime: Number.POSITIVE_INFINITY,
    retry: (attempts, e) =>
      !(e instanceof AccountError && e.code === 'session_closed') && attempts < 2,
  });
