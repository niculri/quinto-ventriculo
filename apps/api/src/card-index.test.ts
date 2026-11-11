// Plan step 3.3 (ANK-6, ANK-8): the card browser's index and its thumbnails, as the Worker serves them. The index comes
// from the image store with the hash the catalog gives; the thumbnails, with one signature for all of them.
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import type { CryptoKey as JoseKey } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CardIndex,
  Catalog,
  ThumbSignature,
  buildCardIndexes,
  cardIndexKey,
  cardIndexUrl,
} from '@qv/schema';
import type { CardIndexRecord, ContentBundle, ImportedAnkiNote } from '@qv/schema';
import { PREVIEW_HEADER, PREVIEW_VALUE, createApp } from './app';
import { MediaSigner } from './media';
import type { MediaStore } from './media';
import { memoryRepository } from './repositories/memory';
import type { ContentRepository } from './repository';
import { supabaseVerifier } from './session';

const SUPABASE = 'https://users.supabase.co';
const NOW = 1_793_448_000;
const A = 'biologia-celular/certamen-2';
const IMAGE = 'cards/0123456789abcdef0123456789abcdef.webp';
const THUMB = 'cards/thumb/0123456789abcdef0123456789abcdef.webp';

const note = (guid: string, code: string, frente: string): ImportedAnkiNote => ({
  guid,
  noteTypeId: '1',
  fields: { Frente: frente, Reverso: 'Respuesta', Tema: 'Tema de prueba' },
  tags: ['profe'],
  code,
  version: 1,
  createdAt: null,
  cards: [{ ord: 0, deckId: '20', frontHtml: `<p>${frente}</p>`, backHtml: '', sortField: frente }],
  hash: guid,
  updatedAt: '2026-10-31T12:00:00.000Z',
  media: [],
});

const base: ContentBundle = {
  semesters: [{ number: 2, name: '2° Semestre' }],
  courses: [
    { id: 'biologia-celular', semester: 2, name: 'Biología celular', emoji: '🧬', position: 1 },
  ],
  assessments: [{ id: A, courseId: 'biologia-celular', name: 'Certamen 2', position: 1 }],
  notes: [],
  ankiNoteTypes: [
    {
      id: '1',
      name: 'Básica',
      kind: 'normal',
      occlusion: false,
      fields: ['Frente', 'Reverso', 'Tema'],
      templates: [{ name: 'Directa', qfmt: '{{Frente}}', afmt: '{{Reverso}}' }],
      css: '',
      sortField: 0,
    },
  ],
  ankiPresets: [{ name: 'Default', config: {} }],
  ankiDecks: [
    {
      id: '20',
      name: 'Raíz::Mazo',
      description: '',
      parentId: null,
      semester: 2,
      courseId: 'biologia-celular',
      assessmentId: A,
      preset: 'Default',
      position: 0,
    },
  ],
  ankiNotes: [note('n-2', 'T-PR-01-002', '¿Dos vértebras?'), note('n-1', 'T-PR-01-001', '¿Una?')],
  quizzes: [],
};

/** The index as the importer writes it: its JSON, the hash of it, gzip. */
function pack(bundle: ContentBundle) {
  const [index] = buildCardIndexes({
    noteTypes: bundle.ankiNoteTypes,
    decks: bundle.ankiDecks,
    notes: bundle.ankiNotes,
  });
  const json = JSON.stringify(index);
  const hash = createHash('sha256').update(json).digest('hex').slice(0, 32);
  const body = gzipSync(json);
  const record: CardIndexRecord = {
    assessmentId: A,
    hash,
    noteCount: index!.notes.length,
    cardCount: 2,
    bytes: body.length,
  };
  return { index: index!, hash, body, record };
}

const published = pack(base);
const draftBundle: ContentBundle = {
  ...base,
  ankiNotes: [...base.ankiNotes, note('n-3', 'T-PR-01-003', '¿Tres?')],
};
const draft = pack(draftBundle);

const objects = new Map<string, Uint8Array>([
  [cardIndexKey(A, published.hash), published.body],
  [cardIndexKey(A, draft.hash), draft.body],
  [THUMB, new Uint8Array([9, 9])],
  [IMAGE, new Uint8Array([1, 2, 3])],
]);
const requested: string[] = [];
const media: MediaStore = {
  get: async (key) => {
    requested.push(key);
    const body = objects.get(key);
    return body ? { body, contentType: 'image/webp', etag: `"${key.length}"` } : null;
  },
};

/** Counts every read of the content database: opening the browser must ask nothing of it. */
function counting(repo: ContentRepository) {
  const reads: string[] = [];
  const wrapped = Object.fromEntries(
    Object.entries(repo).map(([name, fn]) => [
      name,
      (...args: unknown[]) => {
        reads.push(name);
        return (fn as (...a: unknown[]) => unknown)(...args);
      },
    ]),
  ) as unknown as ContentRepository;
  return { repo: wrapped, reads };
}

const signer = new MediaSigner('secreto-de-prueba-0123456789-0123456789');
const content = counting(memoryRepository({ ...base, ankiBrowseIndexes: [published.record] }));
const preview = memoryRepository({ ...draftBundle, ankiBrowseIndexes: [draft.record] });
let privateKey: JoseKey;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' };
  app = createApp({
    verifier: supabaseVerifier({ supabaseUrl: SUPABASE, keys: createLocalJWKSet({ keys: [jwk] }) }),
    repository: content.repo,
    preview,
    admins: { isAdmin: async () => true },
    media,
    signer,
    now: () => NOW,
  });
});

const token = () =>
  new SignJWT({ email: 'ana@ug.uchile.cl', role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setSubject('00000000-0000-4000-8000-00000000000a')
    .setIssuer(`${SUPABASE}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(privateKey);
const get = async (path: string, headers: Record<string, string> = {}) =>
  app.request(path, { headers });
const withSession = async (headers: Record<string, string> = {}) => ({
  Authorization: `Bearer ${await token()}`,
  ...headers,
});

describe('the card browser index (step 3.3)', () => {
  it('the catalog says which file is the current one of each assessment', async () => {
    const catalog = Catalog.parse(await (await get('/api/catalog', await withSession())).json());
    const assessment = catalog.semesters[0]!.courses[0]!.assessments[0]!;
    const { assessmentId: _a, ...ref } = published.record;
    expect(assessment.cardIndex).toEqual(ref);
  });

  it('served compressed, as stored, behind the session; without asking the content database anything', async () => {
    content.reads.length = 0;
    requested.length = 0;
    const r = await get(
      cardIndexUrl(A, published.hash),
      await withSession({ 'Accept-Encoding': 'gzip, br' }),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Encoding')).toBe('gzip');
    expect(r.headers.get('Content-Type')).toBe('application/json; charset=UTF-8');
    expect(r.headers.get('Cache-Control')).toBe('private, max-age=600');
    expect(r.headers.get('Vary')).toMatch(/Authorization/);
    expect(r.headers.get('Vary')).toMatch(/Accept-Encoding/);
    const bytes = Buffer.from(await r.arrayBuffer());
    expect(bytes).toEqual(Buffer.from(published.body));
    const index = CardIndex.parse(JSON.parse(gunzipSync(bytes).toString()));
    expect(index).toEqual(published.index);
    // By code, with what the row shows.
    expect(index.notes.map((n) => [n.code, n.kind, n.front, n.back, n.topic, n.origin])).toEqual([
      ['T-PR-01-001', 'basic', '¿Una?', 'Respuesta', 'Tema de prueba', ['profe']],
      ['T-PR-01-002', 'basic', '¿Dos vértebras?', 'Respuesta', 'Tema de prueba', ['profe']],
    ]);
    expect(content.reads).toEqual([]);
    expect(requested).toEqual([cardIndexKey(A, published.hash)]);
  });

  it('a browser that does not take gzip gets it decompressed', async () => {
    const r = await get(
      cardIndexUrl(A, published.hash),
      await withSession({ 'Accept-Encoding': 'identity' }),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Encoding')).toBeNull();
    expect(CardIndex.parse(await r.json())).toEqual(published.index);
  });

  it('without a session, 401; an odd path, 400; a file that is not there, 404', async () => {
    expect((await get(cardIndexUrl(A, published.hash))).status).toBe(401);
    const s = await withSession();
    expect((await get(`/api/anki/index/${A}/NOPE`, s)).status).toBe(400);
    expect((await get(`/api/anki/index/BIO/certamen-2/${published.hash}`, s)).status).toBe(400);
    expect((await get(`/api/anki/index/${A}/${'f'.repeat(32)}`, s)).status).toBe(404);
    // A key of another kind never comes out of this route.
    expect((await get(`/api/anki/index/cards/thumb/${'0'.repeat(32)}`, s)).status).toBe(404);
  });

  it('somebody signed in but not invited (any more) gets neither the index nor the thumbnails’ signature', async () => {
    // Revisión de cero (3.3): the same session check as the rest of the material (step 2.1).
    const pair = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' };
    const outside = createApp({
      verifier: supabaseVerifier({
        supabaseUrl: SUPABASE,
        keys: createLocalJWKSet({ keys: [jwk] }),
      }),
      repository: content.repo,
      access: { check: async () => 'denied' },
      media,
      signer,
      now: () => NOW,
    });
    const t = await new SignJWT({ email: 'ana@ug.uchile.cl', role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setSubject('00000000-0000-4000-8000-00000000000a')
      .setIssuer(`${SUPABASE}/auth/v1`)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(pair.privateKey);
    requested.length = 0;
    const headers = { Authorization: `Bearer ${t}`, 'Accept-Encoding': 'gzip' };
    const index = await outside.request(cardIndexUrl(A, published.hash), { headers });
    expect(index.status).toBe(403);
    expect(((await index.json()) as { error: string }).error).toBe('not_invited');
    expect((await outside.request('/api/anki/thumbs', { headers })).status).toBe(403);
    expect(requested).toEqual([]);
  });

  it('the preview of the draft says which file is the draft’s, and it is not kept', async () => {
    const s = await withSession({ [PREVIEW_HEADER]: PREVIEW_VALUE });
    const catalog = Catalog.parse(await (await get('/api/catalog', s)).json());
    expect(catalog.semesters[0]!.courses[0]!.assessments[0]!.cardIndex?.hash).toBe(draft.hash);
    const r = await get(cardIndexUrl(A, draft.hash), { ...s, 'Accept-Encoding': 'gzip' });
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(
      CardIndex.parse(JSON.parse(gunzipSync(Buffer.from(await r.arrayBuffer())).toString())).notes,
    ).toHaveLength(3);
  });
});

describe('the thumbnails (step 3.3)', () => {
  const signature = async () =>
    ThumbSignature.parse(await (await get('/api/anki/thumbs', await withSession())).json());

  it('one signature for all of them, with the same duration as an image; without a session, 401', async () => {
    expect((await get('/api/anki/thumbs')).status).toBe(401);
    const s = await signature();
    expect(s.prefix).toBe('cards/thumb/');
    // The same expiry as a signed image: the next hour + 1.
    expect(s.expires).toBe((Math.floor(NOW / 3600) + 2) * 3600);
    const r = await get(`/api/media/${THUMB}?${s.query}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('private, max-age=600, immutable');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([9, 9]));
  });

  it('without a signature, or with a tampered or expired one, 403', async () => {
    const s = await signature();
    expect((await get(`/api/media/${THUMB}`)).status).toBe(403);
    expect((await get(`/api/media/${THUMB}?${s.query.replace(/s=.{4}/, 's=AAAA')}`)).status).toBe(
      403,
    );
    expect(
      (await get(`/api/media/${THUMB}?${s.query.replace(/e=\d+/, `e=${s.expires + 3600}`)}`))
        .status,
    ).toBe(403);
    const old = NOW - 1;
    const expired = `e=${old}&p=cards%2Fthumb%2F&s=${await signer.signPrefix('cards/thumb/', old)}`;
    expect((await get(`/api/media/${THUMB}?${expired}`)).status).toBe(403);
  });

  it('the thumbnails’ signature does not open a whole image, nor another prefix', async () => {
    const s = await signature();
    expect((await get(`/api/media/${IMAGE}?${s.query}`)).status).toBe(403);
    const other = s.query.replace('p=cards%2Fthumb%2F', 'p=cards%2F');
    expect((await get(`/api/media/${IMAGE}?${other}`)).status).toBe(403);
    // Nor does an image's signature open a thumbnail.
    const e = NOW + 3600;
    expect((await get(`/api/media/${THUMB}?e=${e}&s=${await signer.sign(IMAGE, e)}`)).status).toBe(
      403,
    );
    await expect(signer.signPrefix('cards/', e)).rejects.toThrow(/Prefijo sin firma/);
  });
});
