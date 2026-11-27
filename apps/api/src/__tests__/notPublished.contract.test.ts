// Tests that what is only in the draft is, for a student and for an administrator outside the admin mode, the same
// 404 as something that never existed in every route that gives material; a route without an account fails.
import { describe, expect, it } from 'vitest';
import { Catalog, PREVIEW_HEADER, QuizIndex, SearchResponse } from '@qv/schema';
import type { ContentBundle, ImportedAnkiNote, ImportedQuiz } from '@qv/schema';
import { API_ROUTES } from '@qv/schema/http';
import type { ApiRouteName } from '@qv/schema/http';
import { createApp } from '../app';
import { MediaSigner } from '../services/mediaSigner';
import { memoryRepository } from '../adapters/memory/content';
import { memorySiteSettings } from '../adapters/memory/settings';

const ADMIN = 'dueno@ug.uchile.cl';
const STUDENT = 'ana@ug.uchile.cl';
const SHOWN = 'anatomia-2';
/** A course whose material is all in the draft. */
const NEW = 'quimica';
const ASSESSMENT = (course: string) => `${course}/certamen-1`;

const colors = Object.fromEntries(
  ['ac', 'ac-b', 'ac2', 'ac2-b', 'on-ac', 'g1', 'g2', 'g3'].map((k) => [k, '#1F6F75']),
);

const quiz = (course: string): ImportedQuiz => ({
  id: `test-${course}`,
  slug: `test-${course}`,
  courseId: course,
  assessmentId: ASSESSMENT(course),
  title: `Test ${course}`,
  position: 1,
  questionCount: 1,
  sectionCount: 1,
  updatedAt: '2026-11-20T12:00:00.000Z',
  kicker: '',
  heading: '',
  footer: '',
  theme: { light: colors, dark: colors } as ImportedQuiz['theme'],
  sections: [
    {
      id: 'unica',
      name: 'Única',
      description: '',
      groupsTitle: 'Temas',
      questionCount: 1,
      hasChoices: true,
      groups: [
        {
          id: '01',
          name: 'Uno',
          questions: [
            {
              id: 'Q-1',
              kind: 'choice',
              prompt: '¿Cuál?',
              options: ['a', 'b'],
              correct: 0,
              figures: [],
              figureBeside: false,
              fixedOrder: false,
            },
          ],
        },
      ],
    },
  ],
  hash: course,
  media: [],
});

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

const deck = (id: string, parentId: string | null, courseId: string | null) => ({
  id,
  name: `() Raíz::${id}`,
  description: '',
  parentId,
  semester: 2,
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

/** What the students have: one course with a note, a test and a deck; the other course is in the catalog, empty. */
const published: ContentBundle = {
  semesters: [{ number: 2, name: '2° Semestre' }],
  courses: [
    { id: SHOWN, semester: 2, name: 'Anatomía II', emoji: '🦴', position: 1 },
    { id: NEW, semester: 2, name: 'Química', emoji: '⚗️', position: 2 },
  ],
  assessments: [SHOWN, NEW].map((id, i) => ({
    id: ASSESSMENT(id),
    courseId: id,
    name: 'Certamen 1',
    position: i,
  })),
  notes: [note('AP-A2-1', SHOWN)],
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
  ankiDecks: [deck('1', null, null), deck('2', '1', null), deck('10', '2', SHOWN)],
  ankiNotes: [card('g-shown', '10')],
  quizzes: [quiz(SHOWN)],
};

/** The draft: the new course with a note, a test and a deck, and one note more in the course that is shown. */
const draft: ContentBundle = {
  ...published,
  notes: [...published.notes, note('AP-A2-2', SHOWN), note('AP-QU-1', NEW)],
  ankiDecks: [...published.ankiDecks, deck('30', '2', NEW)],
  ankiNotes: [...published.ankiNotes, card('g-new', '30')],
  quizzes: [...published.quizzes, quiz(NEW)],
};

const signer = new MediaSigner('secreto-de-prueba-0123456789-0123456789');

function appWith() {
  const opens: string[] = [];
  const app = createApp({
    verifier: { verify: async (token) => ({ id: token, email: token }) },
    repository: memoryRepository(published),
    preview: memoryRepository(draft),
    media: { get: async () => null },
    signer,
    admins: { isAdmin: async (token) => token === ADMIN },
    settings: memorySiteSettings({}),
    settingsTtl: 0,
    usageEvents: { record: (e) => opens.push(e.path) },
  });
  return { app, opens };
}

const ADMIN_MODE = { [PREVIEW_HEADER]: 'draft' };
const call = (
  app: ReturnType<typeof createApp>,
  path: string,
  who = STUDENT,
  init: { headers?: Record<string, string>; body?: string } = {},
) =>
  app.request(path, {
    ...(init.body ? { method: 'POST', body: init.body } : {}),
    headers: { Authorization: `Bearer ${who}`, ...init.headers },
  });

/**
 * The thing only the draft has answers a student as something that never existed, and so it does to an administrator
 * outside the admin mode; inside, it is there.
 */
async function notThere(path: string, never: string) {
  const { app } = appWith();
  const student = await call(app, path);
  const madeUp = await call(app, never);
  expect(student.status, path).toBe(404);
  const madeUpBody: unknown = await madeUp.json();
  expect(await student.json()).toEqual(madeUpBody);
  const admin = await call(app, path, ADMIN);
  expect(admin.status, `${path} (administrator)`).toBe(404);
  expect(await admin.json()).toEqual(madeUpBody);
  const header = { headers: ADMIN_MODE };
  const withHeader = await call(app, path, STUDENT, header);
  expect(withHeader.status, `${path} (student, header)`).toBe(404);
  expect(await withHeader.json()).toEqual(madeUpBody);
  expect((await call(app, path, ADMIN, header)).status, `${path} (admin mode)`).toBe(200);
}

type Check = () => Promise<void>;
const CHECKS = {
  health: 'no material',
  deepHealth: 'no material',
  me: 'no material',
  catalog: async () => {
    const { app } = appWith();
    const text = await (await call(app, '/api/catalog')).text();
    expect(text).not.toMatch(/AP-A2-2|AP-QU-1|test-quimica|"30"|g-new/);
    const catalog = Catalog.parse(JSON.parse(text));
    const chemistry = catalog.semesters[0]!.courses.find((c) => c.id === NEW)!;
    expect(chemistry.assessments.every((a) => !a.notes.length && !a.quizzes.length)).toBe(true);
    expect(await (await call(app, '/api/catalog', ADMIN)).text()).toBe(text);
  },
  note: () => notThere('/api/notes/ap-qu-1', '/api/notes/ap-nunca-1'),
  search: async () => {
    const { app } = appWith();
    const slugs = async (who: string, headers: Record<string, string> = {}) =>
      SearchResponse.parse(
        await (await call(app, '/api/search?q=laringe', who, { headers })).json(),
      ).results.map((r) => r.noteSlug);
    expect(await slugs(STUDENT)).toEqual(['ap-a2-1']);
    expect(await slugs(ADMIN)).toEqual(['ap-a2-1']);
    expect((await slugs(ADMIN, ADMIN_MODE)).sort()).toEqual(['ap-a2-1', 'ap-a2-2', 'ap-qu-1']);
  },
  deck: () => notThere('/api/decks/30', '/api/decks/999'),
  cardIndex:
    'served from R2 by its content hash, which only the catalog gives (the published one to a student): an index of the draft is reached only with its hash, an accepted risk (arquitectura → «El explorador de tarjetas»)',
  thumbs: 'one signature for the thumbnails of every course, whose names are hashes',
  cardChanges: 'ids only, of what was published and moved or taken off',
  card: () => notThere('/api/cards/g-new/0', '/api/cards/g-never/0'),
  quizzes: async () => {
    const { app } = appWith();
    for (const who of [STUDENT, ADMIN]) {
      const list = QuizIndex.parse(await (await call(app, '/api/quizzes', who)).json());
      expect(list.quizzes.map((q) => q.id)).toEqual([`test-${SHOWN}`]);
    }
  },
  quiz: () => notThere(`/api/quizzes/test-${NEW}`, '/api/quizzes/test-nunca'),
  quizSection: () =>
    notThere(`/api/quizzes/test-${NEW}/sections/unica`, '/api/quizzes/test-nunca/sections/unica'),
  siteSettings: 'only for administrators',
  setSiteSettings: 'only for administrators',
  unpublished: 'only for administrators, who see the log of what was taken off the site',
  usageOpen: async () => {
    const { app, opens } = appWith();
    const open = (kind: string, id: string) =>
      call(app, '/api/usage/open', STUDENT, { body: JSON.stringify({ kind, id }) });
    for (const [kind, id, never] of [
      ['note', 'ap-qu-1', 'ap-nunca-1'],
      ['quiz', `test-${NEW}`, 'test-nunca'],
      ['deck', '30', '999'],
    ] as const) {
      const r = await open(kind, id);
      expect(r.status, id).toBe(404);
      expect(await r.json()).toEqual(await (await open(kind, never)).json());
    }
    expect(opens).toEqual([]);
  },
  clientError: 'no material',
  usage: 'only for administrators',
  cardQuality: 'only for administrators',
  release: 'only for administrators: the draft that is about to be published',
  releaseItems: 'only for administrators',
  releaseTexts: 'only for administrators',
  releaseMedia: 'only for administrators',
  releaseMarks: 'only for administrators',
  publishRelease: 'only for administrators',
  revertRelease: 'only for administrators',
  releaseLog: 'only for administrators',
  news: 'its announcements leave out what is not published (see the tests of /api/news)',
  announcements: 'only for administrators',
  saveAnnouncement: 'only for administrators',
  withdrawAnnouncement: 'only for administrators',
  media: 'its keys are hashes that only what is published, or the admin mode, gives',
} satisfies Record<ApiRouteName, Check | string>;

describe('what is only in the draft', () => {
  it('has an account for every route of the contract', () => {
    expect(Object.keys(CHECKS).sort()).toEqual(Object.keys(API_ROUTES).sort());
  });

  describe.each(Object.entries(CHECKS))('%s', (name, check) => {
    if (typeof check === 'string') {
      it(`gives nothing of it (${check})`, () => {
        expect(check.length).toBeGreaterThan(0);
        expect(API_ROUTES[name as ApiRouteName]).toBeDefined();
      });
    } else {
      it('is not there for a student, as something that never existed', check);
    }
  });
});
