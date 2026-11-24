// The session the page reads (its state, signing in and out), given by app/SessionProvider.tsx.
import { createContext, use } from 'react';
import type { SessionUser } from './api/service';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out'; notice: string | null }
  | { status: 'signed-in'; user: SessionUser };

interface SessionValue {
  state: SessionState;
  signIn: (next?: string) => Promise<void>;
  signInWithIdToken: (idToken: string, nonce: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const v = use(SessionContext);
  if (!v) throw new Error('useSession outside <SessionProvider>');
  return v;
}

export function useUser(): SessionUser {
  const { state } = useSession();
  if (state.status !== 'signed-in') throw new Error('useUser without a session');
  return state.user;
}
