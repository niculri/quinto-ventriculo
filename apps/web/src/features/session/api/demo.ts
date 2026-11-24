// Fake session of the demo mode: only the demo API that Vite mounts accepts its token; the Worker rejects it.
import { z } from 'zod';
import type { Session, SessionService } from './service';
import { settle } from '../../../shared/lib/settle';
import { storageKeys } from '../../../shared/lib/storage';
import { sha256Hex } from '../model/nonce';

export const DEMO_EMAIL = 'demo@ug.uchile.cl';

const DEMO_SESSION: Session = {
  token: 'demo-local',
  user: {
    id: '00000000-0000-4000-8000-0000000000de',
    email: DEMO_EMAIL,
    name: 'Estudiante de prueba',
    avatar: null,
    createdAt: '2026-10-31T13:00:00.000Z',
    lastSeenAt: '2026-11-01T12:30:00.000Z',
  },
};

const KEY = storageKeys.demo.session;

const Claims = z.object({ nonce: z.string() });

function demoClaims(idToken: string): { nonce: string } | null {
  try {
    const payload = idToken.split('.')[1] ?? '';
    const parsed = Claims.safeParse(
      JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

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
  const enter = () => {
    localStorage.setItem(KEY, '1');
    notify();
  };
  return {
    current: () => Promise.resolve(read()),
    subscribe(f) {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    signInWithGoogle: () => settle(enter),
    // Checks the nonce as Supabase Auth does: the token carries the SHA-256 of the raw value.
    async signInWithIdToken(idToken, nonce) {
      const claims = demoClaims(idToken);
      if (claims?.nonce !== (await sha256Hex(nonce))) throw new Error('Nonces mismatch');
      enter();
    },
    signOut: () =>
      settle(() => {
        localStorage.removeItem(KEY);
        notify();
      }),
  };
}
