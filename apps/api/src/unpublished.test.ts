// Step 2.10: «Fuera del sitio» in the administration panel. Only an administrator reads the record of what was taken
// off the site (anybody else gets «no existe», never kept by the browser), and whether an image is on the site again is
// what the image store says.
import { describe, expect, it } from 'vitest';
import { UnpublishedLog } from '@qv/schema';
import { createApp } from './app';
import { MediaSigner } from './media';
import type { MediaStore } from './media';
import { memoryRepository } from './repositories/memory';
import type { UnpublishedRepository } from './repository';

const ADMIN = 'dueno@ug.uchile.cl';
const STUDENT = 'ana@ug.uchile.cl';

const EMPTY = {
  semesters: [],
  courses: [],
  assessments: [],
  notes: [],
  ankiNoteTypes: [],
  ankiPresets: [],
  ankiDecks: [],
  ankiNotes: [],
  quizzes: [],
};

const entry = (id: number, kind: string, itemId: string, onSite: boolean | null) => ({
  id,
  kind,
  itemId,
  title: kind === 'image' ? null : `Pieza ${id}`,
  reason: `Motivo ${id}`,
  by: 'dueño',
  doneAt: `2026-11-0${id}T12:00:00.000Z`,
  removed: kind === 'note' ? { notes: 1, sections: 3 } : {},
  onSite,
});

const LOG: UnpublishedLog = UnpublishedLog.parse({
  total: 4,
  entries: [
    entry(4, 'image', 'notes/0123456789abcdef0123456789abcdef.webp', null),
    entry(3, 'image', 'cards/ffffffffffffffffffffffffffffffff.webp', null),
    entry(2, 'quiz', 'practica', true),
    entry(1, 'note', 'AP-XX-C1-01', false),
  ],
});

function appWith(unpublished?: UnpublishedRepository, media?: MediaStore) {
  const asked: string[] = [];
  const app = createApp({
    verifier: { verify: async (token) => ({ id: token, email: token }) },
    repository: memoryRepository(EMPTY),
    media: media ?? {
      get: async () => null,
      has: async (key) => {
        asked.push(key);
        return key.startsWith('notes/');
      },
    },
    signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    admins: { isAdmin: async (token) => token === ADMIN },
    ...(unpublished ? { unpublished } : {}),
  });
  return { app, asked };
}

const get = (app: ReturnType<typeof createApp>, who: string | null) =>
  app.request('/api/admin/unpublished', {
    headers: who ? { Authorization: `Bearer ${who}` } : {},
  });

describe('GET /api/admin/unpublished', () => {
  it('an administrator gets the record, with the images asked to the store', async () => {
    const { app, asked } = appWith({ log: async () => LOG });
    const r = await get(app, ADMIN);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    const body = UnpublishedLog.parse(await r.json());
    expect(body.total).toBe(4);
    expect(body.entries.map((e) => [e.itemId, e.onSite])).toEqual([
      ['notes/0123456789abcdef0123456789abcdef.webp', true],
      ['cards/ffffffffffffffffffffffffffffffff.webp', false],
      ['practica', true],
      ['AP-XX-C1-01', false],
    ]);
    expect(asked.sort()).toEqual([
      'cards/ffffffffffffffffffffffffffffffff.webp',
      'notes/0123456789abcdef0123456789abcdef.webp',
    ]);
  });

  it('a store without `has` is asked with `get`', async () => {
    const { app } = appWith(
      { log: async () => LOG },
      {
        get: async (key) =>
          key.startsWith('cards/') ? { body: new Uint8Array(), contentType: 'image/webp' } : null,
      },
    );
    const body = UnpublishedLog.parse(await (await get(app, ADMIN)).json());
    expect(body.entries.slice(0, 2).map((e) => e.onSite)).toEqual([false, true]);
  });

  it('Revisión de cero (2.10): a failure of the store leaves that image as «no se pudo saber», not the page without the record', async () => {
    const { app } = appWith(
      { log: async () => LOG },
      {
        get: async () => null,
        has: async (key) => {
          if (key.startsWith('cards/')) throw new Error('R2 unavailable');
          return true;
        },
      },
    );
    const r = await get(app, ADMIN);
    expect(r.status).toBe(200);
    const body = UnpublishedLog.parse(await r.json());
    expect(body.entries.map((e) => [e.itemId, e.onSite])).toEqual([
      ['notes/0123456789abcdef0123456789abcdef.webp', true],
      ['cards/ffffffffffffffffffffffffffffffff.webp', null],
      ['practica', true],
      ['AP-XX-C1-01', false],
    ]);
  });

  it('a student, or nobody, gets «no existe» or 401, and nothing is read', async () => {
    let reads = 0;
    const { app } = appWith({
      log: async () => {
        reads++;
        return LOG;
      },
    });
    const student = await get(app, STUDENT);
    expect(student.status).toBe(404);
    expect(student.headers.get('Cache-Control')).toBe('no-store');
    expect(await student.json()).toMatchObject({ error: 'not_found' });
    expect((await get(app, null)).status).toBe(401);
    expect(reads).toBe(0);
  });

  it('a Worker without the record: the route does not exist, also for an administrator', async () => {
    const { app } = appWith();
    expect((await get(app, ADMIN)).status).toBe(404);
  });
});
