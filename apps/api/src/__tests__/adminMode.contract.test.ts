// Tests for the admin mode: an administrator who asks with the header gets the draft and what is off for the students
// (a course turned off, a hidden semester), each thing with its reason; a student gets none of it, header or not.
import { describe, expect, it } from 'vitest';
import {
  Catalog,
  DeckDetail,
  PREVIEW_HEADER,
  QuizDetail,
  QuizIndex,
  QuizSectionDetail,
  SearchResponse,
} from '@qv/schema';
import type { ContentBundle, ImportedAnkiNote, ImportedQuiz } from '@qv/schema';
import { adminKey } from '@qv/schema/http';
import type { API_ROUTES } from '@qv/schema/http';
import { createApp } from '../app';
import type { AppOptions } from '../dependencies';
import { deepHealth } from '../services/health';
import { MediaSigner } from '../services/mediaSigner';
import { memoryRepository } from '../adapters/memory/content';
import { memorySiteSettings } from '../adapters/memory/settings';
import type { ReleaseRepository } from '../ports/releases';
import type { UnpublishedRepository } from '../ports/unpublished';
import type { UsageEvent, UsageStatsSource } from '../ports/usage';

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

  describe('asking for what the students have', () => {
    /** The draft has a card more in the deck that is shown, and a deck of its own with a card. */
    const drafted: ContentBundle = {
      ...draft,
      ankiDecks: [...draft.ankiDecks, deck('30', '2', SHOWN)],
      ankiNotes: [...draft.ankiNotes, card('g-new', '10'), card('g-only', '30')],
    };
    const keys = async (r: Response) =>
      DeckDetail.parse(await r.json()).cards.map((c) => `${c.noteGuid}:${c.ord}`);
    const withDraft = () =>
      createApp({
        verifier: { verify: async (token) => ({ id: token, email: token }) },
        repository: memoryRepository(base),
        preview: memoryRepository(drafted),
        media: { get: async () => null },
        signer,
        admins: { isAdmin: async (token) => token === ADMIN },
        settings: memorySiteSettings(settings),
        settingsTtl: 0,
      });

    it('gives the deck as the students have it: without the card only the draft has, with the course turned off', async () => {
      const app = withDraft();
      expect((await keys(await call(app, '/api/decks/10', ADMIN, ADMIN_MODE))).sort()).toEqual([
        'g-new:0',
        'g-shown:0',
      ]);
      const published = await call(app, '/api/decks/10?source=published', ADMIN, ADMIN_MODE);
      expect(published.status).toBe(200);
      expect(published.headers.get('Cache-Control')).toBe('no-store');
      expect(await keys(published)).toEqual(['g-shown:0']);
      expect((await call(app, '/api/decks/20?source=published', ADMIN, ADMIN_MODE)).status).toBe(
        200,
      );
      expect((await call(app, '/api/decks/30?source=published', ADMIN, ADMIN_MODE)).status).toBe(
        404,
      );
      expect((await call(app, '/api/decks/30', ADMIN, ADMIN_MODE)).status).toBe(200);
    });

    it('gives the catalog as the students have it, the course turned off included and nothing of the draft', async () => {
      const app = withDraft();
      const catalog = await catalogOf(app, ADMIN, ADMIN_MODE);
      const published = Catalog.parse(
        await (await call(app, '/api/catalog?source=published', ADMIN, ADMIN_MODE)).json(),
      );
      expect(catalog.anki.decks.map((d) => d.id)).toContain('30');
      expect(published.anki.decks.map((d) => d.id).sort()).toEqual(['1', '10', '2', '20']);
      expect(published.anki.decks.find((d) => d.id === '10')?.cardCount).toBe(1);
      expect(catalog.anki.decks.find((d) => d.id === '10')?.cardCount).toBe(2);
      expect(published.adminOnly).toBeUndefined();
      expect(published.semesters.flatMap((s) => s.courses.map((c) => c.id))).toContain(OFF);
    });

    /** A test of the course that is shown, with the given questions. */
    const quiz = (questions: string[]): ImportedQuiz => {
      const tokens = ['ac', 'ac-b', 'ac2', 'ac2-b', 'on-ac', 'g1', 'g2', 'g3'];
      const colors = Object.fromEntries(tokens.map((t) => [t, '#1F6F75']));
      return {
        id: 'test-a2',
        slug: 'test-a2',
        courseId: SHOWN,
        assessmentId: ASSESSMENT(SHOWN),
        title: 'Test A2',
        position: 1,
        questionCount: questions.length,
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
            questionCount: questions.length,
            hasChoices: true,
            groups: [
              {
                id: '01',
                name: 'Uno',
                questions: questions.map((id) => ({
                  id,
                  kind: 'choice' as const,
                  prompt: '¿Cuál?',
                  options: ['a', 'b'],
                  correct: 0,
                  figures: [],
                  figureBeside: false,
                  fixedOrder: false,
                })),
              },
            ],
          },
        ],
        hash: 'test-a2',
        media: [],
      };
    };
    const withQuiz = () =>
      createApp({
        verifier: { verify: async (token) => ({ id: token, email: token }) },
        repository: memoryRepository({ ...base, quizzes: [quiz(['Q-1'])] }),
        preview: memoryRepository({ ...drafted, quizzes: [quiz(['Q-1', 'Q-2'])] }),
        media: { get: async () => null },
        signer,
        admins: { isAdmin: async (token) => token === ADMIN },
        settings: memorySiteSettings(settings),
        settingsTtl: 0,
      });

    it('gives the test as the students have it: without the questions only the draft has', async () => {
      const app = withQuiz();
      const detail = async (path: string) =>
        QuizDetail.parse(await (await call(app, path, ADMIN, ADMIN_MODE)).json());
      const section = async (path: string) =>
        QuizSectionDetail.parse(await (await call(app, path, ADMIN, ADMIN_MODE)).json())
          .groups.flatMap((g) => g.questions)
          .map((q) => q.id);
      expect((await detail('/api/quizzes/test-a2')).questionCount).toBe(2);
      expect((await detail('/api/quizzes/test-a2?source=published')).questionCount).toBe(1);
      expect(await section('/api/quizzes/test-a2/sections/unica')).toEqual(['Q-1', 'Q-2']);
      expect(await section('/api/quizzes/test-a2/sections/unica?source=published')).toEqual([
        'Q-1',
      ]);
    });

    it('is nothing for a student, or for an administrator who did not ask for the admin mode', async () => {
      const paths = [
        '/api/catalog',
        '/api/decks/10',
        '/api/decks/20',
        '/api/cards/g-shown/0',
        '/api/quizzes/test-a2',
        '/api/quizzes/test-a2/sections/unica',
      ];
      const app = withQuiz();
      for (const path of paths) {
        const plain = await answer(await call(app, path, STUDENT));
        const asked = await answer(
          await call(app, `${path}?source=published`, STUDENT, ADMIN_MODE),
        );
        expect(asked, path).toEqual(plain);
        expect(await answer(await call(app, `${path}?source=published`, ADMIN)), path).toEqual(
          plain,
        );
      }
    });
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

/** The content a student reads, and what an administrator who is not in the admin mode must read just the same. */
const CONTENT_PATHS = [
  '/api/catalog',
  '/api/catalog?source=published',
  '/api/decks/20?source=published',
  '/api/notes/ap-fi-1',
  '/api/notes/ap-a2-2',
  '/api/notes/ap-qu-1',
  '/api/decks/20',
  '/api/cards/g-off/0',
  '/api/search?q=laringe',
  '/api/quizzes',
];

const answer = async (r: Response) => ({
  status: r.status,
  body: await r.text(),
  cache: r.headers.get('Cache-Control'),
  vary: r.headers.get('Vary'),
  header: r.headers.get(PREVIEW_HEADER),
});

describe('who is not an administrator gets nothing of the admin mode', () => {
  const settings = { hiddenCourses: [OFF], hideEmptySemesters: true };
  const verifier = { verify: async (token: string) => ({ id: token, email: token }) };
  const deps = (over: Partial<AppOptions> = {}): AppOptions => ({
    verifier,
    repository: memoryRepository(base),
    preview: memoryRepository(draft),
    media: { get: async () => null },
    signer,
    admins: { isAdmin: async (token) => token === ADMIN },
    settings: memorySiteSettings(settings),
    settingsTtl: 0,
    ...over,
  });

  async function studentSees(app: ReturnType<typeof createApp>) {
    return Promise.all(CONTENT_PATHS.map(async (path) => answer(await call(app, path, STUDENT))));
  }

  it('an administrator in the student mode reads every route as a student does', async () => {
    const app = createApp(deps());
    const student = await studentSees(app);
    for (const [i, path] of CONTENT_PATHS.entries()) {
      expect(await answer(await call(app, path, ADMIN)), path).toEqual(student[i]);
    }
  });

  it('a student with the header reads every route as without it', async () => {
    const app = createApp(deps());
    const student = await studentSees(app);
    for (const [i, path] of CONTENT_PATHS.entries()) {
      const sent = await answer(await call(app, path, STUDENT, ADMIN_MODE));
      expect(sent, path).toEqual(student[i]);
      expect(sent.header, path).toBeNull();
    }
    expect(student.map((s) => s.status)).toEqual([
      200, 200, 404, 404, 404, 404, 404, 404, 200, 200,
    ]);
  });

  /** What each way of being refused the mode gives an administrator who sends the header: what a student gets. */
  const WAYS: Record<string, () => Partial<AppOptions>> = {
    'the administrators’ list says no': () => ({ admins: { isAdmin: async () => false } }),
    'the administrators’ list cannot be asked': () => ({
      admins: {
        isAdmin: async () => {
          throw new Error('down');
        },
      },
    }),
  };
  for (const [way, over] of Object.entries(WAYS)) {
    it(`${way}: the header gives what a student gets`, async () => {
      const errors = console.error;
      console.error = () => {};
      try {
        const app = createApp(deps(over()));
        const student = await studentSees(app);
        for (const [i, path] of CONTENT_PATHS.entries()) {
          const sent = await call(app, path, ADMIN, ADMIN_MODE);
          // A list that fails is a failure of the request, never the mode; one that says no is a student's answer.
          if (sent.status >= 500) continue;
          expect(await answer(sent), path).toEqual(student[i]);
        }
      } finally {
        console.error = errors;
      }
    });
  }

  it('who stops being an administrator gets what a student gets from the next answer', async () => {
    let admin = true;
    const app = createApp(deps({ admins: { isAdmin: async () => admin } }));
    expect((await call(app, '/api/notes/ap-fi-1', ADMIN, ADMIN_MODE)).status).toBe(200);
    admin = false;
    for (const path of CONTENT_PATHS) {
      const student = await answer(await call(app, path, STUDENT));
      expect(await answer(await call(app, path, ADMIN, ADMIN_MODE)), path).toEqual(student);
    }
  });

  it('without the list of administrators, or without a draft, the header is a header like any other', async () => {
    const noAdmins = deps();
    delete noAdmins.admins;
    const noDraft = deps();
    delete noDraft.preview;
    for (const d of [noAdmins, noDraft]) {
      const app = createApp(d);
      const student = await studentSees(app);
      for (const [i, path] of CONTENT_PATHS.entries()) {
        expect(await answer(await call(app, path, ADMIN, ADMIN_MODE)), path).toEqual(student[i]);
      }
    }
  });

  it('only the exact value of the header asks for the mode; neither a cookie nor a query does', async () => {
    const app = createApp(deps());
    const student = await studentSees(app);
    const asks = [
      { [PREVIEW_HEADER]: 'Draft' },
      { [PREVIEW_HEADER]: '1' },
      { [PREVIEW_HEADER]: 'draft, draft' },
      { Cookie: `${PREVIEW_HEADER}=draft; qv-admin-mode=admin` },
    ];
    for (const headers of asks) {
      for (const [i, path] of CONTENT_PATHS.entries()) {
        expect(await answer(await call(app, path, ADMIN, headers)), path).toEqual(student[i]);
      }
    }
    expect(await answer(await call(app, '/api/catalog?preview=draft', ADMIN))).toEqual(student[0]);
  });

  it('a token that is not verified gets 401 and nothing of the material, header or not', async () => {
    const app = createApp(deps({ verifier: { verify: async () => null } }));
    for (const path of CONTENT_PATHS) {
      for (const headers of [{}, ADMIN_MODE]) {
        const r = await call(app, path, ADMIN, headers);
        expect(r.status, path).toBe(401);
        expect(await r.text(), path).not.toMatch(/Física|AP-FI|AP-A2|AP-QU|laringe/i);
      }
    }
  });

  /** A name for each route, so that a new route must say here what it gives to a student who sends the header. */
  const UNUSED = new Proxy({}, { get: () => () => Promise.reject(new Error('not called')) });
  const SAMPLES: Record<keyof typeof API_ROUTES, [method: string, path: string, body?: string]> = {
    health: ['GET', '/api/health'],
    deepHealth: ['GET', '/api/health/deep'],
    me: ['GET', '/api/me'],
    catalog: ['GET', '/api/catalog'],
    note: ['GET', '/api/notes/ap-fi-1'],
    search: ['GET', '/api/search?q=laringe'],
    deck: ['GET', '/api/decks/20'],
    cardIndex: ['GET', `/api/anki/index/${OFF}/${ASSESSMENT(OFF)}/${'a'.repeat(32)}`],
    thumbs: ['GET', '/api/anki/thumbs'],
    cardChanges: ['GET', '/api/anki/card-changes?since=0'],
    card: ['GET', '/api/cards/g-off/0'],
    quizzes: ['GET', '/api/quizzes'],
    quiz: ['GET', '/api/quizzes/practica'],
    quizSection: ['GET', '/api/quizzes/practica/sections/uno'],
    siteSettings: ['GET', '/api/admin/site-settings'],
    setSiteSettings: ['PUT', '/api/admin/site-settings', '{"hiddenCourses":[]}'],
    unpublished: ['GET', '/api/admin/unpublished'],
    usageOpen: ['POST', '/api/usage/open', '{"kind":"note","id":"ap-fi-1"}'],
    clientError: ['POST', '/api/client-error', '{}'],
    usage: ['GET', '/api/admin/usage'],
    release: ['GET', '/api/admin/release'],
    releaseItems: ['GET', '/api/admin/release/items?kind=notes&assessment=a'],
    releaseTexts: ['GET', '/api/admin/release/texts'],
    releaseMedia: ['GET', '/api/admin/release/media'],
    releaseMarks: ['PUT', '/api/admin/release/marks', '{}'],
    publishRelease: ['POST', '/api/admin/release/publish', '{}'],
    revertRelease: ['POST', '/api/admin/release/revert', '{}'],
    releaseLog: ['GET', '/api/admin/releases'],
    media: ['GET', '/api/media/cards/x.webp'],
  };

  it('every route of the API gives a student who sends the header what it gives without it', async () => {
    const app = createApp(
      deps({
        releases: UNUSED as ReleaseRepository,
        unpublished: UNUSED as UnpublishedRepository,
        usageStats: UNUSED as UsageStatsSource,
        deepHealth: deepHealth({}),
      }),
    );
    for (const [name, [method, path, body]] of Object.entries(SAMPLES)) {
      const ask = (headers: Record<string, string>) =>
        app.request(path, {
          method,
          headers: {
            Authorization: `Bearer ${STUDENT}`,
            'Content-Type': 'application/json',
            ...headers,
          },
          ...(body ? { body } : {}),
        });
      const without = await answer(await ask({}));
      const sent = await answer(await ask(ADMIN_MODE));
      expect(sent, name).toEqual(without);
      expect(sent.header, name).toBeNull();
      expect(sent.body, name).not.toContain('adminOnly');
      if (path.startsWith('/api/admin/')) expect(sent.status, name).toBe(404);
    }
  });
});
