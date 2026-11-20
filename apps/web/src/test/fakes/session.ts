// A session service with a fixed student, that remembers who asked to sign in.
import type { Session, SessionService } from '../../features/session/api/service';

export function fakeSession(initial: Session | null): SessionService & { signIns: string[] } {
  let current = initial;
  const listeners = new Set<(s: Session | null) => void>();
  const signIns: string[] = [];
  return {
    signIns,
    current: async () => current,
    subscribe: (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    signInWithGoogle: async (next) => {
      signIns.push(next);
    },
    signOut: async () => {
      current = null;
      listeners.forEach((f) => f(null));
    },
  };
}
