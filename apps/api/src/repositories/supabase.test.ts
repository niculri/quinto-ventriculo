/**
 * The Supabase repository against a fake PostgREST (a local HTTP server): the big reads (a deck, every note
 * of the browser) go out as the database wrote them, without being parsed, with supabase-js' headers.
 */
import { createServer } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { MediaSigner } from '../media';
import { nonNull } from './stream';
import { supabaseReleaseRepository, supabaseRepository } from './supabase';

const KEY = 'sb_secret_prueba';
const DECK = '{"id":"20","name":"Mazo","cards":[]}';
const BROWSE = '{"notes":[{"guid":"g"}]}';

const TABLES = [
  'semesters',
  'courses',
  'assessments',
  'notes',
  'anki_presets',
  'anki_note_types',
  'quizzes',
].map((t) => `/rest/v1/${t}`);
/** A section of a test as Postgres writes jsonb (a space after each colon), with a photo. */
const SECTION =
  '{"quizId": "practica", "sectionId": "pautas", "groups": [{"id": "01", "name": "Uno", "questions": [{"id": "A-1", "kind": "short", "prompt": "¿Sí?", "answer": "Sí", "figures": [{"alt": "", "kind": "image", "media": "tests/0123456789abcdef0123456789abcdef.webp", "width": 2, "height": 2}], "figureBeside": false}]}]}';
/** A tree of 2500 decks: the root and its children. */
const TREE = Array.from({ length: 2500 }, (_, i) => ({
  id: String(1_000_000_000_000_000_000n + BigInt(i)),
  name: i === 0 ? 'R' : `R::${String(i).padStart(4, '0')}`,
  parent: i === 0 ? null : '1000000000000000000',
  preset: 'Default',
  semester: null,
  course_id: null,
  assessment_id: null,
  note_count: 0,
  card_count: 0,
}));

/** An article as the notes table has it (v1.5): code, version and dates in columns, the rest in the document. */
const ARTICLE_ROW = {
  id: 'AP-BC-C2-08',
  slug: '08-expresion-genica',
  course_id: 'biologia-celular',
  assessment_id: 'biologia-celular/certamen-2',
  kind: 'lecture',
  title: 'Expresión génica',
  subtitle: null,
  position: 2,
  updated_at: '2026-11-03T12:00:00+00:00',
  code: 'QV-BC-C2-08',
  version: 2,
  published_at: '2026-11-01T12:00:00+00:00',
  version_at: '2026-11-03T12:00:00+00:00',
  document: {
    sources: ['Clase 8, semestre de primavera 2026.'],
    html: '<p>Hola</p>',
    toc: [],
    header: { number: '8', lecturer: 'Dra. Ana Prueba D.', term: 'spring', year: 2026 },
    practice: { quizId: 'practica', section: 'nuevas', groups: ['01'] },
  },
};

/** Step 3.3: whether the content database has `anki_browse_indexes()` (one before its migration does not). */
let withIndexes = true;
let server: Server;
let base = '';
const seen: { path: string; url: string; headers: IncomingHttpHeaders; body: string }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      const path = (req.url ?? '').split('?')[0]!;
      seen.push({ path, url: req.url ?? '', headers: req.headers, body });
      const send = (status: number, text: string) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        // In pieces, as a big body arrives: the first one only spaces.
        res.write('  ');
        res.end(text);
      };
      if (path === '/rest/v1/rpc/anki_deck_tree') {
        // As PostgREST with Supabase's «Max rows»: never more than 1000 rows, whatever is asked.
        const url = new URL(req.url ?? '', 'http://x');
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Math.min(1000, Number(url.searchParams.get('limit') ?? 1000));
        send(200, JSON.stringify(TREE.slice(offset, offset + limit)));
      } else if (path === '/rest/v1/notes' && (req.url ?? '').includes('slug=eq.')) {
        send(200, JSON.stringify([ARTICLE_ROW]));
      } else if (TABLES.includes(path)) {
        send(200, '[]');
      } else if (path === '/rest/v1/rpc/anki_browse_indexes' && withIndexes) {
        send(
          200,
          JSON.stringify([
            { assessmentId: 'x/y', hash: 'a'.repeat(32), noteCount: 1, cardCount: 2, bytes: 3 },
          ]),
        );
      } else if (path === '/rest/v1/rpc/anki_deck_detail') {
        const { deck_id } = JSON.parse(body) as { deck_id: string };
        send(200, deck_id === '20' ? DECK : 'null');
      } else if (path === '/rest/v1/rpc/anki_browse_notes') {
        send(200, BROWSE);
      } else if (path === '/rest/v1/rpc/quiz_section') {
        const { quiz_id, section_id } = JSON.parse(body) as Record<string, string>;
        send(200, quiz_id === 'practica' && section_id === 'pautas' ? SECTION : 'null');
      } else if (path === '/rest/v1/rpc/anki_card_changes_since') {
        const { since } = JSON.parse(body) as { since: number };
        send(
          200,
          JSON.stringify({
            changes: [{ noteGuid: 'a', ord: 0, deckId: null }],
            next: since + 1,
            latest: since + 1,
            more: false,
          }),
        );
      } else if (path === '/rest/v1/rpc/quiz_detail') {
        send(200, 'null');
      } else if (
        path === '/rest/v1/rpc/publish_release' ||
        path === '/rest/v1/rpc/revert_release'
      ) {
        // As PostgREST sends a raised exception: its SQLSTATE, message and detail.
        const { p } = JSON.parse(body) as { p: { title?: string; id?: number } };
        const fn = path.split('/').at(-1)!;
        if (p.title === 'cambió') {
          send(
            400,
            JSON.stringify({
              code: 'P0409',
              message: `${fn}: fingerprint`,
              details: 'x',
              hint: null,
            }),
          );
        } else if (p.title === 'roto' || p.id === 99) {
          send(
            400,
            JSON.stringify({ code: '42883', message: 'function does not exist', details: null }),
          );
        } else if (p.id === 2) {
          send(
            400,
            JSON.stringify({ code: 'P0422', message: `${fn}: public_changed`, details: 'note X' }),
          );
        } else if (fn === 'publish_release') {
          send(
            200,
            JSON.stringify({
              id: 3,
              title: p.title,
              publishedAt: '2026-11-07T12:00:00+00:00',
              changes: {},
            }),
          );
        } else {
          send(
            200,
            JSON.stringify({ id: p.id, revertedAt: '2026-11-07T12:00:00+00:00', changes: {} }),
          );
        }
      } else {
        send(404, '{"message":"no existe"}');
      }
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

const app = () =>
  createApp({
    verifier: { verify: async () => ({ id: 'x', email: 'a@ug.uchile.cl' }) },
    repository: supabaseRepository(`${base}/`, KEY),
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
    const call = seen.at(-1)!;
    expect(call.path).toBe('/rest/v1/rpc/anki_deck_detail');
    expect(JSON.parse(call.body)).toEqual({ deck_id: '20' });
    expect(call.headers['apikey']).toBe(KEY);
    expect(call.headers['authorization']).toBe(`Bearer ${KEY}`);
  });

  it('a section of a test goes out as the database wrote it, with its photos signed', async () => {
    const r = await get('/api/quizzes/practica/sections/pautas');
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text.replace(/,"src": "[^"]+"/, '')).toBe(`  ${SECTION}`);
    expect(text).toMatch(
      /"media": "tests\/0123456789abcdef0123456789abcdef\.webp","src": "\/api\/media\/tests\//,
    );
    expect(JSON.parse(seen.at(-1)!.body)).toEqual({ quiz_id: 'practica', section_id: 'pautas' });
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
    // The columns of v1.5 (the migration 20261104000000_articles.sql).
    const select = new URL(`http://x${seen.at(-1)!.url}`).searchParams.get('select');
    expect(select?.split(',')).toEqual(
      expect.arrayContaining(['code', 'version', 'published_at', 'version_at', 'document']),
    );
  });

  it("the catalog's notes bring the version and its dates (the course's list shows them)", async () => {
    expect((await get('/api/catalog')).status).toBe(200);
    const call = seen.find((c) => c.path === '/rest/v1/notes' && !c.url.includes('slug=eq.'));
    const select = new URL(`http://x${call!.url}`).searchParams.get('select');
    expect(select?.split(',')).toEqual(
      expect.arrayContaining(['code', 'version', 'published_at', 'version_at']),
    );
  });

  it('the catalog asks for the card browser indexes; a database without them still has a catalog', async () => {
    seen.length = 0;
    expect((await get('/api/catalog')).status).toBe(200);
    expect(seen.map((c) => c.path)).toContain('/rest/v1/rpc/anki_browse_indexes');
    withIndexes = false;
    const original = console.error;
    const errors: unknown[] = [];
    console.error = (...a: unknown[]) => errors.push(a);
    try {
      expect((await get('/api/catalog')).status).toBe(200);
    } finally {
      console.error = original;
      withIndexes = true;
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
    expect(JSON.parse(seen.at(-1)!.body)).toEqual({ since: 41, max_rows: 2000 });
  });

  it('a deck the database does not have: 404', async () => {
    expect((await get('/api/decks/999')).status).toBe(404);
  });

  it('every note of the browser, as it comes', async () => {
    const r = await get('/api/anki/notes');
    expect(r.status).toBe(200);
    expect(JSON.parse(await r.text())).toEqual({ notes: [{ guid: 'g' }] });
    expect(seen.at(-1)!.path).toBe('/rest/v1/rpc/anki_browse_notes');
  });

  it('the catalog brings every deck of the tree, past the 1000 rows PostgREST gives at once', async () => {
    const r = await get('/api/catalog');
    expect(r.status).toBe(200);
    const c = (await r.json()) as { anki: { decks: { id: string }[] } };
    expect(c.anki.decks).toHaveLength(2500);
    expect(new Set(c.anki.decks.map((d) => d.id)).size).toBe(2500);
  });

  it('an error of the database is a 500 without its message', async () => {
    const broken = createApp({
      verifier: { verify: async () => ({ id: 'x', email: 'a@ug.uchile.cl' }) },
      repository: supabaseRepository(`${base}/nada`, KEY),
      media: { get: async () => null },
      signer: new MediaSigner('secreto-solo-para-pruebas-0123456789abcdef'),
    });
    const original = console.error;
    console.error = () => {};
    const r = await broken.request('/api/anki/notes', { headers: { Authorization: 'Bearer x' } });
    console.error = original;
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain('no existe');
  });
});

describe('nonNull', () => {
  const stream = (...chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const x of chunks) c.enqueue(new TextEncoder().encode(x));
        c.close();
      },
    });
  const text = async (s: ReadableStream<Uint8Array> | null) =>
    s === null ? null : await new Response(s).text();

  it('null (with spaces before, in several pieces) is null; nothing at all too', async () => {
    expect(await nonNull(stream('null'))).toBeNull();
    expect(await nonNull(stream(' ', '\n', ' null'))).toBeNull();
    expect(await nonNull(stream())).toBeNull();
  });

  it('a value goes on whole, every piece in order', async () => {
    expect(await text(await nonNull(stream(' ', '{"a":', '1}')))).toBe(' {"a":1}');
    expect(await text(await nonNull(stream('[]')))).toBe('[]');
  });
});

// Step 1.7, part 3: publish_release() and revert_release(), and how their refusals reach the Worker.
describe('publishing and undoing through PostgREST', () => {
  const input = {
    fingerprint: 'f'.repeat(32),
    title: 'Biología celular · Certamen 2',
    schemaVersion: 1,
    checks: { blocking: 0, pending: 0, ready: true, warnings: [], marks: [] },
    marks: [],
    by: 'dueno@ug.uchile.cl',
  };

  it('sends what publishing needs as its argument p, and reads what it did', async () => {
    seen.length = 0;
    const r = await supabaseReleaseRepository(base, KEY).publish(input);
    expect(r).toMatchObject({ ok: true, result: { id: 3, title: input.title } });
    expect(JSON.parse(seen.at(-1)!.body)).toEqual({ p: input });
  });

  it('a refusal is its reason and detail; any other error, an error', async () => {
    const repo = supabaseReleaseRepository(base, KEY);
    expect(await repo.publish({ ...input, title: 'cambió' })).toEqual({
      ok: false,
      reason: 'fingerprint',
      detail: 'x',
    });
    expect(await repo.revert(2, 'x')).toEqual({
      ok: false,
      reason: 'public_changed',
      detail: 'note X',
    });
    await expect(repo.publish({ ...input, title: 'roto' })).rejects.toThrow(/publish_release/);
    await expect(repo.revert(99, 'x')).rejects.toThrow(/revert_release/);
    expect(await repo.revert(1, 'x')).toMatchObject({ ok: true, result: { id: 1 } });
  });
});
