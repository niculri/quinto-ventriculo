// Tests the Supabase session service over a fake auth client: what of Google's account the session keeps, following
// the changes, and signing in with Google only for the allowed domain.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { ALLOWED_DOMAIN } from '@qv/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { supabaseSessionService } from '../service';

interface FakeAuthUser {
  id: string;
  email?: string | undefined;
  user_metadata: Record<string, unknown>;
  created_at?: unknown;
  last_sign_in_at?: unknown;
}

function fakeAuth(over: { oauthError?: Error } = {}) {
  let session: { access_token: string; user: FakeAuthUser } | null = null;
  let listener: ((event: string, s: typeof session) => void) | null = null;
  const unsubscribe = vi.fn();
  const auth = {
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: (f: NonNullable<typeof listener>) => {
      listener = f;
      return { data: { subscription: { unsubscribe } } };
    },
    signInWithOAuth: vi.fn(async () => ({ error: over.oauthError ?? null })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  return {
    client: { auth } as unknown as SupabaseClient<Database>,
    auth,
    unsubscribe,
    set: (s: typeof session) => (session = s),
    emit: (s: typeof session) => listener?.('SIGNED_IN', s),
  };
}

const user = (over: Partial<FakeAuthUser> = {}): FakeAuthUser => ({
  id: 'u1',
  email: 'ana@example.test',
  user_metadata: {},
  created_at: '2026-10-31T13:00:00Z',
  last_sign_in_at: '2026-11-01T12:30:00Z',
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe('the session', () => {
  it('none without one', async () => {
    expect(await supabaseSessionService(fakeAuth().client).current()).toBeNull();
  });

  it('keeps the token and the account, with the full name and the avatar first', async () => {
    const f = fakeAuth();
    f.set({
      access_token: 't1',
      user: user({
        user_metadata: {
          full_name: 'Ana Pérez',
          name: 'Ana',
          avatar_url: 'https://a/1',
          picture: 'https://a/2',
        },
      }),
    });
    expect(await supabaseSessionService(f.client).current()).toEqual({
      token: 't1',
      user: {
        id: 'u1',
        email: 'ana@example.test',
        name: 'Ana Pérez',
        avatar: 'https://a/1',
        createdAt: '2026-10-31T13:00:00Z',
        lastSeenAt: '2026-11-01T12:30:00Z',
      },
    });
  });

  it('falls back to the short name and the picture; empty or not text is nothing', async () => {
    const f = fakeAuth();
    f.set({
      access_token: 't1',
      user: user({
        user_metadata: { full_name: '', name: 'Ana', avatar_url: 7, picture: 'https://a/2' },
      }),
    });
    const s = await supabaseSessionService(f.client).current();
    expect(s?.user).toMatchObject({ name: 'Ana', avatar: 'https://a/2' });
    f.set({
      access_token: 't1',
      user: user({
        email: undefined,
        user_metadata: { name: null },
        created_at: 0,
        last_sign_in_at: '',
      }),
    });
    expect((await supabaseSessionService(f.client).current())?.user).toEqual({
      id: 'u1',
      email: '',
      name: null,
      avatar: null,
      createdAt: null,
      lastSeenAt: null,
    });
  });

  it('the last use is the renewal of its token when it came after the last sign-in', async () => {
    const f = fakeAuth();
    const claims = btoa(JSON.stringify({ iat: Date.parse('2026-11-23T14:05:00Z') / 1000 }));
    f.set({ access_token: `header.${claims.replace(/=+$/, '')}.signature`, user: user() });
    expect((await supabaseSessionService(f.client).current())?.user.lastSeenAt).toBe(
      '2026-11-23T14:05:00.000Z',
    );
  });

  it('follows its changes as sessions of the site, and stops when unsubscribed', () => {
    const f = fakeAuth();
    const seen: unknown[] = [];
    const off = supabaseSessionService(f.client).subscribe((s) => seen.push(s?.token ?? null));
    f.emit({ access_token: 't2', user: user() });
    f.emit(null);
    expect(seen).toEqual(['t2', null]);
    off();
    expect(f.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('signing in and out', () => {
  it('remembers where to go on, and asks Google for an account of the domain back at the callback', async () => {
    const f = fakeAuth();
    await supabaseSessionService(f.client).signInWithGoogle('/semesters/2');
    expect(window.sessionStorage.getItem('qv-next')).toBe('/semesters/2');
    expect(f.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: ALLOWED_DOMAIN, prompt: 'select_account' },
      },
    });
  });

  it('a browser that refuses the storage still signs in (going back home after)', async () => {
    const f = fakeAuth();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    await supabaseSessionService(f.client).signInWithGoogle('/x');
    expect(f.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
  });

  it('a refusal of the sign-in is thrown', async () => {
    const f = fakeAuth({ oauthError: new Error('provider disabled') });
    await expect(supabaseSessionService(f.client).signInWithGoogle('/x')).rejects.toThrow(
      'provider disabled',
    );
  });

  it('signing out signs out of Supabase', async () => {
    const f = fakeAuth();
    await supabaseSessionService(f.client).signOut();
    expect(f.auth.signOut).toHaveBeenCalledTimes(1);
  });
});
