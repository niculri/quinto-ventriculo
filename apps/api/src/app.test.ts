import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import type { CryptoKey as JoseKey } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BrowseData,
  CardChanges,
  CardDetail,
  Catalog,
  DeckDetail,
  Note,
  QuizDetail,
  QuizIndex,
  QuizSectionDetail,
  SearchResponse,
} from '@qv/schema';
import type { ContentBundle, ImportedQuiz } from '@qv/schema';
import { createApp } from './app';
import { MediaSigner } from './media';
import type { MediaStore } from './media';
import { memoryRepository } from './repositories/memory';
import { supabaseVerifier } from './session';

const SUPABASE = 'https://users.supabase.co';
const NOW = 1_793_448_000; // 2026-10-31 12:00 UTC, in seconds
const KEY = 'notes/0123456789abcdef0123456789abcdef.webp';
const CARD_KEY = 'cards/0123456789abcdef0123456789abcdef.webp';
const QUIZ_KEY = 'tests/0123456789abcdef0123456789abcdef.webp';

const colors = (c: string) =>
  Object.fromEntries(['ac', 'ac-b', 'ac2', 'ac2-b', 'on-ac', 'g1', 'g2', 'g3'].map((k) => [k, c]));
const QUIZ: ImportedQuiz = {
  id: 'practica-biocel',
  slug: 'practica',
  courseId: 'biologia-celular',
  assessmentId: 'biologia-celular/certamen-2',
  title: 'Práctica de Biocel',
  position: 1,
  questionCount: 3,
  sectionCount: 2,
  updatedAt: '2026-10-31T12:00:00.000Z',
  kicker: 'Certamen 2',
  heading: 'Practica',
  footer: '',
  theme: { light: colors('#1F6F75'), dark: colors('#6CC3C8') } as ImportedQuiz['theme'],
  sections: [
    {
      id: 'pautas',
      name: 'Pautas',
      description: 'Dos preguntas',
      groupsTitle: 'Qué temas practicar',
      questionCount: 2,
      hasChoices: true,
      groups: [
        {
          id: '01',
          name: 'Uno',
          questions: [
            {
              id: 'D-p01-03',
              kind: 'choice',
              // A text that looks like the key of an image is not signed: its quotes are escaped.
              prompt: 'Un texto con "media":"tests/ffffffffffffffffffffffffffffffff.webp"',
              options: ['a', 'b'],
              correct: 1,
              figures: [
                { kind: 'image', media: QUIZ_KEY, width: 10, height: 10, alt: 'Foto' },
                { kind: 'svg', svg: '<svg viewBox="0 0 1 1"></svg>' },
              ],
              figureBeside: true,
              fixedOrder: false,
            },
            {
              id: 'D-p02-04',
              kind: 'choice',
              prompt: '¿Dos?',
              options: ['a', 'b'],
              correct: 0,
              figures: [{ kind: 'image', media: QUIZ_KEY, width: 10, height: 10, alt: 'Otra vez' }],
              figureBeside: false,
              fixedOrder: false,
            },
          ],
        },
      ],
    },
    {
      id: 'nuevas',
      name: 'Nuevas',
      description: 'Una',
      groupsTitle: 'Qué clases',
      questionCount: 1,
      hasChoices: false,
      groups: [
        {
          id: '01',
          name: 'Uno',
          questions: [
            {
              id: 'N01-01',
              kind: 'short',
              prompt: '¿Tres?',
              answer: 'Sí',
              figures: [],
              figureBeside: false,
            },
          ],
        },
      ],
    },
  ],
  hash: 'q',
  media: [QUIZ_KEY],
};

const bundle: ContentBundle = {
  semesters: [
    { number: 1, name: '1° Semestre' },
    { number: 2, name: '2° Semestre' },
  ],
  courses: [
    { id: 'biologia-celular', semester: 2, name: 'Biología celular', emoji: '🧬', position: 2 },
    { id: 'anatomia-2', semester: 2, name: 'Anatomía II', emoji: '🦴', position: 1 },
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
      title: 'Traducción',
      position: 5,
      updatedAt: '2026-10-31T12:00:00.000Z',
      sources: [],
      html: `<p>El ribosoma.</p><figure class="figure"><img data-media="${KEY}" alt="x"></figure><img data-media="../malo">`,
      toc: [],
      sections: [
        {
          anchor: 'ribosomas',
          title: 'Los ribosomas',
          level: 2,
          text: 'Tienen dos subunidades: la menor lee el mRNA.',
        },
        {
          anchor: 'nucleolo',
          title: 'Nucléolo',
          level: 2,
          text: 'Ahí se arman las subunidades ribosómicas.',
        },
      ],
      hash: 'h',
      media: [KEY],
    },
  ],
  ankiNoteTypes: [
    {
      id: '1',
      name: 'Básica',
      kind: 'normal',
      occlusion: false,
      fields: ['Frente', 'Reverso'],
      templates: [{ name: 'Directa', qfmt: '{{Frente}}', afmt: '{{FrontSide}}{{Reverso}}' }],
      css: '.card { color: red; }',
      sortField: 0,
    },
    {
      id: '2',
      name: 'Oclusión',
      kind: 'cloze',
      occlusion: true,
      fields: ['Oclusión', 'Imagen'],
      templates: [{ name: 'Oclusión', qfmt: '', afmt: '' }],
      css: '#image-occlusion-canvas {}',
      sortField: 0,
    },
  ],
  ankiPresets: [{ name: 'Default', config: { new: { perDay: 20 } } }],
  ankiDecks: [
    {
      id: '20',
      name: 'Raíz::Mazo',
      description: '',
      parentId: null,
      semester: 2,
      courseId: 'biologia-celular',
      assessmentId: 'biologia-celular/certamen-2',
      preset: 'Default',
      position: 0,
    },
    {
      id: '21',
      name: 'Raíz::Mazo::Extras',
      description: '',
      parentId: '20',
      semester: 2,
      courseId: 'biologia-celular',
      assessmentId: 'biologia-celular/certamen-2',
      preset: 'Default',
      position: 0,
    },
  ],
  ankiNotes: [
    {
      guid: 's@/AqX%n?#',
      noteTypeId: '1',
      fields: { Frente: '¿Cuántas?', Reverso: '7' },
      tags: [],
      code: 'T-PR-01-002',
      version: 1,
      createdAt: '2026-10-08T12:00:00.000Z',
      cards: [
        {
          ord: 0,
          deckId: '21',
          frontHtml: '<p>¿Cuántas?</p>',
          backHtml: '<p>7</p>',
          sortField: '¿Cuántas?',
        },
      ],
      hash: 'a',
      updatedAt: '2026-10-31T12:00:00.000Z',
      media: [],
    },
    {
      guid: 'oclusion-1',
      noteTypeId: '2',
      fields: { Oclusión: '{{c1::image-occlusion:rect}}', Imagen: '<img src="a.png">' },
      tags: ['columna'],
      code: 'T-PR-01-001',
      version: 2,
      createdAt: null,
      cards: [0, 1].map((ord) => ({
        ord,
        deckId: '20',
        frontHtml: `<img data-media="${CARD_KEY}"><div class="cloze" data-ordinal="${ord + 1}"></div>`,
        backHtml: `<img data-media="${CARD_KEY}">`,
        sortField: 'Vértebra',
      })),
      hash: 'b',
      updatedAt: '2026-10-31T12:00:00.000Z',
      media: [CARD_KEY],
    },
  ],
  quizzes: [QUIZ],
};

const media: MediaStore = {
  get: async (key) =>
    key === KEY
      ? { body: new Uint8Array([1, 2, 3]), contentType: 'image/webp', etag: '"e1"' }
      : null,
};

let privateKey: JoseKey;
let app: ReturnType<typeof createApp>;
const signer = new MediaSigner('secreto-de-prueba-0123456789-0123456789');

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' };
  app = createApp({
    verifier: supabaseVerifier({
      supabaseUrl: SUPABASE,
      keys: createLocalJWKSet({ keys: [jwk] }),
    }),
    repository: memoryRepository(bundle),
    media,
    signer,
    now: () => NOW,
  });
});

async function token(
  changes: Record<string, unknown> = {},
  op: { iss?: string; aud?: string; exp?: number } = {},
) {
  return new SignJWT({ email: 'ana@ug.uchile.cl', role: 'authenticated', ...changes })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setSubject('00000000-0000-4000-8000-00000000000a')
    .setIssuer(op.iss ?? `${SUPABASE}/auth/v1`)
    .setAudience(op.aud ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(op.exp ?? Math.floor(Date.now() / 1000) + 3600)
    .sign(privateKey);
}

const get = async (path: string, t?: string) =>
  app.request(path, t ? { headers: { Authorization: `Bearer ${t}` } } : {});

describe('session', () => {
  it('/api/health answers without a session', async () => {
    const r = await get('/api/health');
    expect(r.status).toBe(200);
    // Without the version binding (tests, `wrangler dev`), only { ok: true }.
    expect(await r.json()).toEqual({ ok: true });
  });

  it('/api/health shows the version of the Worker and nothing else', async () => {
    const versioned = createApp({
      verifier: supabaseVerifier({ supabaseUrl: SUPABASE, keys: createLocalJWKSet({ keys: [] }) }),
      repository: memoryRepository(bundle),
      media,
      signer,
      version: '5fccf437-b1b7-49a4-93b2-80a5ac7b1f63',
    });
    const r = await versioned.request('/api/health');
    expect(await r.json()).toEqual({ ok: true, version: '5fccf437-b1b7-49a4-93b2-80a5ac7b1f63' });
  });

  it('without a token, 401 in Spanish', async () => {
    const r = await get('/api/catalog');
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({
      error: 'unauthenticated',
      message: 'Entra con tu cuenta @ug.uchile.cl para ver esto.',
    });
  });

  it.each([
    ['garbage', async () => 'no-es-un-jwt'],
    ['gmail email', () => token({ email: 'ana@gmail.com' })],
    ['subdomain email', () => token({ email: 'ana@x.ug.uchile.cl' })],
    ['without email', () => token({ email: undefined })],
    ['anon role', () => token({ role: 'anon' })],
    ['another issuer', () => token({}, { iss: 'https://otro.supabase.co/auth/v1' })],
    ['another audience', () => token({}, { aud: 'otra' })],
    ['expired', () => token({}, { exp: Math.floor(Date.now() / 1000) - 3600 })],
  ])('rejects a token: %s', async (_, create) => {
    expect((await get('/api/catalog', await create())).status).toBe(401);
  });

  it('rejects a token signed with another key', async () => {
    const other = await generateKeyPair('ES256');
    const t = await new SignJWT({ email: 'ana@ug.uchile.cl', role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setSubject('x')
      .setIssuer(`${SUPABASE}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(other.privateKey);
    expect((await get('/api/catalog', t)).status).toBe(401);
  });

  it('rejects HS256 if no secret is configured', async () => {
    const t = await new SignJWT({ email: 'ana@ug.uchile.cl', role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('x')
      .setIssuer(`${SUPABASE}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('cualquier-secreto'));
    expect((await get('/api/catalog', t)).status).toBe(401);
  });

  it('/api/me returns the user', async () => {
    const r = await get('/api/me', await token());
    expect(await r.json()).toEqual({
      id: '00000000-0000-4000-8000-00000000000a',
      email: 'ana@ug.uchile.cl',
    });
    expect(r.headers.get('Cache-Control')).toBe('private, max-age=60');
  });
});

describe('content', () => {
  it('nested and sorted catalog', async () => {
    const r = await get('/api/catalog', await token());
    const c = Catalog.parse(await r.json());
    expect(c.semesters.map((s) => s.number)).toEqual([1, 2]);
    expect(c.semesters[1]!.courses.map((x) => x.id)).toEqual(['anatomia-2', 'biologia-celular']);
    expect(c.semesters[1]!.courses[1]!.assessments[0]!.notes[0]).not.toHaveProperty('html');
  });

  it('note with signed images and without invalid keys', async () => {
    const r = await get('/api/notes/11-traduccion', await token());
    const n = Note.parse(await r.json());
    expect(n.html).not.toContain('data-media="');
    expect(n.html).toMatch(new RegExp(`src="/api/media/${KEY}\\?e=\\d+&amp;s=[\\w-]+"`));
    expect(n.html).toContain('data-media-invalid=""');
  });

  it('404 and 400 for notes that do not exist or odd slugs', async () => {
    const t = await token();
    expect((await get('/api/notes/no-existe', t)).status).toBe(404);
    expect((await get('/api/notes/..%2Fsecreto', t)).status).toBe(400);
  });

  it('search without accents and with highlights', async () => {
    const r = await get('/api/search?q=nucleolo', await token());
    const b = SearchResponse.parse(await r.json());
    expect(b.results.map((x) => x.anchor)).toEqual(['nucleolo']);
    const r2 = SearchResponse.parse(
      await (await get('/api/search?q=subunid', await token())).json(),
    );
    expect(r2.results[0]!.snippet).toContain('⟦subunidades');
  });

  it('a very short query = no results', async () => {
    const b = SearchResponse.parse(await (await get('/api/search?q=a', await token())).json());
    expect(b.results).toEqual([]);
  });

  it('404 in JSON for unknown routes', async () => {
    const r = await get('/api/nada', await token());
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ error: 'not_found' });
  });
});

describe('decks and cards', () => {
  it('the catalog brings the whole deck tree with its counts, the presets and the note types', async () => {
    const c = Catalog.parse(await (await get('/api/catalog', await token())).json());
    expect(c.semesters[1]!.courses[1]!.assessments[0]!.cardCount).toBe(3);
    expect(c.anki.decks).toEqual([
      {
        id: '20',
        name: 'Raíz::Mazo',
        parentId: null,
        preset: 'Default',
        semester: 2,
        courseId: 'biologia-celular',
        assessmentId: 'biologia-celular/certamen-2',
        noteCount: 2,
        cardCount: 3,
        // Step 3.2: the notes with a card in the deck itself, all in it, and all in it or below it.
        ownNoteCount: 1,
        exclusiveNoteCount: 1,
        closedNoteCount: 1,
      },
      {
        id: '21',
        name: 'Raíz::Mazo::Extras',
        parentId: '20',
        preset: 'Default',
        semester: 2,
        courseId: 'biologia-celular',
        assessmentId: 'biologia-celular/certamen-2',
        noteCount: 1,
        cardCount: 1,
        ownNoteCount: 1,
        exclusiveNoteCount: 1,
        closedNoteCount: 1,
      },
    ]);
    expect(c.anki.presets).toEqual([{ name: 'Default', config: { new: { perDay: 20 } } }]);
    expect(c.anki.noteTypes.map((t) => [t.name, t.templates, t.fields])).toEqual([
      ['Básica', ['Directa'], ['Frente', 'Reverso']],
      ['Oclusión', ['Oclusión'], ['Oclusión', 'Imagen']],
    ]);
  });

  it('every note for the browser: plain text, tags, cards; no HTML', async () => {
    const r = await get('/api/anki/notes', await token());
    const b = BrowseData.parse(await r.json());
    expect(b.notes).toEqual([
      {
        guid: 'oclusion-1',
        noteTypeId: '2',
        tags: ['columna'],
        code: 'T-PR-01-001',
        version: 2,
        createdAt: null,
        fields: ['{{c1::image-occlusion:rect}}', ''],
        sortField: 'Vértebra',
        cards: [
          { ord: 0, deckId: '20' },
          { ord: 1, deckId: '20' },
        ],
      },
      {
        guid: 's@/AqX%n?#',
        noteTypeId: '1',
        tags: [],
        code: 'T-PR-01-002',
        version: 1,
        createdAt: '2026-10-08T12:00:00.000Z',
        fields: ['¿Cuántas?', '7'],
        sortField: '¿Cuántas?',
        cards: [{ ord: 0, deckId: '21' }],
      },
    ]);
    expect(r.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(r.headers.get('Cache-Control')).toBe('private, max-age=60');
    expect((await get('/api/anki/notes')).status).toBe(401);
  });

  it('a deck: subdecks and cards sorted by code and ord', async () => {
    const r = await get('/api/decks/20', await token());
    const d = DeckDetail.parse(await r.json());
    expect(d).toMatchObject({ name: 'Mazo', fullName: 'Raíz::Mazo', noteCount: 2, cardCount: 3 });
    expect(d.subdecks).toEqual([
      { id: '21', name: 'Extras', parentId: '20', preset: 'Default', cardCount: 1 },
    ]);
    expect(d.cards.map((x) => [x.code, x.ord, x.kind, x.deckId])).toEqual([
      ['T-PR-01-001', 0, 'occlusion', '20'],
      ['T-PR-01-001', 1, 'occlusion', '20'],
      ['T-PR-01-002', 0, 'basic', '21'],
    ]);
    // The author's presets as the package brings them, for the scheduler (v1.2).
    expect(d.presets).toEqual([{ name: 'Default', config: { new: { perDay: 20 } } }]);
  });

  it('a card with signed images, its CSS and its kind; odd guids travel encoded', async () => {
    const t = await token();
    const io = CardDetail.parse(await (await get('/api/cards/oclusion-1/1', t)).json());
    expect(io).toMatchObject({ kind: 'occlusion', css: '#image-occlusion-canvas {}', ord: 1 });
    expect(io.front).toMatch(new RegExp(`src="/api/media/${CARD_KEY}\\?e=\\d+&amp;s=[\\w-]+"`));
    expect(io.back).not.toContain('data-media="');
    const odd = await get(`/api/cards/${encodeURIComponent('s@/AqX%n?#')}/0`, t);
    expect(odd.status).toBe(200);
    expect(CardDetail.parse(await odd.json())).toMatchObject({
      noteGuid: 's@/AqX%n?#',
      back: '<p>7</p>',
    });
  });

  it('404, 400 and 401', async () => {
    const t = await token();
    expect((await get('/api/decks/999', t)).status).toBe(404);
    expect((await get('/api/decks/abc', t)).status).toBe(400);
    expect((await get('/api/cards/oclusion-1/9', t)).status).toBe(404);
    expect((await get('/api/cards/oclusion-1/x', t)).status).toBe(400);
    expect((await get(`/api/cards/${encodeURIComponent('con espacio')}/0`, t)).status).toBe(400);
    expect((await get('/api/decks/20')).status).toBe(401);
    expect((await get('/api/cards/oclusion-1/0')).status).toBe(401);
  });
});

describe('cards that moved or were taken out', () => {
  it('a bundle (one import) has none: the cursor stays where it was', async () => {
    const t = await token();
    const r = await get('/api/anki/card-changes?since=12', t);
    expect(r.status).toBe(200);
    expect(CardChanges.parse(await r.json())).toEqual({
      changes: [],
      next: 12,
      latest: 0,
      more: false,
    });
    expect(await (await get('/api/anki/card-changes', t)).json()).toMatchObject({ next: 0 });
  });

  it('an odd cursor: 400; without a session: 401', async () => {
    const t = await token();
    for (const since of ['-1', 'x', '1.5', '9'.repeat(16)]) {
      const r = await get(`/api/anki/card-changes?since=${since}`, t);
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ error: 'invalid_since' });
    }
    expect((await get('/api/anki/card-changes?since=0')).status).toBe(401);
  });
});

describe('images', () => {
  const signedUrl = async () => {
    const n = Note.parse(await (await get('/api/notes/11-traduccion', await token())).json());
    return n.html.match(/src="([^"]+)"/)![1]!.replace(/&amp;/g, '&');
  };

  it('are served with the signed URL, without a session', async () => {
    const r = await get(await signedUrl());
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('image/webp');
    // At most 10 minutes, even though the signature lasts longer (step 1.5).
    expect(r.headers.get('Cache-Control')).toBe('private, max-age=600, immutable');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('without a signature, with a tampered or expired one: 403', async () => {
    const url = await signedUrl();
    expect((await get(`/api/media/${KEY}`)).status).toBe(403);
    expect((await get(url.replace(/s=.{4}/, 's=AAAA'))).status).toBe(403);
    expect((await get(url.replace(/e=\d+/, `e=${NOW + 99_999}`))).status).toBe(403);
    const expired = `/api/media/${KEY}?e=${NOW - 1}&s=${await signer.sign(KEY, NOW - 1)}`;
    expect((await get(expired)).status).toBe(403);
  });

  it('the signature of one image does not work for another', async () => {
    const url = await signedUrl();
    const other = url.replace(KEY, 'notes/ffffffffffffffffffffffffffffffff.webp');
    expect((await get(other)).status).toBe(403);
  });

  it('invalid keys: 400', async () => {
    expect((await get('/api/media/notes/..%2F..%2Fsecreto?e=1&s=x')).status).toBe(400);
    expect((await get('/api/media/ARRIBA.webp?e=1&s=x')).status).toBe(400);
  });

  it('signed image that does not exist: 404', async () => {
    const key = 'notes/ffffffffffffffffffffffffffffffff.webp';
    const e = NOW + 3600;
    expect((await get(`/api/media/${key}?e=${e}&s=${await signer.sign(key, e)}`)).status).toBe(404);
  });
});

describe('practice tests', () => {
  it('the catalog lists them in their assessment', async () => {
    const r = await get('/api/catalog', await token());
    const c = Catalog.parse(await r.json());
    const a = c.semesters[1]!.courses.find((x) => x.id === 'biologia-celular')!.assessments[0]!;
    expect(a.quizzes.map((q) => [q.slug, q.title, q.questionCount, q.sectionCount])).toEqual([
      ['practica', 'Práctica de Biocel', 3, 2],
    ]);
  });

  it('the index of a course or an assessment', async () => {
    const t = await token();
    const all = QuizIndex.parse(await (await get('/api/quizzes', t)).json());
    expect(all.quizzes.map((q) => q.id)).toEqual(['practica-biocel']);
    const byCourse = QuizIndex.parse(
      await (await get('/api/quizzes?course=biologia-celular', t)).json(),
    );
    expect(byCourse.quizzes).toHaveLength(1);
    const other = QuizIndex.parse(
      await (await get('/api/quizzes?assessment=anatomia-2/certamen-1', t)).json(),
    );
    expect(other.quizzes).toEqual([]);
  });

  it('a test: its sections and groups, without the questions', async () => {
    const r = await get('/api/quizzes/practica-biocel', await token());
    expect(r.status).toBe(200);
    const body = await r.text();
    const q = QuizDetail.parse(JSON.parse(body));
    expect(q.sections.map((s) => [s.id, s.groups.map((g) => g.questionCount)])).toEqual([
      ['pautas', [2]],
      ['nuevas', [1]],
    ]);
    expect(body).not.toContain('¿Dos?');
    expect(body).not.toContain('"hash"');
  });

  it('a section, with a signed URL for each photo and the texts as they are', async () => {
    const r = await get('/api/quizzes/practica-biocel/sections/pautas', await token());
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/json');
    const s = QuizSectionDetail.parse(await r.json());
    const [q1, q2] = s.groups[0]!.questions;
    const img = q1!.figures[0]!;
    expect(img.kind === 'image' && img.src).toMatch(
      new RegExp(`^/api/media/${QUIZ_KEY}\\?e=\\d+&s=[A-Za-z0-9_-]+$`),
    );
    expect(q2!.figures[0]).toMatchObject({
      kind: 'image',
      src: img.kind === 'image' ? img.src : '',
    });
    expect(q1!.prompt).toBe('Un texto con "media":"tests/ffffffffffffffffffffffffffffffff.webp"');
    expect(q1!.figures[1]).toEqual({ kind: 'svg', svg: '<svg viewBox="0 0 1 1"></svg>' });
    // The signed URL opens the image.
    const media = await get(img.kind === 'image' ? img.src! : '');
    expect(media.status).not.toBe(400);
  });

  it('signs the keys of a section as the database writes it (with spaces)', async () => {
    const text =
      '{"groups": [{"figures": [{"alt": "x", "kind": "image", "media": "' + QUIZ_KEY + '"}]}]}';
    const signed = await signer.signJsonMedia(text, NOW);
    const parsed = JSON.parse(signed) as { groups: { figures: { src: string }[] }[] };
    expect(parsed.groups[0]!.figures[0]!.src).toBe(await signer.url(QUIZ_KEY, NOW));
    expect(await signer.signJsonMedia('{"media": "../../secreto"}', NOW)).toBe(
      '{"media": "../../secreto"}',
    );
  });

  it('a test or section that does not exist: 404; an invalid one: 400; without a session: 401', async () => {
    const t = await token();
    expect((await get('/api/quizzes/nada', t)).status).toBe(404);
    expect((await get('/api/quizzes/practica-biocel/sections/nada', t)).status).toBe(404);
    expect((await get('/api/quizzes/Con%20Espacio', t)).status).toBe(400);
    expect((await get('/api/quizzes/practica-biocel/sections/X_Y', t)).status).toBe(400);
    expect((await get('/api/quizzes/practica-biocel')).status).toBe(401);
    expect((await get('/api/quizzes/practica-biocel/sections/pautas')).status).toBe(401);
    expect((await get('/api/quizzes')).status).toBe(401);
  });
});

describe('errors', () => {
  it('500 without leaking the internal message', async () => {
    const broken = createApp({
      verifier: { verify: async () => ({ id: 'x', email: 'a@ug.uchile.cl' }) },
      repository: {
        catalog: async () => {
          throw new Error('clave secreta en el mensaje');
        },
        note: async () => null,
        search: async () => [],
        deckJson: async () => null,
        card: async () => null,
        cardChanges: async () => ({ changes: [], next: 0, latest: 0, more: false }),
        browseJson: async () => '{"notes":[]}',
        quizzes: async () => [],
        quiz: async () => null,
        quizSectionJson: async () => null,
      },
      media,
      signer,
    });
    const original = console.error;
    console.error = () => {};
    const r = await broken.request('/api/catalog', { headers: { Authorization: 'Bearer x' } });
    console.error = original;
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain('secreta');
  });

  it('the image secret has to be long', () => {
    expect(() => new MediaSigner('corto')).toThrow(/32 caracteres/);
  });
});
