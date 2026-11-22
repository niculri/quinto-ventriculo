// Tests the session the page reads: it needs its provider, and the signed-in user only exists with a session.
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionContext, useSession, useUser } from '../context';
import type { SessionState } from '../context';

afterEach(() => vi.restoreAllMocks());

const within = (state: SessionState) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SessionContext
        value={{ state, signIn: async () => undefined, signOut: async () => undefined }}
      >
        {children}
      </SessionContext>
    );
  };

describe('the session hooks', () => {
  it('outside the provider the session is a mistake of the code, said at once', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useSession())).toThrow('useSession outside <SessionProvider>');
  });

  it('the user only while signed in', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const state of [{ status: 'loading' }, { status: 'signed-out', notice: null }] as const) {
      expect(() => renderHook(() => useUser(), { wrapper: within(state) })).toThrow(
        'useUser without a session',
      );
    }
    const user = {
      id: 'u1',
      email: 'ana@example.test',
      name: null,
      avatar: null,
      createdAt: null,
      lastSignInAt: null,
    };
    const { result } = renderHook(() => useUser(), {
      wrapper: within({ status: 'signed-in', user }),
    });
    expect(result.current).toBe(user);
  });
});
