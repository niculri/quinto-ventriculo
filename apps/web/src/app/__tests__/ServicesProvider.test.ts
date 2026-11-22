// Tests the composition of the web's services: the Supabase client it makes and what goes with the session's token,
// and the demo's roles and data export; supabase-js gets a fake auth over a fake fetch and the API a fake fetch (no network).
import type * as Supabase from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_HEADERS } from '../../shared/lib/api';
import { createServices } from '../ServicesProvider';

const h = vi.hoisted(() => ({
  made: [] as { url: string; key: string; options: unknown }[],
  session: null as {
    access_token: string;
    user: { id: string; email: string; user_metadata: object };
  } | null,
  dbCalls: [] as string[],
}));

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const real = await importOriginal<typeof Supabase>();
  const { NO_AUTH, usersDbFetch } = await import('../../test/appFakes');
  return {
    ...real,
    createClient: (url: string, key: string, options: unknown) => {
      h.made.push({ url, key, options });
      const { fetch } = usersDbFetch((c) => {
        h.dbCalls.push(c.name);
        return undefined;
      });
      const client = real.createClient(url, key, { ...NO_AUTH, global: { fetch } });
      return Object.assign(client, {
        auth: {
          getSession: async () => ({ data: { session: h.session } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        },
      });
    },
  };
});

interface ApiCall {
  path: string;
  headers: Record<string, string>;
}

function stubApi() {
  const calls: ApiCall[] = [];
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    calls.push({ path: input, headers: init.headers as Record<string, string> });
    const body = input.includes('/anki/card-changes')
      ? { changes: [], next: 0, latest: 0, more: false }
      : {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return calls;
}

beforeEach(() => {
  h.made.length = 0;
  h.dbCalls.length = 0;
  h.session = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('with the users database', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DEMO', '');
    vi.stubEnv('VITE_USERS_SUPABASE_URL', 'https://users.example.test');
    vi.stubEnv('VITE_USERS_SUPABASE_PUBLISHABLE_KEY', 'publishable-test-key');
  });

  it.each([
    ['', 'publishable-test-key'],
    ['https://users.example.test', ''],
  ])('without its URL «%s» or its key «%s» the site does not start', (url, key) => {
    vi.stubEnv('VITE_USERS_SUPABASE_URL', url);
    vi.stubEnv('VITE_USERS_SUPABASE_PUBLISHABLE_KEY', key);
    expect(() => createServices()).toThrow(
      'Faltan VITE_USERS_SUPABASE_URL y VITE_USERS_SUPABASE_PUBLISHABLE_KEY.',
    );
    expect(h.made).toEqual([]);
  });

  it('one client, that keeps the session, refreshes it and takes it from Google’s return (PKCE)', () => {
    createServices();
    expect(h.made).toEqual([
      {
        url: 'https://users.example.test',
        key: 'publishable-test-key',
        options: {
          auth: {
            flowType: 'pkce',
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        },
      },
    ]);
  });

  it('before reading the cards, they follow the content’s changes, asked with the session’s token', async () => {
    const api = stubApi();
    h.session = {
      access_token: 'token-1',
      user: { id: 'u1', email: 'ana@example.test', user_metadata: {} },
    };
    const services = createServices();
    expect(await services.session.current()).toMatchObject({
      token: 'token-1',
      user: { id: 'u1' },
    });
    await services.study.allCards();
    expect(api.map((c) => [c.path, c.headers.Authorization])).toEqual([
      ['/api/anki/card-changes?since=0', 'Bearer token-1'],
    ]);
    expect(h.dbCalls).toEqual(['card_sync', 'card_states']);
  });

  it('signed out, the API is asked without a token, and the sync is for nobody', async () => {
    const api = stubApi();
    const services = createServices();
    await services.study.answeredDecks();
    expect(api).toHaveLength(1);
    expect(api[0]!.headers.Authorization).toBeUndefined();
    expect(h.dbCalls).toEqual(['card_sync', 'answered_decks']);
  });

  it('the admin mode’s API asks for the draft, the site’s does not', async () => {
    const api = stubApi();
    const services = createServices();
    await services.adminApi!.catalog().catch(() => undefined);
    await services.api.catalog().catch(() => undefined);
    const [preview, student] = api;
    for (const [name, value] of Object.entries(PREVIEW_HEADERS)) {
      expect(preview!.headers[name]).toBe(value);
      expect(student!.headers[name]).toBeUndefined();
    }
  });
});

describe('the demo', () => {
  beforeEach(() => vi.stubEnv('VITE_DEMO', '1'));

  it('uses no database and starts signed out', async () => {
    const services = createServices();
    expect(h.made).toEqual([]);
    expect(await services.session.current()).toBeNull();
  });

  it('signed out the demo API has no token; once signed in, the demo’s, also for the made-up history', async () => {
    const api = stubApi();
    const services = createServices();
    await services.api.catalog().catch(() => undefined);
    expect(api.splice(0)[0]!.headers.Authorization).toBeUndefined();
    await services.session.signInWithGoogle('/home');
    await services.study.heatmap(null);
    expect(api.map((c) => c.path.split('?')[0])).toEqual([
      '/api/anki/card-changes',
      '/api/catalog',
    ]);
    expect(api.every((c) => c.headers.Authorization === 'Bearer demo-local')).toBe(true);
  });

  it.each([
    [null, true, true],
    ['student', false, false],
    ['admin', true, false],
  ])('with the role «%s»: administrator %s, site owner %s', async (role, admin, owner) => {
    if (role) window.localStorage.setItem('qv-demo-role', role);
    const services = createServices();
    expect(await services.admin.isAdmin()).toBe(admin);
    if (admin) expect((await services.admin.accessReport()).youAreOwner).toBe(owner);
  });

  it('a browser that refuses its storage gets the site owner', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const services = createServices();
    vi.restoreAllMocks();
    expect(await services.admin.isAdmin()).toBe(true);
  });

  it('the data export carries what the demo keeps, without its session nor what is not the demo’s', async () => {
    window.localStorage.setItem('qv-demo-session', '1');
    window.localStorage.setItem('qv-demo-study', '{"cards":[1]}');
    window.localStorage.setItem('qv-demo-quiz', 'not json');
    window.localStorage.setItem('qv-theme', 'dark');
    const blob = await createServices().account.exportData();
    const data = JSON.parse(await blob.text()) as { demo: unknown };
    expect(data.demo).toEqual({
      'qv-demo-study': { cards: [1] },
      'qv-demo-quiz': 'not json',
    });
  });

  it('a value the browser drops while exporting is exported as null', async () => {
    window.localStorage.setItem('qv-demo-study', '{}');
    const account = createServices().account;
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    const data = JSON.parse(await (await account.exportData()).text()) as { demo: unknown };
    expect(data.demo).toEqual({ 'qv-demo-study': null });
  });
});
