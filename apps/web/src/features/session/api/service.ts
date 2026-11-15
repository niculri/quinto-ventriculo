// The authentication service the web uses, and its Supabase implementation (Google sign-in).
import type { Session as SupabaseSession, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { ALLOWED_DOMAIN } from '@qv/schema';
import { storageKeys } from '../../../shared/lib/storage';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
}

export interface Session {
  token: string;
  user: SessionUser;
}

export interface SessionService {
  current(): Promise<Session | null>;
  subscribe(onChange: (s: Session | null) => void): () => void;
  signInWithGoogle(next: string): Promise<void>;
  signOut(): Promise<void>;
}

function toSession(s: SupabaseSession | null): Session | null {
  if (!s) return null;
  // Auth's metadata is typed `any`: read as `unknown`, each field is checked before use.
  const m: Record<string, unknown> = s.user.user_metadata;
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

export function supabaseSessionService(client: SupabaseClient<Database>): SessionService {
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
        sessionStorage.setItem(storageKeys.signInNext, next);
      } catch {
        // goes back home
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
