// A fake PostgREST on a local HTTP server: what the content database answers to the reads and the release functions of
// the Supabase adapters, and what it was asked.
import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

export const KEY = 'sb_secret_prueba';
export const DECK = '{"id":"20","name":"Mazo","cards":[]}';
// The course each deck of the fake database belongs to (none: the root and the semesters).
const DECK_COURSES: Record<string, string | null> = {
  '1': null,
  '2': null,
  '20': 'biologia-celular',
  '21': 'biologia-celular',
};

const TABLES = [
  'semesters',
  'courses',
  'assessments',
  'notes',
  'anki_presets',
  'anki_note_types',
  'quizzes',
].map((t) => `/rest/v1/${t}`);
// As Postgres writes jsonb: a space after each colon.
export const SECTION =
  '{"quizId": "practica", "sectionId": "pautas", "groups": [{"id": "01", "name": "Uno", "questions": [{"id": "A-1", "kind": "short", "prompt": "¿Sí?", "answer": "Sí", "figures": [{"alt": "", "kind": "image", "media": "tests/0123456789abcdef0123456789abcdef.webp", "width": 2, "height": 2}], "figureBeside": false}]}]}';
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

export async function startFakePostgrest() {
  let withIndexes = true;
  const seen: { path: string; url: string; headers: IncomingHttpHeaders; body: string }[] = [];
  const server = createServer((req, res) => {
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
      } else if (path === '/rest/v1/anki_decks') {
        const id =
          new URL(req.url ?? '', 'http://x').searchParams.get('id')?.replace('eq.', '') ?? '';
        send(200, JSON.stringify(id in DECK_COURSES ? [{ course_id: DECK_COURSES[id] }] : []));
      } else if (path === '/rest/v1/rpc/anki_deck_detail') {
        const { deck_id } = JSON.parse(body) as { deck_id: string };
        send(200, deck_id in DECK_COURSES ? DECK : 'null');
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
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    seen,
    /** Whether `anki_browse_indexes` exists in this database. */
    setIndexes(exists: boolean) {
      withIndexes = exists;
    },
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
