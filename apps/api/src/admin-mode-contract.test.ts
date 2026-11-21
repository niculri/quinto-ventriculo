// Tests for the admin mode: an administrator who asks with the header gets the draft and what is off for the students
// (a course turned off, a hidden semester), each thing with its reason; a student gets none of it, header or not.
import { describe, expect, it } from 'vitest';
import { Catalog, PREVIEW_HEADER, QuizIndex, SearchResponse } from '@qv/schema';
import type { ContentBundle, ImportedAnkiNote } from '@qv/schema';
import { adminKey } from '@qv/schema/http';
import { createApp } from './app';
import { MediaSigner } from './media';
import { memoryRepository } from './repositories/memory';
import { memorySiteSettings } from './repositories/memory-settings';
import type { UsageEvent } from './usage';

const ADMIN = 'dueno@ug.uchile.cl';
const STUDENT = 'ana@ug.uchile.cl';
const SHOWN = 'anatomia-2';
const OFF = 'fisica';
const EMPTY = 'quimica';
const ASSESSMENT = (course: string) => `${course}/certamen-1`;

const note = (id: string, course: string) => ({
  id,
  slug: id.toLowerCase(),
  courseId: course,
  assessmentId: ASSESSMENT(course),
  kind: 'lecture' as const,
  title: `Apunte ${id}`,
  position: 1,
  updatedAt: '2026-11-20T12:00:00.000Z',
  sources: [],
  html: '<p>La laringe.</p>',
  toc: [],
  sections: [{ anchor: 'uno', title: 'Laringe', level: 2 as const, text: 'La laringe.' }],
  hash: id,
  media: [],
});

const deck = (id: string, parentId: string | null, courseId: string | null, semester = 2) => ({
  id,
  name: `() Raíz::${id}`,
  description: '',
  parentId,
  semester,
  courseId,
  assessmentId: courseId ? ASSESSMENT(courseId) : null,
  preset: null,
  position: 0,
});

const card = (guid: string, deckId: string): ImportedAnkiNote => ({
  guid,
  noteTypeId: '1',
  fields: { Frente: '¿?', Reverso: '!' },
  tags: [],
  code: null,
  version: null,
  createdAt: null,
  cards: [{ ord: 0, deckId, frontHtml: '<p>¿?</p>', backHtml: '<p>!</p>', sortField: guid }],
  hash: guid,
  updatedAt: '2026-11-20T12:00:00.000Z',
  media: [],
});

const base: ContentBundle = {
  semesters: [
    { number: 2, name: '2° Semestre' },
    { number: 3, name: '3° Semestre' },
  ],
  courses: [
    { id: SHOWN, semester: 2, name: 'Anatomía II', emoji: '🦴', position: 1 },
    { id: OFF, semester: 2, name: 'Física', emoji: '🧲', position: 2 },
    { id: EMPTY, semester: 3, name: 'Química', emoji: '⚗️', position: 1 },
  ],
  assessments: [SHOWN, OFF, EMPTY].map((id, i) => ({
    id: ASSESSMENT(id),
    courseId: id,
    name: 'Certamen 1',
    position: i,
  })),
  notes: [note('AP-A2-1', SHOWN), note('AP-FI-1', OFF)],
  ankiNoteTypes: [
    {
      id: '1',
      name: 'Básica',
      kind: 'normal',
      occlusion: false,
      fields: ['Frente', 'Reverso'],
      templates: [{ name: 'Directa', qfmt: '{{Frente}}', afmt: '{{Reverso}}' }],
      css: '',
      sortField: 0,
    },
  ],
  ankiPresets: [{ name: 'Default', config: {} }],
  ankiDecks: [
    deck('1', null, null),
    deck('2', '1', null),
    deck('10', '2', SHOWN),
    deck('20', '2', OFF),
  ],
  ankiNotes: [card('g-shown', '10'), card('g-off', '20')],
  quizzes: [],
};

/** The draft has one note more in a course that is shown, and the first one in a semester that has nothing published. */
const draft: ContentBundle = {
  ...base,
  notes: [...base.notes, note('AP-A2-2', SHOWN), note('AP-QU-1', EMPTY)],
};

const signer = new MediaSigner('secreto-de-prueba-0123456789-0123456789');

function appWith(settings: { hiddenCourses?: string[]; hideEmptySemesters?: boolean } = {}) {
  const opens: UsageEvent[] = [];
  const app = createApp({
    verifier: { verify: async (token) => ({ id: token, email: token }) },
    repository: memoryRepository(base),
    preview: memoryRepository(draft),
    media: { get: async () => null },
    signer,
    admins: { isAdmin: async (token) => token === ADMIN },
    settings: memorySiteSettings(settings),
    settingsTtl: 0,
    usageEvents: { record: (e) => opens.push(e) },
  });
  return { app, opens };
}

const ADMIN_MODE = { [PREVIEW_HEADER]: 'draft' };
const call = (
  app: ReturnType<typeof createApp>,
  path: string,
  who = STUDENT,
  headers: Record<string, string> = {},
  body?: string,
) =>
  app.request(path, {
    ...(body ? { method: 'POST', body } : {}),
    headers: { Authorization: `Bearer ${who}`, ...headers },
  });

const catalogOf = async (
  app: ReturnType<typeof createApp>,
  who: string,
  headers: Record<string, string>,
) => Catalog.parse(await (await call(app, '/api/catalog', who, headers)).json());

describe('the admin mode', () => {
  const settings = { hiddenCourses: [OFF], hideEmptySemesters: true };

  it('gives an administrator the draft, the course turned off and the hidden semester, each with its reason', async () => {
    const { app } = appWith(settings);
    const catalog = await catalogOf(app, ADMIN, ADMIN_MODE);
    expect(catalog.semesters.map((s) => s.number)).toEqual([2, 3]);
    expect(catalog.semesters.flatMap((s) => s.courses.map((c) => c.id))).toEqual([
      SHOWN,
      OFF,
      EMPTY,
    ]);
    expect(catalog.anki.decks.map((d) => d.id).sort()).toEqual(['1', '10', '2', '20']);
    expect(catalog.hiddenSemesters).toBeUndefined();
    expect(catalog.adminOnly).toEqual({
      [adminKey('course', OFF)]: ['hiddenCourse'],
      [adminKey('assessment', ASSESSMENT(OFF))]: ['hiddenCourse'],
      [adminKey('note', 'AP-FI-1')]: ['hiddenCourse'],
      [adminKey('deck', '20')]: ['hiddenCourse'],
      [adminKey('note', 'AP-A2-2')]: ['draft'],
      [adminKey('semester', 3)]: ['hiddenSemester'],
      [adminKey('course', EMPTY)]: ['draft', 'hiddenSemester'],
      [adminKey('assessment', ASSESSMENT(EMPTY))]: ['draft', 'hiddenSemester'],
      [adminKey('note', 'AP-QU-1')]: ['draft', 'hiddenSemester'],
    });
  });

  it('marks the catalog as the administrator’s even when there is nothing to mark', async () => {
    const { app } = appWith();
    const catalog = await catalogOf(app, ADMIN, ADMIN_MODE);
    expect(Object.keys(catalog.adminOnly ?? {}).sort()).toEqual([
      adminKey('assessment', ASSESSMENT(EMPTY)),
      adminKey('course', EMPTY),
      adminKey('note', 'AP-A2-2'),
      adminKey('note', 'AP-QU-1'),
    ]);
  });

  it('opens what a student gets 404 for: the course turned off and the draft, in every route', async () => {
    const { app } = appWith(settings);
    for (const path of [
      '/api/notes/ap-fi-1',
      '/api/notes/ap-a2-2',
      '/api/decks/20',
      '/api/cards/g-off/0',
    ]) {
      expect((await call(app, path, ADMIN, ADMIN_MODE)).status, path).toBe(200);
      expect((await call(app, path, STUDENT, ADMIN_MODE)).status, `${path} (student)`).toBe(404);
    }
    const found = SearchResponse.parse(
      await (await call(app, '/api/search?q=laringe', ADMIN, ADMIN_MODE)).json(),
    );
    expect(found.results.map((r) => r.noteSlug).sort()).toEqual([
      'ap-a2-1',
      'ap-a2-2',
      'ap-fi-1',
      'ap-qu-1',
    ]);
    expect(
      QuizIndex.parse(await (await call(app, '/api/quizzes', ADMIN, ADMIN_MODE)).json()),
    ).toEqual({ quizzes: [] });
  });

  it('changes nothing without the header, and never for a student', async () => {
    const { app } = appWith(settings);
    const student = await (await call(app, '/api/catalog', STUDENT)).text();
    expect(await (await call(app, '/api/catalog', ADMIN)).text()).toBe(student);
    expect(await (await call(app, '/api/catalog', STUDENT, ADMIN_MODE)).text()).toBe(student);
    const seen = Catalog.parse(JSON.parse(student));
    expect(seen.adminOnly).toBeUndefined();
    expect(student).not.toMatch(/fisica|Física|AP-FI|AP-A2-2|AP-QU|quimica|Química/);
    expect((await call(app, '/api/notes/ap-fi-1', STUDENT, ADMIN_MODE)).status).toBe(404);
    expect((await call(app, '/api/notes/ap-a2-2', STUDENT, ADMIN_MODE)).status).toBe(404);
    expect(
      await (await call(app, '/api/search?q=laringe', STUDENT, ADMIN_MODE)).text(),
    ).not.toMatch(/ap-fi-1|ap-a2-2|ap-qu-1/);
  });

  it('is never kept by the browser, and does not count what it opens', async () => {
    const { app, opens } = appWith(settings);
    const r = await call(app, '/api/catalog', ADMIN, ADMIN_MODE);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get(PREVIEW_HEADER)).toBe('draft');
    expect(
      (
        await call(
          app,
          '/api/usage/open',
          ADMIN,
          ADMIN_MODE,
          JSON.stringify({ kind: 'note', id: 'ap-fi-1' }),
        )
      ).status,
    ).toBe(200);
    expect(opens).toEqual([]);
  });

  it('with the settings unreadable, gives nothing, as for a student', async () => {
    const errors = console.error;
    console.error = () => {};
    try {
      const app = createApp({
        verifier: { verify: async (token) => ({ id: token, email: token }) },
        repository: memoryRepository(base),
        preview: memoryRepository(draft),
        media: { get: async () => null },
        signer,
        admins: { isAdmin: async (token) => token === ADMIN },
        settings: {
          get: async () => {
            throw new Error('down');
          },
          set: async () => {
            throw new Error('down');
          },
        },
        settingsTtl: 0,
      });
      const r = await call(app, '/api/catalog', ADMIN, ADMIN_MODE);
      expect(r.status).toBe(503);
      expect(await r.json()).toMatchObject({ error: 'settings_unavailable' });
    } finally {
      console.error = errors;
    }
  });
});
