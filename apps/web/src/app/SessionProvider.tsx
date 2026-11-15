// Follows the auth service: signs out accounts outside the allowed domain, and gives the page the session.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isAllowedEmail } from '@qv/schema';
import { paths } from '../shared/lib/paths';
import { useSessionService } from '../features/session/api/context';
import { forgetAccounts } from '../features/account/api/remembered';
import { DOMAIN_NOTICE } from '../features/session/notices';
import { Context } from '../features/session/context';
import type { SessionState } from '../features/session/context';

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useSessionService();
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    const apply = async (s: Awaited<ReturnType<typeof session.current>>) => {
      if (!active) return;
      if (!s) {
        forgetAccounts();
        return setState((prev) => ({
          status: 'signed-out',
          notice: prev.status === 'signed-out' ? prev.notice : null,
        }));
      }
      if (!isAllowedEmail(s.user.email)) {
        await session.signOut();
        return setState({ status: 'signed-out', notice: DOMAIN_NOTICE });
      }
      setState({ status: 'signed-in', user: s.user });
    };
    session.current().then(apply, () => apply(null));
    const unsubscribe = session.subscribe((s) => void apply(s));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [session]);

  const signIn = useCallback((next = paths.home) => session.signInWithGoogle(next), [session]);
  const signOut = useCallback(async () => {
    await session.signOut();
    queryClient.clear();
  }, [session, queryClient]);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <Context value={value}>{children}</Context>;
}
