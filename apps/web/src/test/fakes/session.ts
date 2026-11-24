// A session service with a fixed student, that remembers who asked to sign in and with which ID tokens.
import type { Session, SessionService } from '../../features/session/api/service';

export function fakeSession(initial: Session | null): SessionService & {
  signIns: string[];
  idTokens: [string, string][];
  emit: (s: Session | null) => void;
} {
  let current = initial;
  const listeners = new Set<(s: Session | null) => void>();
  const signIns: string[] = [];
  const idTokens: [string, string][] = [];
  const emit = (s: Session | null) => {
    current = s;
    listeners.forEach((f) => f(s));
  };
  return {
    signIns,
    idTokens,
    emit,
    current: async () => current,
    subscribe: (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    signInWithGoogle: async (next) => {
      signIns.push(next);
    },
    signInWithIdToken: async (idToken, nonce) => {
      idTokens.push([idToken, nonce]);
    },
    signOut: async () => emit(null),
  };
}
