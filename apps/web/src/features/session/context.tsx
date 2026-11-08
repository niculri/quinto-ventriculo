import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isAllowedEmail } from '@qv/schema';
import { paths } from '../../app/paths';
import { useServices } from '../../app/services';
import { forgetAccounts } from '../account/remembered';
import { DOMAIN_NOTICE } from './notices';
import type { SessionUser } from './service';

type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out'; notice: string | null }
  | { status: 'signed-in'; user: SessionUser };

interface SessionValue {
  state: SessionState;
  signIn(next?: string): Promise<void>;
  signOut(): Promise<void>;
}

const Context = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { session } = useServices();
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
        // Double check: the database and the API already reject the account, but the web does not let it in either.
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

export function useSession(): SessionValue {
  const v = useContext(Context);
  if (!v) throw new Error('useSession outside <SessionProvider>');
  return v;
}

/** The session user. Only inside protected routes. */
export function useUser(): SessionUser {
  const { state } = useSession();
  if (state.status !== 'signed-in') throw new Error('useUser without a session');
  return state.user;
}
