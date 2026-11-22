// The app of the tests of the preview and the release panel: a draft and a published bundle, a release double and
// administrators asked to a fake users' database with the token's own email.
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { Catalog } from '@qv/schema';
import type { ContentBundle } from '@qv/schema';
import { memoryRepository } from '../adapters/memory/content';
import { supabaseAdminChecker } from '../adapters/supabase/admin';
import { supabaseVerifier } from '../adapters/supabase/session';
import { createApp } from '../app';
import type { PublishInput, ReleaseRepository } from '../ports/releases';
import { MediaSigner } from '../services/media-signer';

export const SUPABASE = 'https://users.supabase.co';
export const ADMIN = 'dueno@ug.uchile.cl';
export const FP = 'f'.repeat(32);

export const bundle = (title: string): ContentBundle => ({
  semesters: [{ number: 2, name: '2° Semestre' }],
  courses: [
    { id: 'biologia-celular', semester: 2, name: 'Biología celular', emoji: '🧬', position: 1 },
  ],
  assessments: [
    {
      id: 'biologia-celular/certamen-2',
      courseId: 'biologia-celular',
      name: 'Certamen 2',
      position: 2,
    },
  ],
  notes: [
    {
      id: 'AP-BC-C2-11',
      slug: '11-traduccion',
      courseId: 'biologia-celular',
      assessmentId: 'biologia-celular/certamen-2',
      kind: 'lecture',
      title,
      position: 1,
      updatedAt: '2026-10-31T12:00:00.000Z',
      sources: [],
      html: `<p>${title}</p>`,
      toc: [],
      sections: [],
      hash: title,
      media: [],
    },
  ],
  ankiNoteTypes: [],
  ankiPresets: [],
  ankiDecks: [],
  ankiNotes: [],
  quizzes: [],
});

/** What the release double was asked, and the reason it refuses with (null: it does not). */
export const state = {
  marks: [] as { mark: string; checked: boolean; by: string }[],
  published: [] as PublishInput[],
  reverted: [] as { id: number; by: string }[],
  refusal: null as string | null,
  refusalDetail: null as string | null,
};

export const releases: ReleaseRepository = {
  browseIndexesJson: async () => JSON.stringify([{ assessmentId: 'a/b', op: 'added' }]),
  summaryJson: async () =>
    JSON.stringify({
      fingerprint: FP,
      schemaVersion: 1,
      unpublished: [],
      marks: [],
      catalog: [],
      noteTypes: [],
      presets: [],
      decks: [],
      assessments: [],
      findings: [],
    }),
  itemsJson: async (assessment, kind, after) =>
    JSON.stringify({ items: [{ assessment, kind, after }], next: null }),
  textsJson: async () => JSON.stringify({ items: [], next: null }),
  media: async (after) =>
    after
      ? { keys: [], next: null }
      : { keys: ['cards/hay.webp', 'cards/falta.webp'], next: 'cards/falta.webp' },
  setMark: async (fingerprint, mark, checked, by) => {
    if (fingerprint !== FP) return 'stale';
    state.marks.push({ mark, checked, by });
    return checked ? [{ mark, checkedBy: by, checkedAt: '2026-11-07T12:00:00.000Z' }] : [];
  },
  publish: async (input) => {
    state.published.push(input);
    if (state.refusal) return { ok: false, reason: state.refusal, detail: state.refusalDetail };
    return {
      ok: true,
      result: {
        id: 7,
        title: input.title,
        publishedAt: '2026-11-07T12:00:00.000+00:00',
        changes: { notes: { insert: 1, update: 0, delete: 0 } },
      },
    };
  },
  revert: async (id, by) => {
    state.reverted.push({ id, by });
    if (state.refusal) return { ok: false, reason: state.refusal, detail: state.refusalDetail };
    return { ok: true, result: { id, revertedAt: '2026-11-07T12:05:00.000+00:00', changes: {} } };
  },
  log: async () => ({
    releases: [
      {
        id: 7,
        status: 'published',
        title: 'Biología celular · Certamen 2',
        schemaVersion: 1,
        publishedAt: '2026-11-07T12:00:00.000+00:00',
        publishedBy: ADMIN,
        revertedAt: null,
        revertedBy: null,
        changes: {},
        canRevert: true,
      },
    ],
  }),
};

export async function createDraftApp() {
  const pair = await generateKeyPair('ES256');
  const privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' };
  const app = createApp({
    verifier: supabaseVerifier({ supabaseUrl: SUPABASE, keys: createLocalJWKSet({ keys: [jwk] }) }),
    repository: memoryRepository(bundle('Traducción')),
    preview: memoryRepository(bundle('Traducción (borrador)')),
    media: {
      get: async (key) =>
        key === 'cards/hay.webp' ? { body: new Uint8Array([1]), contentType: 'image/webp' } : null,
    },
    signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    releases,
    admins: supabaseAdminChecker({
      supabaseUrl: SUPABASE,
      publishableKey: 'sb_publishable_x',
      fetch: async (_input, init) => {
        const auth = new Headers(init?.headers).get('Authorization') ?? '';
        const claims = JSON.parse(
          atob(auth.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')),
        ) as { email: string };
        const { email } = claims;
        return new Response(JSON.stringify(email === ADMIN), { status: 200 });
      },
    }),
  });
  const token = (email: string) =>
    new SignJWT({ email, role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setSubject(
        email === ADMIN
          ? '00000000-0000-4000-8000-000000000001'
          : '00000000-0000-4000-8000-000000000002',
      )
      .setIssuer(`${SUPABASE}/auth/v1`)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
  const request = async (
    path: string,
    email: string,
    headers: Record<string, string> = {},
    init: RequestInit = {},
  ) =>
    app.request(path, {
      ...init,
      headers: { Authorization: `Bearer ${await token(email)}`, ...headers },
    });
  return { app, privateKey, request };
}

export const titleOf = async (r: Response) =>
  Catalog.parse(await r.json()).semesters[0]!.courses[0]!.assessments[0]!.notes[0]!.title;
