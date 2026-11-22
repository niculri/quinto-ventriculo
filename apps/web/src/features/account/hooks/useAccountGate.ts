// What the popups on entering need: the account state, accepting the terms in force, telling a cancelled deletion,
// and noticing that the Worker asks for versions this page does not know.
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { LEGAL_VERSIONS } from '@qv/schema';
import { ErrorCode } from '@qv/schema/http';
import { ApiRequestError } from '../../../shared/lib/api';
import { paths } from '../../../shared/lib/paths';
import { useSession, useUser } from '../../session/context';
import { useAccountRepository } from '../api/context';
import { AccountError } from '../api/repository';
import type { AccountState } from '../api/repository';
import { accountKeys } from '../api/queries';
import { rememberAccount } from '../api/remembered';
import { acceptedNow } from '../model/accepted';
import { useAccount } from './useAccount';

export function useAccountGate() {
  const account = useAccountRepository();
  const user = useUser();
  const { signOut } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const state = useAccount();
  const [staleBundle, setStaleBundle] = useState(false);

  const accept = useMutation({
    mutationFn: () =>
      account.accept({
        terms: LEGAL_VERSIONS.terms.version,
        privacy: LEGAL_VERSIONS.privacy.version,
      }),
    onSuccess: ({ acceptedAt }) => {
      queryClient.setQueryData<AccountState>(accountKeys.user(user.id), () =>
        rememberAccount(account, user.id, {
          deletionCancelled: false,
          accepted: {
            terms: LEGAL_VERSIONS.terms.version,
            privacy: LEGAL_VERSIONS.privacy.version,
            acceptedAt,
          },
        }),
      );
      // Queries that failed for lack of the acceptance run again.
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== accountKeys.all[0],
      });
    },
  });

  const accepted = acceptedNow(state.data);
  const told = () =>
    queryClient.setQueryData<AccountState>(accountKeys.user(user.id), (prev) =>
      // The notice that calls it only shows with the account state read.
      prev
        ? rememberAccount(account, user.id, { ...prev, deletionCancelled: false })
        : /* v8 ignore next */ prev,
    );
  const { refetch } = state;

  // The Worker asks for versions this page does not know (a new one was published while it was open): reloading
  // brings the new texts. If this page had not accepted yet, it is the popup's case.
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'error') return;
        const e: unknown = event.action.error;
        if (!(e instanceof ApiRequestError) || e.code !== ErrorCode.enum.terms_not_accepted) return;
        if (accepted) setStaleBundle(true);
        else void refetch();
      }),
    [queryClient, accepted, refetch],
  );

  const closed = state.error instanceof AccountError && state.error.code === 'session_closed';
  useEffect(() => {
    if (closed) void signOut();
  }, [closed, signOut]);

  const leave = () => {
    void signOut().then(() => navigate(paths.landing()));
  };
  return { state, accept, accepted, told, closed, staleBundle, pathname, leave };
}
