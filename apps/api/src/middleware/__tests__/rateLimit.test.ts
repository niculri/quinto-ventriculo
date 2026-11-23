// Tests for the limits on requests: by student with a session, by address without one, the 429 they answer, and how
// they sit with the client-error route's own budget.
import { describe, expect, it } from 'vitest';
import { memoryClientErrors } from '../../adapters/memory/clientErrors';
import { memoryRateLimiter } from '../../adapters/memory/rateLimit';
import { createApp } from '../../app';
import type { AppOptions } from '../../dependencies';
import type { ContentRepository } from '../../ports/content';
import { MediaSigner } from '../../services/mediaSigner';

const SITE = 'https://sitio.test';
const ANA = { id: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
const BETO = { id: '00000000-0000-4000-8000-00000000000b', email: 'beto@ug.uchile.cl' };
const TOKENS: Record<string, typeof ANA> = { 'token-de-ana': ANA, 'token-de-beto': BETO };

let verifications = 0;

function appWith(
  op: { student?: number; address?: number; unlimited?: boolean } & Partial<AppOptions> = {},
) {
  let now = 1_800_000_000;
  const { student = 3, address = 3, unlimited = false, ...deps } = op;
  const app = createApp({
    verifier: {
      verify: async (t) => {
        verifications++;
        return TOKENS[t] ?? null;
      },
    },
    repository: {} as ContentRepository,
    media: { get: async () => null },
    signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    now: () => now,
    ...(unlimited
      ? {}
      : {
          studentRateLimit: memoryRateLimiter(student, 10, () => now),
          addressRateLimit: memoryRateLimiter(address, 10, () => now),
        }),
    ...deps,
  });
  return {
    get: (path: string, headers: Record<string, string> = {}) =>
      app.request(`${SITE}${path}`, { headers }),
    post: (path: string, body: string, headers: Record<string, string> = {}) =>
      app.request(`${SITE}${path}`, { method: 'POST', body, headers }),
    wait: (seconds: number) => {
      now += seconds;
    },
  };
}

const as = (token: string, address = '200.89.1.1') => ({
  Authorization: `Bearer ${token}`,
  'CF-Connecting-IP': address,
});
const from = (address: string) => ({ 'CF-Connecting-IP': address });

describe('the limit by student', () => {
  it('answers 429 with Retry-After and a message once the window is used up, and lets the next one through', async () => {
    const app = appWith();
    for (let i = 0; i < 3; i++)
      expect((await app.get('/api/me', as('token-de-ana'))).status).toBe(200);
    const refused = await app.get('/api/me', as('token-de-ana'));
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Retry-After')).toBe('10');
    expect(refused.headers.get('Cache-Control')).toBe('no-store');
    expect(await refused.json()).toEqual({
      error: 'rate_limited',
      message: 'Llegaron demasiados pedidos seguidos. Espera unos segundos y vuelve a intentarlo.',
    });
    app.wait(10);
    expect((await app.get('/api/me', as('token-de-ana'))).status).toBe(200);
  });

  it('is each student’s own: a classmate behind the same address is not refused', async () => {
    const app = appWith();
    for (let i = 0; i < 4; i++) await app.get('/api/me', as('token-de-ana'));
    expect((await app.get('/api/me', as('token-de-ana'))).status).toBe(429);
    expect((await app.get('/api/me', as('token-de-beto'))).status).toBe(200);
  });

  it('the token is verified once a request, by the limit, and the session reuses it', async () => {
    const app = appWith();
    verifications = 0;
    expect((await app.get('/api/me', as('token-de-ana'))).status).toBe(200);
    expect((await app.get('/api/me', as('inventado'))).status).toBe(401);
    expect(verifications).toBe(2);
  });

  it('requests with a session do not use up their address', async () => {
    const app = appWith();
    for (let i = 0; i < 3; i++) await app.get('/api/me', as('token-de-ana'));
    for (let i = 0; i < 3; i++)
      expect((await app.get('/api/health', from('200.89.1.1'))).status).toBe(200);
  });
});

describe('the limit by address', () => {
  it('counts what comes without a session, each address apart', async () => {
    const app = appWith();
    for (let i = 0; i < 3; i++) await app.get('/api/health', from('200.89.1.1'));
    expect((await app.get('/api/health', from('200.89.1.1'))).status).toBe(429);
    expect((await app.get('/api/media/x.png', from('200.89.1.1'))).status).toBe(429);
    expect((await app.get('/api/health', from('200.89.1.2'))).status).toBe(200);
  });

  it('a route that needs a session, asked without one, is a 401 until the address is used up', async () => {
    const app = appWith();
    for (let i = 0; i < 3; i++)
      expect((await app.get('/api/me', from('200.89.1.1'))).status).toBe(401);
    expect((await app.get('/api/me', from('200.89.1.1'))).status).toBe(429);
  });

  it('a token that does not verify on a route with a session counts against its address, once a request', async () => {
    const app = appWith();
    for (let i = 0; i < 3; i++) {
      expect((await app.get('/api/me', as('inventado', '200.89.1.3'))).status).toBe(401);
    }
    expect((await app.get('/api/me', as('inventado', '200.89.1.3'))).status).toBe(429);
    expect((await app.get('/api/me', as('token-de-ana', '200.89.1.3'))).status).toBe(200);
  });

  it('a made-up token on a route without a session still pays its address', async () => {
    const app = appWith();
    for (const path of ['/api/health', '/api/media/x.png', '/api/health']) {
      expect((await app.get(path, as('inventado', '200.89.1.6'))).status).not.toBe(429);
    }
    expect((await app.get('/api/health', as('inventado', '200.89.1.6'))).status).toBe(429);
    expect((await app.get('/api/media/x.png', as('inventado', '200.89.1.6'))).status).toBe(429);
    const report = '{"kind":"boot","page":"/x","message":"m","version":"v"}';
    expect(
      (await app.post('/api/client-error', report, as('inventado', '200.89.1.6'))).status,
    ).toBe(429);
  });

  it('a real token on a route without a session counts against its student, not the address', async () => {
    const app = appWith();
    for (let i = 0; i < 3; i++) await app.get('/api/health', as('token-de-ana', '200.89.1.7'));
    expect((await app.get('/api/health', as('token-de-ana', '200.89.1.7'))).status).toBe(429);
    expect((await app.get('/api/me', as('token-de-ana', '200.89.1.7'))).status).toBe(429);
    expect((await app.get('/api/health', from('200.89.1.7'))).status).toBe(200);
  });

  it('a report of a browser error is refused before it is read, and the route’s own budget still applies', async () => {
    const errors = memoryClientErrors();
    const app = appWith({ address: 100, clientErrors: errors });
    const report = '{"kind":"boot","page":"/x","message":"m","version":"v"}';
    for (let i = 0; i < 70; i++) await app.post('/api/client-error', report, from('200.89.1.4'));
    expect(errors.points).toHaveLength(60);
    const tight = appWith({ address: 1, clientErrors: memoryClientErrors() });
    expect((await tight.post('/api/client-error', report, from('200.89.1.5'))).status).toBe(204);
    expect(
      (await tight.post('/api/client-error', 'x'.repeat(10_000), from('200.89.1.5'))).status,
    ).toBe(429);
  });
});

describe('without limiters', () => {
  it('nothing is refused', async () => {
    const app = appWith({ unlimited: true });
    for (let i = 0; i < 10; i++)
      expect((await app.get('/api/health', from('200.89.1.1'))).status).toBe(200);
  });
});
