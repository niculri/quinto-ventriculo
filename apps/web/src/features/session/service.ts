import type { Session as SupabaseSession, SupabaseClient } from '@supabase/supabase-js';
import { ALLOWED_DOMAIN } from '@qv/schema';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  /** When the account was created (ISO), as Supabase Auth says; null if it does not say. */
  createdAt: string | null;
  /** The last sign-in with Google (ISO). */
  lastSignInAt: string | null;
}

export interface Session {
  token: string;
  user: SessionUser;
}

/** Everything the web needs from authentication. There is a Supabase implementation and a demo one. */
export interface SessionService {
  current(): Promise<Session | null>;
  subscribe(onChange: (s: Session | null) => void): () => void;
  /** Goes to Google. On return, the web lands on /auth/callback and from there on `next`. */
  signInWithGoogle(next: string): Promise<void>;
  signOut(): Promise<void>;
}

export const NEXT_KEY = 'qv-next';

function toSession(s: SupabaseSession | null): Session | null {
  if (!s) return null;
  const m = s.user.user_metadata as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    token: s.access_token,
    user: {
      id: s.user.id,
      email: s.user.email ?? '',
      name: text(m['full_name']) ?? text(m['name']),
      avatar: text(m['avatar_url']) ?? text(m['picture']),
      createdAt: text(s.user.created_at),
      lastSignInAt: text(s.user.last_sign_in_at),
    },
  };
}

export function supabaseSessionService(client: SupabaseClient): SessionService {
  return {
    async current() {
      const { data } = await client.auth.getSession();
      return toSession(data.session);
    },
    subscribe(onChange) {
      const { data } = client.auth.onAuthStateChange((_event, s) => onChange(toSession(s)));
      return () => data.subscription.unsubscribe();
    },
    async signInWithGoogle(next) {
      try {
        sessionStorage.setItem(NEXT_KEY, next);
      } catch {
        // without sessionStorage it goes back home
      }
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          // `hd` makes Google show only accounts of the domain; the real rule lives on the server.
          queryParams: { hd: ALLOWED_DOMAIN, prompt: 'select_account' },
        },
      });
      if (error) throw error;
    },
    async signOut() {
      await client.auth.signOut();
    },
  };
}
