// Tests the demo's session: signed out until «entering», remembered in the browser, told to whoever follows it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_EMAIL, demoSessionService } from '../demo';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('the demo session', () => {
  it('starts signed out; signing in gives the demo student and is remembered by another service', async () => {
    const session = demoSessionService();
    expect(await session.current()).toBeNull();
    await session.signInWithGoogle('/home');
    expect((await session.current())?.user.email).toBe(DEMO_EMAIL);
    expect((await demoSessionService().current())?.token).toBe('demo-local');
  });

  it('tells each listener of signing in and out, until it unsubscribes', async () => {
    const session = demoSessionService();
    const seen: (string | null)[] = [];
    const off = session.subscribe((s) => seen.push(s?.user.email ?? null));
    await session.signInWithGoogle('/home');
    await session.signOut();
    off();
    await session.signInWithGoogle('/home');
    expect(seen).toEqual([DEMO_EMAIL, null]);
    expect(await session.current()).not.toBeNull();
  });

  it('a browser that refuses its storage is signed out', async () => {
    window.localStorage.setItem('qv-demo-session', '1');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(await demoSessionService().current()).toBeNull();
  });
});
