import type { Session, SessionService } from './service';

/**
 * Fake session of the demo mode (`npm run dev:demo`). Only the demo API that Vite mounts in development
 * accepts the token; the production Worker rejects it like any invalid token.
 */
/** The demo account's email (it confirms «Eliminar mi cuenta» in the demo). */
export const DEMO_EMAIL = 'demo@ug.uchile.cl';

const DEMO_SESSION: Session = {
  token: 'demo-local',
  user: {
    id: '00000000-0000-4000-8000-0000000000de',
    email: DEMO_EMAIL,
    name: 'Estudiante de prueba',
    avatar: null,
    createdAt: '2026-10-31T13:00:00.000Z',
    lastSignInAt: '2026-11-01T12:30:00.000Z',
  },
};

const KEY = 'qv-demo-session';

export function demoSessionService(): SessionService {
  const listeners = new Set<(s: Session | null) => void>();
  const read = () => {
    try {
      return localStorage.getItem(KEY) === '1' ? DEMO_SESSION : null;
    } catch {
      return null;
    }
  };
  const notify = () => listeners.forEach((f) => f(read()));
  return {
    current: async () => read(),
    subscribe(f) {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    // The landing page sees the new session and moves on to the destination by itself.
    async signInWithGoogle() {
      localStorage.setItem(KEY, '1');
      notify();
    },
    async signOut() {
      localStorage.removeItem(KEY);
      notify();
    },
  };
}
