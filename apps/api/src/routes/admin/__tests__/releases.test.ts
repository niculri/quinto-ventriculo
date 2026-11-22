// Tests for the release panel's endpoints: the summary, the items, the marks, publishing and undoing.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CONTENT_SCHEMA_VERSION,
  PREVIEW_HEADER,
  PublishResult,
  ReleaseLog,
  ReleaseOverview,
} from '@qv/schema';
import { memoryRepository } from '../../../adapters/memory/content';
import { createApp } from '../../../app';
import { MediaSigner } from '../../../services/media-signer';
import { ADMIN, FP, bundle, createDraftApp, releases, state } from '../../../test/draft-app';
import { titleOf } from '../../../test/draft-app';

let request: Awaited<ReturnType<typeof createDraftApp>>['request'];

beforeAll(async () => {
  ({ request } = await createDraftApp());
});

describe('the release panel', () => {
  it('the summary, with the content version this Worker understands; no-store', async () => {
    const r = await request('/api/admin/release', ADMIN);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    const o = ReleaseOverview.parse(await r.json());
    expect(o.supportedSchemaVersion).toBe(CONTENT_SCHEMA_VERSION);
    expect(o.summary.fingerprint).toBe(FP);
    expect(o.browseIndexes).toEqual([{ assessmentId: 'a/b', op: 'added' }]);
  });

  it('a student gets «no existe» in every endpoint', async () => {
    for (const path of [
      '/api/admin/release',
      '/api/admin/release/items?assessment=biologia-celular/certamen-2&kind=card',
      '/api/admin/release/texts',
      '/api/admin/release/media',
    ]) {
      expect((await request(path, 'ana@ug.uchile.cl')).status, path).toBe(404);
    }
    const put = await request(
      '/api/admin/release/marks',
      'ana@ug.uchile.cl',
      { 'Content-Type': 'application/json' },
      { method: 'PUT', body: JSON.stringify({ fingerprint: FP, mark: 'phone', checked: true }) },
    );
    expect(put.status).toBe(404);
    expect(state.marks).toEqual([]);
  });

  it('the items of a kind, and odd parameters: 400', async () => {
    const r = await request(
      '/api/admin/release/items?assessment=biologia-celular/certamen-2&kind=card&after=g',
      ADMIN,
    );
    expect(await r.json()).toEqual({
      items: [{ assessment: 'biologia-celular/certamen-2', kind: 'card', after: 'g' }],
      next: null,
    });
    expect((await request('/api/admin/release/items?assessment=x&kind=card', ADMIN)).status).toBe(
      400,
    );
    expect(
      (
        await request(
          '/api/admin/release/items?assessment=biologia-celular/certamen-2&kind=deck',
          ADMIN,
        )
      ).status,
    ).toBe(400);
  });

  it('the new images, and which of them the store does not have', async () => {
    const r = await request('/api/admin/release/media', ADMIN);
    expect(await r.json()).toEqual({
      checked: ['cards/hay.webp', 'cards/falta.webp'],
      missing: ['cards/falta.webp'],
      next: 'cards/falta.webp',
    });
  });

  it('the lookups of a page go out together, not one after another, and keep the order', async () => {
    const keys = Array.from({ length: 40 }, (_, i) => `cards/i${String(i).padStart(2, '0')}.webp`);
    let inFlight = 0;
    let most = 0;
    const a = createApp({
      verifier: { verify: async () => ({ id: 'u', email: ADMIN }) },
      repository: memoryRepository(bundle('Traducción')),
      releases: { ...releases, media: async () => ({ keys, next: null }) },
      media: {
        get: async () => null,
        has: async (key) => {
          inFlight += 1;
          most = Math.max(most, inFlight);
          await new Promise((r) => setTimeout(r, 5));
          inFlight -= 1;
          return Number(key.slice(7, 9)) % 2 === 0;
        },
      },
      signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
      admins: { isAdmin: async () => true },
    });
    const r = await a.request('/api/admin/release/media', {
      headers: { Authorization: 'Bearer t' },
    });
    expect(await r.json()).toEqual({
      checked: keys,
      missing: keys.filter((_, i) => i % 2 === 1),
      next: null,
    });
    expect(most).toBe(40);
  });

  it('a mark, by who checks it; 409 if the draft changed; 400 for an odd one', async () => {
    const put = (body: unknown) =>
      request(
        '/api/admin/release/marks',
        ADMIN,
        { 'Content-Type': 'application/json' },
        { method: 'PUT', body: JSON.stringify(body) },
      );
    const ok = await put({ fingerprint: FP, mark: 'phone', checked: true });
    expect(ok.status).toBe(200);
    expect((await ok.json<{ marks: unknown[] }>()).marks).toEqual([
      expect.objectContaining({ mark: 'phone', checkedBy: ADMIN }),
    ]);
    expect(state.marks.at(-1)).toEqual({ mark: 'phone', checked: true, by: ADMIN });
    const stale = await put({ fingerprint: 'e'.repeat(32), mark: 'phone', checked: true });
    expect(stale.status).toBe(409);
    expect((await stale.json<{ error: string }>()).error).toBe('release_changed');
    expect((await put({ fingerprint: FP, mark: 'otra', checked: true })).status).toBe(400);
    expect((await put({ fingerprint: 'x', mark: 'phone', checked: true })).status).toBe(400);
  });

  it('without the users’ public key nobody is an administrator: no preview, no panel', async () => {
    const a = createApp({
      verifier: { verify: async () => ({ id: 'u', email: ADMIN }) },
      repository: memoryRepository(bundle('Traducción')),
      preview: memoryRepository(bundle('Traducción (borrador)')),
      releases,
      media: { get: async () => null },
      signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    });
    const headers = { Authorization: 'Bearer t', [PREVIEW_HEADER]: 'draft' };
    expect(await titleOf(await a.request('/api/catalog', { headers }))).toBe('Traducción');
    expect((await a.request('/api/admin/release', { headers })).status).toBe(404);
  });
});

describe('publishing and undoing', () => {
  const CHECKS = { blocking: 0, pending: 0, ready: true, warnings: [], marks: [] };
  const post = (path: string, email: string, body: unknown) =>
    request(
      path,
      email,
      { 'Content-Type': 'application/json' },
      { method: 'POST', body: JSON.stringify(body) },
    );

  it('publishes the draft the panel showed, with this Worker’s content version and who asks; no-store', async () => {
    state.published.length = 0;
    state.refusal = null;
    const r = await post('/api/admin/release/publish', ADMIN, {
      fingerprint: FP,
      title: '  Biología celular · Certamen 2 ',
      checks: CHECKS,
      schemaVersion: 99,
      by: 'otro@ug.uchile.cl',
      marks: ['announcement'],
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(PublishResult.parse(await r.json())).toMatchObject({ id: 7 });
    expect(state.published).toEqual([
      {
        fingerprint: FP,
        title: 'Biología celular · Certamen 2',
        checks: CHECKS,
        schemaVersion: CONTENT_SCHEMA_VERSION,
        marks: [],
        by: ADMIN,
      },
    ]);
  });

  it('says why the database refused: 409 if the draft changed, 422 for the rest', async () => {
    for (const [reason, status, code] of [
      ['fingerprint', 409, 'release_changed'],
      ['marks', 422, 'release_marks'],
      ['blocked', 422, 'release_blocked'],
      ['schema_version', 422, 'release_schema_version'],
      ['unpublished', 422, 'release_unpublished'],
      ['imaios', 422, 'release_imaios'],
      ['empty', 409, 'release_empty'],
      ['drift', 422, 'release_drift'],
      ['unique', 422, 'release_unique'],
      ['something new', 400, 'invalid_release'],
    ] as const) {
      state.refusal = reason;
      const r = await post('/api/admin/release/publish', ADMIN, {
        fingerprint: FP,
        title: 't',
        checks: CHECKS,
      });
      expect(r.status, reason).toBe(status);
      expect((await r.json<{ error: string }>()).error, reason).toBe(code);
    }
    state.refusal = null;
  });

  it('the refusals that name something say what', async () => {
    const message = async (path: string, body: unknown) =>
      (await (await post(path, ADMIN, body)).json<{ message: string }>()).message;
    const publishBody = { fingerprint: FP, title: 't', checks: CHECKS };
    state.refusalDetail = 'notes (notes_slug_key): Key (slug)=(clase-08) already exists.';
    state.refusal = 'unique';
    expect(await message('/api/admin/release/publish', publishBody)).toMatch(
      /dos pasos.*Detalle: notes \(notes_slug_key\): Key \(slug\)=\(clase-08\)/,
    );
    state.refusal = 'public_changed';
    state.refusalDetail = 'taken off after it: note AP-BC-C2-10 (2026-11-07 12:00:00+00)';
    expect(await message('/api/admin/release/revert', { id: 7 })).toMatch(
      /Detalle: taken off after it: note AP-BC-C2-10/,
    );
    state.refusal = 'fingerprint';
    state.refusalDetail = 'the draft or what is published changed since the panel showed it';
    expect(await message('/api/admin/release/publish', publishBody)).not.toMatch(/Detalle/);
    state.refusal = null;
    state.refusalDetail = null;
  });

  it('an odd body is 400, and the database is not asked', async () => {
    state.published.length = 0;
    for (const body of [
      null,
      { fingerprint: 'x', title: 't', checks: CHECKS },
      { fingerprint: FP, title: '', checks: CHECKS },
      { fingerprint: FP, title: 't' },
      { fingerprint: FP, title: 't', checks: { ...CHECKS, blocking: -1 } },
    ]) {
      expect((await post('/api/admin/release/publish', ADMIN, body)).status).toBe(400);
    }
    expect(state.published).toEqual([]);
  });

  it('undoes the last one, by who asks; says why not', async () => {
    state.reverted.length = 0;
    state.refusal = null;
    const ok = await post('/api/admin/release/revert', ADMIN, { id: 7 });
    expect(ok.status).toBe(200);
    expect(state.reverted).toEqual([{ id: 7, by: ADMIN }]);
    for (const [reason, code] of [
      ['not_last', 'release_not_last'],
      ['reverted', 'release_reverted'],
      ['migrated', 'release_migrated'],
      ['public_changed', 'release_public_changed'],
    ] as const) {
      state.refusal = reason;
      const r = await post('/api/admin/release/revert', ADMIN, { id: 7 });
      expect(r.status, reason).toBe(409);
      expect((await r.json<{ error: string }>()).error).toBe(code);
    }
    state.refusal = null;
    expect((await post('/api/admin/release/revert', ADMIN, { id: 'x' })).status).toBe(400);
  });

  it('the log, no-store', async () => {
    const r = await request('/api/admin/releases', ADMIN);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(ReleaseLog.parse(await r.json()).releases.map((x) => x.id)).toEqual([7]);
  });

  it('a student gets «no existe», and nothing is published nor undone', async () => {
    state.published.length = 0;
    state.reverted.length = 0;
    const student = 'ana@ug.uchile.cl';
    expect(
      (
        await post('/api/admin/release/publish', student, {
          fingerprint: FP,
          title: 't',
          checks: CHECKS,
        })
      ).status,
    ).toBe(404);
    expect((await post('/api/admin/release/revert', student, { id: 7 })).status).toBe(404);
    expect((await request('/api/admin/releases', student)).status).toBe(404);
    expect(state.published).toEqual([]);
    expect(state.reverted).toEqual([]);
  });
});
