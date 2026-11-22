// Tests for the API of local development: its fake session, the admin mode on a draft, the folder's images and health.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_HEADER } from '@qv/schema/http';
import { bundle } from '../../test/draftApp';
import { DEMO_TOKEN, createDemoApp, folderMedia } from '../demo';

const KEY = `tests/${'0123456789abcdef'.repeat(2)}.webp`;
let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'qv-demo-'));
  await mkdir(join(folder, 'media', 'tests'), { recursive: true });
  await writeFile(join(folder, 'media', KEY), new Uint8Array([1, 2, 3]));
  await writeFile(join(folder, 'content.json'), JSON.stringify(bundle('Publicado')));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(folder, { recursive: true, force: true });
});

const as = (token: string, headers: Record<string, string> = {}) => ({
  headers: { Authorization: `Bearer ${token}`, ...headers },
});

describe('createDemoApp', () => {
  it('only the demo token is a session', async () => {
    const app = await createDemoApp(folder);
    expect((await app.request('/api/catalog', as(DEMO_TOKEN))).status).toBe(200);
    expect((await app.request('/api/catalog', as('otro'))).status).toBe(401);
    expect((await app.request('/api/catalog')).status).toBe(401);
  });

  it('the demo user is an administrator: the admin mode reads the draft, and the others the published', async () => {
    await mkdir(join(folder, 'draft'));
    await writeFile(join(folder, 'draft', 'content.json'), JSON.stringify(bundle('Borrador')));
    const app = await createDemoApp(folder);
    const titleOf = async (headers: Record<string, string>) =>
      (
        await (
          await app.request('/api/notes/11-traduccion', as(DEMO_TOKEN, headers))
        ).json<{
          title: string;
        }>()
      ).title;
    expect(await titleOf({})).toBe('Publicado');
    expect(await titleOf({ [PREVIEW_HEADER]: 'draft' })).toBe('Borrador');
  });

  it('without a draft folder the admin mode shows the published content', async () => {
    const app = await createDemoApp(folder);
    const r = await app.request(
      '/api/notes/11-traduccion',
      as(DEMO_TOKEN, { [PREVIEW_HEADER]: 'draft' }),
    );
    expect((await r.json<{ title: string }>()).title).toBe('Publicado');
  });

  it('a content.json that is not a bundle stops the start', async () => {
    await writeFile(join(folder, 'content.json'), '{"notes": 3}');
    await expect(createDemoApp(folder)).rejects.toThrow();
  });

  it('the deep health follows the folder of images: there, ok; gone, 503', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await (await createDemoApp(folder)).request('/api/health/deep')).status).toBe(200);
    await rm(join(folder, 'media'), { recursive: true });
    const gone = await (await createDemoApp(folder)).request('/api/health/deep');
    expect(gone.status).toBe(503);
    expect(await gone.json()).toMatchObject({
      ok: false,
      checks: { media: 'fail', content: 'ok' },
    });
  });

  it('with a real Supabase session nobody is an administrator, not even a valid token', async () => {
    const pair = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' };
    vi.stubGlobal('fetch', async () => Response.json({ keys: [jwk] }));
    const url = 'https://users.example.supabase.co';
    const token = await new SignJWT({ email: 'ana@ug.uchile.cl', role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setSubject('00000000-0000-4000-8000-00000000000a')
      .setIssuer(`${url}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(pair.privateKey);
    const app = await createDemoApp(folder, { supabaseUrl: url });
    expect((await app.request('/api/catalog', as(token))).status).toBe(200);
    expect((await app.request('/api/admin/site-settings', as(token))).status).toBe(404);
    expect((await app.request('/api/catalog', as(DEMO_TOKEN))).status).toBe(401);
  });
});

describe('folderMedia', () => {
  it('serves an image of the folder as webp, and says whether it is there', async () => {
    const media = folderMedia(folder);
    const object = await media.get(KEY);
    expect(object?.contentType).toBe('image/webp');
    expect([...(object!.body as Uint8Array)]).toEqual([1, 2, 3]);
    expect(await media.has?.(KEY)).toBe(true);
  });

  it('a key that is not in the folder is not there', async () => {
    const missing = `tests/${'f'.repeat(32)}.webp`;
    expect(await folderMedia(folder).get(missing)).toBeNull();
    expect(await folderMedia(folder).has?.(missing)).toBe(false);
  });

  it('a key that tries to leave the folder is not even looked for', async () => {
    await writeFile(join(folder, 'secreto.txt'), 'no');
    const media = folderMedia(folder);
    expect(await media.get('../secreto.txt')).toBeNull();
    expect(await media.has?.('../secreto.txt')).toBe(false);
  });
});
