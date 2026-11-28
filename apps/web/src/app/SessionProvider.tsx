// Follows the auth service: signs out accounts outside the allowed domain, and gives the page the session.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isAllowedEmail } from '@qv/schema';
import { paths } from '../shared/lib/paths';
import { useSessionService } from '../features/session/api/context';
import { forgetAccounts } from '../features/account/api/remembered';
import { forgetAcceptance } from '../features/account/api/acceptanceMark';
import { DOMAIN_NOTICE } from '../features/session/model/notices';
import { SessionContext } from '../features/session/context';
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
        forgetAcceptance();
        setState((prev) => ({
          status: 'signed-out',
          notice: prev.status === 'signed-out' ? prev.notice : null,
        }));
        return;
      }
      if (!isAllowedEmail(s.user.email)) {
        await session.signOut();
        setState({ status: 'signed-out', notice: DOMAIN_NOTICE });
        return;
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

  const signIn = (next = paths.home) => session.signInWithGoogle(next);
  const signInWithIdToken = (idToken: string, nonce: string) =>
    session.signInWithIdToken(idToken, nonce);
  const signOut = async () => {
    await session.signOut();
    queryClient.clear();
  };

  const value = { state, signIn, signInWithIdToken, signOut };
  return <SessionContext value={value}>{children}</SessionContext>;
}
