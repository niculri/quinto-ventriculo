// Tests for the content repository against a fake PostgREST: the big reads the Worker passes on as they come.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../app';
import { MediaSigner } from '../../../services/mediaSigner';
import { failed, fakeContentClient, ok } from '../../../test/contentClient';
import { KEY, DECK, SECTION, startFakePostgrest } from '../../../test/postgrest';
import { supabaseRepository } from '../content';

let fake: Awaited<ReturnType<typeof startFakePostgrest>>;

beforeAll(async () => {
  fake = await startFakePostgrest();
});

afterAll(() => fake.close());

const app = () =>
  createApp({
    verifier: { verify: async () => ({ id: 'x', email: 'a@ug.uchile.cl' }) },
    repository: supabaseRepository(`${fake.base}/`, KEY),
    media: { get: async () => null },
    signer: new MediaSigner('secreto-solo-para-pruebas-0123456789abcdef'),
  });
const get = (path: string) => app().request(path, { headers: { Authorization: 'Bearer x' } });

describe('the big reads of the content database', () => {
  it('a deck goes out as the database wrote it, with the headers supabase-js sends', async () => {
    const r = await get('/api/decks/20');
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(await r.text()).toBe(`  ${DECK}`);
    const call = fake.seen.findLast((c) => c.path === '/rest/v1/rpc/anki_deck_detail')!;
    expect(JSON.parse(call.body)).toEqual({ deck_id: '20' });
    expect(call.headers.apikey).toBe(KEY);
    expect(call.headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it('a section of a test goes out as the database wrote it, with its photos signed', async () => {
    const r = await get('/api/quizzes/practica/sections/pautas');
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text.replace(/,"src": "[^"]+"/, '')).toBe(`  ${SECTION}`);
    expect(text).toMatch(
      /"media": "tests\/0123456789abcdef0123456789abcdef\.webp","src": "\/api\/media\/tests\//,
    );
    expect(JSON.parse(fake.seen.at(-1)!.body)).toEqual({
      quiz_id: 'practica',
      section_id: 'pautas',
    });
    expect((await get('/api/quizzes/practica/sections/nuevas')).status).toBe(404);
    expect((await get('/api/quizzes/otro')).status).toBe(404);
  });

  it('an article comes with its web code, version, dates, header and «Ponte a prueba»', async () => {
    const r = await get('/api/notes/08-expresion-genica');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      id: 'AP-BC-C2-08',
      code: 'QV-BC-C2-08',
      version: 2,
      publishedAt: '2026-11-01T12:00:00.000Z',
      versionAt: '2026-11-03T12:00:00.000Z',
      header: { number: '8', lecturer: 'Dra. Ana Prueba D.', term: 'spring', year: 2026 },
      practice: { quizId: 'practica', section: 'nuevas', groups: ['01'] },
    });
    const select = new URL(`http://x${fake.seen.at(-1)!.url}`).searchParams.get('select');
    expect(select?.split(',')).toEqual(
      expect.arrayContaining(['code', 'version', 'published_at', 'version_at', 'document']),
    );
  });

  it("the catalog's notes bring the version and its dates (the course's list shows them)", async () => {
    expect((await get('/api/catalog')).status).toBe(200);
    const call = fake.seen.find((c) => c.path === '/rest/v1/notes' && !c.url.includes('slug=eq.'));
    const select = new URL(`http://x${call!.url}`).searchParams.get('select');
    expect(select?.split(',')).toEqual(
      expect.arrayContaining(['code', 'version', 'published_at', 'version_at']),
    );
  });

  it('the catalog asks for the card browser indexes; a database without them still has a catalog', async () => {
    fake.seen.length = 0;
    expect((await get('/api/catalog')).status).toBe(200);
    expect(fake.seen.map((c) => c.path)).toContain('/rest/v1/rpc/anki_browse_indexes');
    fake.setIndexes(false);
    const original = console.error;
    const errors: unknown[] = [];
    console.error = (...a: unknown[]) => errors.push(a);
    try {
      expect((await get('/api/catalog')).status).toBe(200);
    } finally {
      console.error = original;
      fake.setIndexes(true);
    }
    expect(String(errors[0])).toMatch(/browse indexes/);
  });

  it('the cards that moved or were taken out, a page from the cursor', async () => {
    const r = await get('/api/anki/card-changes?since=41');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      changes: [{ noteGuid: 'a', ord: 0, deckId: null }],
      next: 42,
      latest: 42,
      more: false,
    });
    expect(JSON.parse(fake.seen.at(-1)!.body)).toEqual({ since: 41, max_rows: 2000 });
  });

  it('a deck the database does not have: 404', async () => {
    expect((await get('/api/decks/999')).status).toBe(404);
  });

  it('a deck from the course level down is passed on as it comes; the root and a semester are a 404', async () => {
    expect(
      await Promise.all(
        ['1', '2', '21', '999'].map(async (id) => (await get(`/api/decks/${id}`)).status),
      ),
    ).toEqual([404, 404, 200, 404]);
  });

  it('the route that sent every note is gone', async () => {
    expect((await get('/api/anki/notes')).status).toBe(404);
  });

  it('the catalog brings every deck of the tree, past the 1000 rows PostgREST gives at once', async () => {
    const r = await get('/api/catalog');
    expect(r.status).toBe(200);
    const c = await r.json<{ anki: { decks: { id: string }[] } }>();
    expect(c.anki.decks).toHaveLength(2500);
    expect(new Set(c.anki.decks.map((d) => d.id)).size).toBe(2500);
  });

  it('an error of the database is a 500 without its message', async () => {
    const broken = createApp({
      verifier: { verify: async () => ({ id: 'x', email: 'a@ug.uchile.cl' }) },
      repository: supabaseRepository(`${fake.base}/nada`, KEY),
      media: { get: async () => null },
      signer: new MediaSigner('secreto-solo-para-pruebas-0123456789abcdef'),
    });
    const original = console.error;
    console.error = () => {};
    const r = await broken.request('/api/decks/20', { headers: { Authorization: 'Bearer x' } });
    console.error = original;
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain('no existe');
  });
});

describe('the reads of the repository, with a client that answers what the test says', () => {
  const NOTE_ROW = {
    id: 'AP-BC-C2-01',
    slug: 'uno',
    course_id: 'curso',
    assessment_id: 'curso/c1',
    kind: 'lecture',
    title: 'Uno',
    subtitle: null,
    position: 1,
    updated_at: '2026-10-31T12:00:00+00:00',
    code: null,
    version: 0,
    published_at: null,
    version_at: null,
    document: null as unknown,
  };
  const repo = (answers: Parameters<typeof fakeContentClient>[0]) =>
    supabaseRepository('https://c.example.co', 'k', 'public', fakeContentClient(answers).client);

  afterEach(() => vi.unstubAllGlobals());

  it('a note without a document is a note without text, sources or index', async () => {
    const note = await repo({ 'from:notes': ok(NOTE_ROW) }).note('uno');
    expect(note).toMatchObject({ html: '', toc: [], sources: [] });
    expect(note).not.toHaveProperty('createdOn');
    expect(note).not.toHaveProperty('practice');
  });

  it('a note that is not there is null', async () => {
    expect(await repo({ 'from:notes': ok(null) }).note('nada')).toBeNull();
  });

  it('the date of creation and the practice test of a document go to the note', async () => {
    const document = {
      html: '<p>x</p>',
      createdOn: '2026-10-01',
      practice: { quizId: 'q', section: 's', groups: ['01'] },
    };
    const note = await repo({ 'from:notes': ok({ ...NOTE_ROW, document }) }).note('uno');
    expect(note).toMatchObject({ html: '<p>x</p>', createdOn: '2026-10-01' });
    expect(note).toMatchObject({ practice: { quizId: 'q' } });
  });

  it('the courses, a deck’s course (null if it has none or does not exist) and a missing quiz', async () => {
    const r = repo({
      'from:courses': ok([{ id: 'curso', semester: 2, name: 'Curso', emoji: '🧬', position: 1 }]),
      'from:anki_decks': (asked) =>
        asked.filters.includes('id=con')
          ? ok({ course_id: 'curso' })
          : asked.filters.includes('id=raiz')
            ? ok({ course_id: null })
            : ok(null),
      'rpc:quiz_detail': ok(null),
      'rpc:anki_card': ok(null),
    });
    expect(await r.courses()).toEqual([
      { id: 'curso', semester: 2, name: 'Curso', emoji: '🧬', position: 1 },
    ]);
    expect(await r.deckCourse('con')).toBe('curso');
    expect(await r.deckCourse('raiz')).toBeNull();
    expect(await r.deckCourse('nada')).toBeNull();
    expect(await r.quiz('nada')).toBeNull();
    expect(await r.card('guid', 0)).toBeNull();
  });

  it('a card is read as the database wrote it, and a row that is not a card is an error', async () => {
    const card = {
      noteGuid: 'g1',
      ord: 0,
      deckId: '20',
      code: null,
      version: null,
      kind: 'basic',
      front: '<p>f</p>',
      back: '<p>b</p>',
      css: '',
    };
    expect(await repo({ 'rpc:anki_card': ok(card) }).card('g1', 0)).toEqual(card);
    await expect(
      repo({ 'rpc:anki_card': ok({ ...card, ord: -1 }) }).card('g1', 0),
    ).rejects.toThrow();
  });

  it('a quiz row that is not a whole test is an error, not a half-made test', async () => {
    await expect(repo({ 'rpc:quiz_detail': ok({ id: 'q' }) }).quiz('q')).rejects.toThrow();
  });

  it('a failed read says which one', async () => {
    const r = repo({ 'from:courses': failed('caído'), 'rpc:anki_card': failed('caído') });
    await expect(r.courses()).rejects.toThrow('Content database (courses): caído');
    await expect(r.card('g', 0)).rejects.toThrow('Content database (card): caído');
  });

  it('the search for a course list asks the function that names them, and without it the older one', async () => {
    const { client, calls } = fakeContentClient({
      'rpc:search_notes_except': ok([]),
      'rpc:search_notes': ok([]),
    });
    const r = supabaseRepository('https://c.example.co', 'k', 'public', client);
    await r.search('ribo', 5, ['a', 'b']);
    await r.search('ribo', 5, []);
    await r.search('ribo', 5);
    expect(calls.map((c) => [c.key, c.args])).toEqual([
      ['rpc:search_notes_except', { query: 'ribo', max_results: 5, excluded_courses: ['a', 'b'] }],
      ['rpc:search_notes', { query: 'ribo', max_results: 5 }],
      ['rpc:search_notes', { query: 'ribo', max_results: 5 }],
    ]);
  });

  const level = (courseId: string | null) => ({
    'from:anki_decks': ok(courseId === null ? null : { course_id: courseId }),
  });
  const stubBody = () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"id":"x"}'));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal('fetch', async () => new Response(body));
    return () => cancelled;
  };

  it('a deck without a course level is null, and its body is not left open', async () => {
    const cancelled = stubBody();
    expect(await repo(level(null)).deckJson('raiz')).toBeNull();
    expect(cancelled()).toBe(true);
  });

  it('a deck whose level could not be read is an error, and its body is not left open', async () => {
    const cancelled = stubBody();
    const r = repo({ 'from:anki_decks': failed('caído') });
    await expect(r.deckJson('x')).rejects.toThrow('Content database (deck level): caído');
    expect(cancelled()).toBe(true);
  });
});
