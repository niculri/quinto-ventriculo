// Tests that a course turned off by the administrators is gone from every route that gives material, and that
// turning it on gives everything back. A table by route fails when a route of the contract is not accounted for.
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { Catalog, PREVIEW_HEADER, QuizIndex, SearchResponse } from '@qv/schema';
import type { ContentBundle, ImportedAnkiNote, ImportedQuiz } from '@qv/schema';
import { API_ROUTES } from '@qv/schema/http';
import type { ApiRouteName } from '@qv/schema/http';
import { createApp } from './app';
import { MediaSigner } from './media';
import type { MediaStore } from './media';
import { memoryRepository } from './repositories/memory';
import { memorySiteSettings } from './repositories/memory-settings';
import type { UsageEvent } from './usage';

const ADMIN = 'dueno@ug.uchile.cl';
const STUDENT = 'ana@ug.uchile.cl';
const SHOWN = 'anatomia-2';
const OFF = 'fisica';
const OFF_ASSESSMENT = `${OFF}/certamen-1`;
const HASH = '0123456789abcdef0123456789abcdef';
const IMAGE = 'notes/0123456789abcdef0123456789abcdef.webp';

const colors = (c: string) =>
  Object.fromEntries(['ac', 'ac-b', 'ac2', 'ac2-b', 'on-ac', 'g1', 'g2', 'g3'].map((k) => [k, c]));

const quiz = (course: string, assessment: string): ImportedQuiz => ({
  id: `test-${course}`,
  slug: `test-${course}`,
  courseId: course,
  assessmentId: assessment,
  title: `Test ${course}`,
  position: 1,
  questionCount: 1,
  sectionCount: 1,
  updatedAt: '2026-11-20T12:00:00.000Z',
  kicker: '',
  heading: '',
  footer: '',
  theme: { light: colors('#1F6F75'), dark: colors('#6CC3C8') } as ImportedQuiz['theme'],
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

const note = (id: string, course: string, assessment: string, text: string) => ({
  id,
  slug: id.toLowerCase(),
  courseId: course,
  assessmentId: assessment,
  kind: 'lecture' as const,
  title: `Apunte ${course}`,
  position: 1,
  updatedAt: '2026-11-20T12:00:00.000Z',
  sources: [],
  html: `<p>${text}</p><img data-media="${IMAGE}" alt="x">`,
  toc: [],
  sections: [{ anchor: 'uno', title: 'Uno', level: 2 as const, text }],
  hash: id,
  media: [IMAGE],
});

const deck = (id: string, name: string, parentId: string | null, courseId: string | null) => ({
  id,
  name,
  description: '',
  parentId,
  semester: 2,
  courseId,
  assessmentId: courseId ? `${courseId}/${courseId === SHOWN ? 'certamen-3' : 'certamen-1'}` : null,
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

const bundle: ContentBundle = {
  semesters: [{ number: 2, name: '2° Semestre' }],
  courses: [
    { id: SHOWN, semester: 2, name: 'Anatomía II', emoji: '🦴', position: 1 },
    { id: OFF, semester: 2, name: 'Física', emoji: '🧲', position: 2 },
  ],
  assessments: [
    { id: `${SHOWN}/certamen-3`, courseId: SHOWN, name: 'Certamen 3', position: 3 },
    { id: OFF_ASSESSMENT, courseId: OFF, name: 'Certamen 1', position: 1 },
  ],
  notes: [
    note('AP-A2-1', SHOWN, `${SHOWN}/certamen-3`, 'La laringe se ve en la clase de anatomía.'),
    note('AP-FI-1', OFF, OFF_ASSESSMENT, 'La laringe aparece también en la clase de física.'),
  ],
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
    deck('1', '() Raíz', null, null),
    deck('2', '() Raíz::2° Semestre', '1', null),
    deck('10', '() Raíz::2° Semestre::Anatomía II', '2', SHOWN),
    deck('11', '() Raíz::2° Semestre::Anatomía II::Uno', '10', SHOWN),
    deck('20', '() Raíz::2° Semestre::Física', '2', OFF),
    deck('21', '() Raíz::2° Semestre::Física::Uno', '20', OFF),
  ],
  ankiNotes: [card('g-shown', '11'), card('g-off', '21')],
  quizzes: [quiz(SHOWN, `${SHOWN}/certamen-3`), quiz(OFF, OFF_ASSESSMENT)],
};

const media: MediaStore = {
  get: async (key) => {
    if (key === IMAGE) return { body: new Uint8Array([1]), contentType: 'image/webp' };
    if (key.startsWith(`browse/${SHOWN}/`) || key.startsWith(`browse/${OFF}/`)) {
      return { body: gzipSync('{}'), contentType: 'application/json' };
    }
    return null;
  },
};

const signer = new MediaSigner('secreto-de-prueba-0123456789-0123456789');

function appWith(hiddenCourses: string[], options: { settings?: boolean } = {}) {
  const opens: UsageEvent[] = [];
  const settings = memorySiteSettings({ hiddenCourses });
  const app = createApp({
    verifier: { verify: async (token) => ({ id: token, email: token }) },
    repository: memoryRepository(bundle),
    preview: memoryRepository(bundle),
    media,
    signer,
    admins: { isAdmin: async (token) => token === ADMIN },
    ...(options.settings === false ? {} : { settings }),
    settingsTtl: 0,
    usageEvents: { record: (e) => opens.push(e) },
  });
  return { app, opens, settings };
}

const call = (
  app: ReturnType<typeof createApp>,
  path: string,
  who = STUDENT,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {},
) =>
  app.request(path, {
    method: init.method ?? 'GET',
    ...(init.body ? { body: init.body } : {}),
    headers: { Authorization: `Bearer ${who}`, ...init.headers },
  });

/** What the course turned off answers, and what something that never existed answers: they have to be the same. */
async function gone(shown: Response, off: Response, never: Response) {
  expect(shown.status).toBe(200);
  expect(off.status).toBe(404);
  expect({ status: off.status, body: await off.json() }).toEqual({
    status: never.status,
    body: await never.json(),
  });
}

type Check = () => Promise<void>;
/** One entry for each route of the contract: what it answers with the course turned off, or why it has no material. */
const CHECKS = {
  health: 'no material',
  deepHealth: 'no material',
  me: 'no material',
  catalog: async () => {
    const { app } = appWith([OFF]);
    const catalog = Catalog.parse(await (await call(app, '/api/catalog')).json());
    expect(catalog.semesters.flatMap((s) => s.courses.map((c) => c.id))).toEqual([SHOWN]);
    expect(catalog.anki.decks.map((d) => d.id).sort()).toEqual(['1', '10', '11', '2']);
    const semesterDeck = catalog.anki.decks.find((d) => d.id === '2')!;
    expect(semesterDeck.cardCount).toBe(1);
    expect(catalog.anki.decks.find((d) => d.id === '1')!.noteCount).toBe(1);
    expect(JSON.stringify(catalog)).not.toMatch(/fisica|Física|AP-FI|test-fisica/);
  },
  note: async () => {
    const { app } = appWith([OFF]);
    await gone(
      await call(app, '/api/notes/ap-a2-1'),
      await call(app, '/api/notes/ap-fi-1'),
      await call(app, '/api/notes/ap-nunca-1'),
    );
  },
  search: async () => {
    const results = async (hidden: string[], who = STUDENT) =>
      SearchResponse.parse(
        await (await call(appWith(hidden).app, '/api/search?q=laringe', who)).json(),
      ).results;
    expect((await results([])).map((r) => r.noteSlug).sort()).toEqual(['ap-a2-1', 'ap-fi-1']);
    expect((await results([OFF])).map((r) => r.noteSlug)).toEqual(['ap-a2-1']);
    expect((await results([OFF], ADMIN)).map((r) => r.noteSlug)).toEqual(['ap-a2-1']);
  },
  deck: async () => {
    const { app } = appWith([OFF]);
    for (const id of ['20', '21']) {
      const off = await call(app, `/api/decks/${id}`);
      expect(off.status, id).toBe(404);
      expect(await off.json()).toEqual(await (await call(app, '/api/decks/999')).json());
    }
    expect((await call(app, '/api/decks/10')).status).toBe(200);
    const root = await call(app, '/api/decks/1');
    expect(root.status).toBe(404);
  },
  cardIndex: async () => {
    const { app } = appWith([OFF]);
    const path = (assessment: string, hash = HASH) => `/api/anki/index/${assessment}/${hash}`;
    await gone(
      await call(app, path(`${SHOWN}/certamen-3`)),
      await call(app, path(OFF_ASSESSMENT)),
      await call(app, path('nunca/certamen-1')),
    );
  },
  thumbs:
    'not tied to a course: one signature for the thumbnails of every course, whose names are hashes',
  cardChanges:
    "kept whole: the students' progress follows the moves of cards through it, and it holds ids only",
  card: async () => {
    const { app } = appWith([OFF]);
    await gone(
      await call(app, '/api/cards/g-shown/0'),
      await call(app, '/api/cards/g-off/0'),
      await call(app, '/api/cards/g-never/0'),
    );
  },
  quizzes: async () => {
    const { app } = appWith([OFF]);
    for (const path of ['/api/quizzes', `/api/quizzes?course=${OFF}`]) {
      const list = QuizIndex.parse(await (await call(app, path)).json());
      expect(list.quizzes.map((q) => q.courseId)).not.toContain(OFF);
    }
    expect(
      QuizIndex.parse(await (await call(app, '/api/quizzes')).json()).quizzes.map(
        (q) => q.courseId,
      ),
    ).toEqual([SHOWN]);
  },
  quiz: async () => {
    const { app } = appWith([OFF]);
    await gone(
      await call(app, `/api/quizzes/test-${SHOWN}`),
      await call(app, `/api/quizzes/test-${OFF}`),
      await call(app, '/api/quizzes/test-nunca'),
    );
  },
  quizSection: async () => {
    const { app } = appWith([OFF]);
    await gone(
      await call(app, `/api/quizzes/test-${SHOWN}/sections/unica`),
      await call(app, `/api/quizzes/test-${OFF}/sections/unica`),
      await call(app, '/api/quizzes/test-nunca/sections/unica'),
    );
  },
  siteSettings:
    'the panel lists every course, also the ones turned off (see the tests of the panel)',
  setSiteSettings: 'the panel',
  unpublished: 'only for administrators, who see the log of what was taken off the site',
  usageOpen: async () => {
    const { app, opens } = appWith([OFF]);
    const post = (kind: 'note' | 'quiz' | 'deck', id: string) =>
      call(app, '/api/usage/open', STUDENT, {
        method: 'POST',
        body: JSON.stringify({ kind, id }),
      });
    expect((await post('note', 'ap-a2-1')).status).toBe(200);
    expect((await post('deck', '10')).status).toBe(200);
    for (const [kind, id, never] of [
      ['note', 'ap-fi-1', 'ap-nunca-1'],
      ['quiz', `test-${OFF}`, 'test-nunca'],
      ['deck', '20', '999'],
    ] as const) {
      const r = await post(kind, id);
      expect(r.status, id).toBe(404);
      expect(await r.json()).toEqual(await (await post(kind, never)).json());
    }
    expect(opens.map((e) => e.path)).toEqual(['/api/notes/ap-a2-1', '/api/decks/10']);
  },
  clientError: 'no material',
  usage: 'only for administrators, who see the figures of every course',
  release: 'only for administrators: the draft that is about to be published',
  releaseItems: 'only for administrators',
  releaseTexts: 'only for administrators',
  releaseMedia: 'only for administrators',
  releaseMarks: 'only for administrators',
  publishRelease: 'only for administrators',
  revertRelease: 'only for administrators',
  releaseLog: 'only for administrators',
  media: async () => {
    // Its keys are hashes that no route gives anymore, but a link signed before stays valid until it expires.
    const { app } = appWith([OFF]);
    const url = await signer.url(IMAGE, Math.floor(Date.now() / 1000));
    expect((await app.request(url)).status).toBe(200);
    expect(JSON.stringify(await (await call(app, '/api/notes/ap-fi-1')).json())).not.toContain(
      IMAGE,
    );
  },
} satisfies Record<ApiRouteName, Check | string>;

describe('a course turned off', () => {
  it('has an account for every route of the contract', () => {
    expect(Object.keys(CHECKS).sort()).toEqual(Object.keys(API_ROUTES).sort());
  });

  describe.each(Object.entries(CHECKS))('%s', (name, check) => {
    if (typeof check === 'string') {
      it(`gives no material of its own (${check})`, () => {
        expect(check.length).toBeGreaterThan(0);
        expect(API_ROUTES[name as ApiRouteName]).toBeDefined();
      });
    } else {
      it('answers as if the course did not exist', check);
    }
  });

  it('is the same for an administrator, and in the draft', async () => {
    const { app } = appWith([OFF]);
    for (const headers of [{}, { [PREVIEW_HEADER]: 'draft' }]) {
      const r = await call(app, '/api/notes/ap-fi-1', ADMIN, { headers });
      expect(r.status).toBe(404);
      const catalog = Catalog.parse(
        await (await call(app, '/api/catalog', ADMIN, { headers })).json(),
      );
      expect(catalog.semesters.flatMap((s) => s.courses.map((c) => c.id))).toEqual([SHOWN]);
    }
  });

  it('comes back as it was when it is turned on', async () => {
    const { app, settings } = appWith([OFF]);
    expect((await call(app, '/api/notes/ap-fi-1')).status).toBe(404);
    await settings.set({ hiddenCourses: [], by: ADMIN });
    const everything = appWith([]);
    for (const path of [
      '/api/catalog',
      '/api/notes/ap-fi-1',
      '/api/decks/20',
      '/api/cards/g-off/0',
      '/api/quizzes',
      `/api/quizzes/test-${OFF}`,
      `/api/anki/index/${OFF_ASSESSMENT}/${HASH}`,
      '/api/search?q=laringe',
    ]) {
      const back = await call(app, path);
      const never = await call(everything.app, path);
      expect(back.status, path).toBe(200);
      expect(await back.text(), path).toBe(await never.text());
    }
  });

  it('with the settings unreadable, nothing of the material is given', async () => {
    const errors = console.error;
    console.error = () => {};
    try {
      const app = createApp({
        verifier: { verify: async (token) => ({ id: token, email: token }) },
        repository: memoryRepository(bundle),
        media,
        signer,
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
      for (const path of ['/api/catalog', '/api/notes/ap-a2-1', '/api/quizzes', '/api/decks/10']) {
        const r = await call(app, path);
        expect(r.status, path).toBe(503);
        expect(r.headers.get('Cache-Control')).toBe('no-store');
        expect(await r.json()).toMatchObject({ error: 'settings_unavailable' });
      }
    } finally {
      console.error = errors;
    }
  });

  it('keeps the card changes, which carry ids and nothing of the material', async () => {
    const { app } = appWith([OFF]);
    expect((await call(app, '/api/anki/card-changes?since=0')).status).toBe(200);
  });
});
