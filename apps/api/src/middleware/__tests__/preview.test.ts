// Tests for the admin mode: an administrator who asks for the draft gets it, and nobody else does.
import { SignJWT, generateKeyPair } from 'jose';
import type { CryptoKey as JoseKey } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PREVIEW_HEADER } from '@qv/schema';
import { memoryRepository } from '../../adapters/memory/content';
import { supabaseAdminChecker } from '../../adapters/supabase/admin';
import { createApp } from '../../app';
import { MediaSigner } from '../../services/mediaSigner';
import { ADMIN, SUPABASE, bundle, createDraftApp, releases, titleOf } from '../../test/draftApp';
import { urlOf } from '../../test/fetch';

let privateKey: JoseKey;
let app: ReturnType<typeof createApp>;
let request: Awaited<ReturnType<typeof createDraftApp>>['request'];

beforeAll(async () => {
  ({ app, privateKey, request } = await createDraftApp());
});

describe('the preview of the draft', () => {
  it('an administrator with the header gets the draft, never kept by the browser', async () => {
    const r = await request('/api/catalog', ADMIN, { [PREVIEW_HEADER]: 'draft' });
    expect(await titleOf(r)).toBe('Traducción (borrador)');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get(PREVIEW_HEADER)).toBe('draft');
    expect(r.headers.get('Vary')).toContain(PREVIEW_HEADER);
    const note = await request('/api/notes/11-traduccion', ADMIN, { [PREVIEW_HEADER]: 'draft' });
    expect((await note.json<{ title: string }>()).title).toBe('Traducción (borrador)');
  });

  it('a student with the header gets what is published (and the browser keeps it apart)', async () => {
    const r = await request('/api/catalog', 'ana@ug.uchile.cl', { [PREVIEW_HEADER]: 'draft' });
    expect(await titleOf(r)).toBe('Traducción');
    expect(r.headers.get('Cache-Control')).toBe('private, no-cache');
    expect(r.headers.get(PREVIEW_HEADER)).toBeNull();
    expect(r.headers.get('Vary')).toBe(`Authorization, ${PREVIEW_HEADER}`);
    const cookie = await request('/api/catalog', ADMIN, {
      Cookie: `${PREVIEW_HEADER}=draft; qv-preview=draft`,
    });
    expect(await titleOf(cookie)).toBe('Traducción');
    const other = await request('/api/catalog', ADMIN, { [PREVIEW_HEADER]: '1' });
    expect(await titleOf(other)).toBe('Traducción');
  });

  it('an expired token, or one of another project, gets nothing of either', async () => {
    const sign = (o: { issuer?: string; expires?: string | number; key?: JoseKey }) =>
      new SignJWT({ email: ADMIN, role: 'authenticated' })
        .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
        .setSubject('00000000-0000-4000-8000-000000000001')
        .setIssuer(o.issuer ?? `${SUPABASE}/auth/v1`)
        .setAudience('authenticated')
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setExpirationTime(o.expires ?? '1h')
        .sign(o.key ?? privateKey);
    const other = (await generateKeyPair('ES256')).privateKey;
    for (const t of [
      await sign({ expires: Math.floor(Date.now() / 1000) - 3600 }),
      await sign({ issuer: 'https://otro.supabase.co/auth/v1' }),
      await sign({ key: other }),
    ]) {
      for (const path of ['/api/catalog', '/api/admin/release']) {
        const r = await app.request(path, {
          headers: { Authorization: `Bearer ${t}`, [PREVIEW_HEADER]: 'draft' },
        });
        expect(r.status, path).toBe(401);
        expect(await r.text()).not.toContain('borrador');
      }
    }
  });

  it('whoever stops being an administrator gets what is published within a minute', async () => {
    let admin = true;
    let now = 0;
    const a = createApp({
      verifier: { verify: async () => ({ id: 'u', email: ADMIN }) },
      repository: memoryRepository(bundle('Traducción')),
      preview: memoryRepository(bundle('Traducción (borrador)')),
      releases,
      media: { get: async () => null },
      signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
      admins: supabaseAdminChecker({
        supabaseUrl: SUPABASE,
        publishableKey: 'k',
        now: () => now,
        fetch: async () => new Response(JSON.stringify(admin)),
      }),
    });
    const headers = { Authorization: 'Bearer t', [PREVIEW_HEADER]: 'draft' };
    expect(await titleOf(await a.request('/api/catalog', { headers }))).toBe(
      'Traducción (borrador)',
    );
    admin = false;
    now = 61_000;
    const r = await a.request('/api/catalog', { headers });
    expect(await titleOf(r)).toBe('Traducción');
    const panel = await a.request('/api/admin/release', { headers });
    expect(panel.status).toBe(404);
    expect(panel.headers.get('Cache-Control')).toBe('no-store');
  });

  it('without the header, an administrator gets what is published too', async () => {
    expect(await titleOf(await request('/api/catalog', ADMIN))).toBe('Traducción');
  });

  it('the cards that moved come always from what is published (the draft’s numbers are not public’s)', async () => {
    const spy = vi.fn(async () => ({ changes: [], next: 0, latest: 0, more: false }));
    const draftRepo = { ...memoryRepository(bundle('x')), cardChanges: spy };
    const a = createApp({
      verifier: { verify: async () => ({ id: 'u', email: ADMIN }) },
      repository: memoryRepository(bundle('Traducción')),
      preview: draftRepo,
      admins: { isAdmin: async () => true },
      media: { get: async () => null },
      signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    });
    const r = await a.request('/api/anki/card-changes?since=0', {
      headers: { Authorization: 'Bearer t', [PREVIEW_HEADER]: 'draft' },
    });
    expect(r.status).toBe(200);
    expect(spy).not.toHaveBeenCalled();
  });

  it('asks is_admin() with the student’s own token and the public key, and remembers the answer a minute', async () => {
    let calls = 0;
    let now = 0;
    const checker = supabaseAdminChecker({
      supabaseUrl: `${SUPABASE}/`,
      publishableKey: 'sb_publishable_x',
      now: () => now,
      fetch: async (input, init) => {
        calls++;
        expect(urlOf(input)).toBe(`${SUPABASE}/rest/v1/rpc/is_admin`);
        const h = new Headers(init?.headers);
        expect([h.get('apikey'), h.get('Authorization')]).toEqual([
          'sb_publishable_x',
          'Bearer tok',
        ]);
        return new Response('true');
      },
    });
    expect(await checker.isAdmin('tok')).toBe(true);
    expect(await checker.isAdmin('tok')).toBe(true);
    expect(calls).toBe(1);
    now = 61_000;
    await checker.isAdmin('tok');
    expect(calls).toBe(2);
    const failing = supabaseAdminChecker({
      supabaseUrl: SUPABASE,
      publishableKey: 'k',
      fetch: async () => new Response('{}', { status: 500 }),
    });
    expect(await failing.isAdmin('tok')).toBe(false);
  });
});
