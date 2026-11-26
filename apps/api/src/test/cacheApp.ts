// The app of the shared cache's tests: two courses with a note, a deck, a card and a test each, a draft that differs,
// a content version, settings and a clock the test moves, and every read of the published repository counted.
import type { ContentBundle, ImportedAnkiNote, ImportedQuiz } from '@qv/schema';
import { memoryContentCache } from '../adapters/memory/contentCache';
import { memoryRepository } from '../adapters/memory/content';
import { memoryRateLimiter } from '../adapters/memory/rateLimit';
import { memorySiteSettings } from '../adapters/memory/settings';
import { createApp } from '../app';
import type { AppOptions } from '../dependencies';
import type { Access } from '../ports/access';
import type { ContentRepository } from '../ports/content';
import { MediaSigner } from '../services/mediaSigner';

export const NOW = 1_793_448_000;
export const SHOWN = 'anatomia-2';
export const OFF = 'fisica';
export const ADMIN = 'admin';
const IMAGE = 'notes/0123456789abcdef0123456789abcdef.webp';
/** Tokens the access checker refuses, each with its reason. */
export const REFUSED: Record<string, Access> = {
  'not-invited': 'denied',
  'signed-out': 'signed_out',
  'no-terms': 'not_accepted',
  expired: 'expired',
  'access-down': 'unknown',
};

const colors = (c: string) =>
  Object.fromEntries(['ac', 'ac-b', 'ac2', 'ac2-b', 'on-ac', 'g1', 'g2', 'g3'].map((k) => [k, c]));

const quiz = (course: string, prompt: string): ImportedQuiz => ({
  id: `test-${course}`,
  slug: `test-${course}`,
  courseId: course,
  assessmentId: `${course}/certamen-1`,
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
              id: `Q-${course}`,
              kind: 'choice',
              prompt,
              options: ['a', 'b'],
              correct: 0,
              figures: [{ kind: 'image', media: IMAGE, width: 10, height: 10, alt: 'x' }],
              figureBeside: false,
              fixedOrder: false,
            },
          ],
        },
      ],
    },
  ],
  hash: `${course}${prompt}`,
  media: [IMAGE],
});

const note = (course: string, text: string) => ({
  id: course === SHOWN ? 'AP-A2-1' : 'AP-FI-1',
  slug: `ap-${course}`,
  courseId: course,
  assessmentId: `${course}/certamen-1`,
  kind: 'lecture' as const,
  title: `Apunte ${course}`,
  position: 1,
  updatedAt: '2026-11-20T12:00:00.000Z',
  sources: [],
  html: `<p>${text}</p><img data-media="${IMAGE}" alt="x">`,
  toc: [],
  sections: [],
  hash: `${course}${text}`,
  media: [IMAGE],
});

const deck = (id: string, name: string, parentId: string | null, courseId: string | null) => ({
  id,
  name,
  description: '',
  parentId,
  semester: 2,
  courseId,
  assessmentId: courseId ? `${courseId}/certamen-1` : null,
  preset: null,
  position: 0,
});

const card = (guid: string, deckId: string, back: string): ImportedAnkiNote => ({
  guid,
  noteTypeId: '1',
  fields: { Frente: '¿?', Reverso: back },
  tags: [],
  code: null,
  version: null,
  createdAt: null,
  cards: [
    {
      ord: 0,
      deckId,
      frontHtml: '<p>¿?</p>',
      backHtml: `<p>${back}</p><img data-media="${IMAGE}">`,
      sortField: guid,
    },
  ],
  hash: `${guid}${back}`,
  updatedAt: '2026-11-20T12:00:00.000Z',
  media: [IMAGE],
});

/** `text` is in every piece, so a test can tell the published from the draft. */
const bundle = (text: string): ContentBundle => ({
  semesters: [{ number: 2, name: '2° Semestre' }],
  courses: [
    { id: SHOWN, semester: 2, name: 'Anatomía II', emoji: '🦴', position: 1 },
    { id: OFF, semester: 2, name: 'Física', emoji: '🧲', position: 2 },
  ],
  assessments: [
    { id: `${SHOWN}/certamen-1`, courseId: SHOWN, name: 'Certamen 1', position: 1 },
    { id: `${OFF}/certamen-1`, courseId: OFF, name: 'Certamen 1', position: 1 },
  ],
  notes: [note(SHOWN, text), note(OFF, text)],
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
    deck('20', '() Raíz::2° Semestre::Física', '2', OFF),
  ],
  ankiNotes: [card('g-shown', '10', text), card('g-off', '20', text)],
  quizzes: [quiz(SHOWN, text), quiz(OFF, text)],
});

/** Counts every call to the repository, by method. */
function counted(repository: ContentRepository) {
  const reads: Record<string, number> = {};
  const wrapped = Object.fromEntries(
    Object.entries(repository).map(([name, fn]) => [
      name,
      (...args: unknown[]) => {
        reads[name] = (reads[name] ?? 0) + 1;
        return (fn as (...a: unknown[]) => unknown)(...args);
      },
    ]),
  ) as unknown as ContentRepository;
  return { wrapped, reads };
}

export function cacheApp(options: Partial<AppOptions> = {}) {
  const clock = { now: NOW, version: 'r1.u0' as string | null };
  const settings = memorySiteSettings();
  const cache = memoryContentCache(() => clock.now);
  const published = counted(memoryRepository(bundle('publicado')));
  const draft = counted(memoryRepository(bundle('borrador')));
  const app = createApp({
    verifier: {
      verify: (t) =>
        Promise.resolve(t === 'invalid' ? null : { id: t, email: `${t}@ug.uchile.cl` }),
    },
    access: { check: (t) => Promise.resolve(REFUSED[t] ?? 'allowed') },
    repository: published.wrapped,
    preview: draft.wrapped,
    admins: { isAdmin: (t) => Promise.resolve(t === ADMIN) },
    media: { get: () => Promise.resolve(null) },
    signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    settings,
    settingsTtl: 0,
    contentVersion: {
      current: () =>
        clock.version === null
          ? Promise.reject(new Error('the version cannot be read'))
          : Promise.resolve(clock.version),
    },
    contentVersionTtl: 0,
    contentCache: cache,
    studentRateLimit: memoryRateLimiter(1000, 10, () => clock.now),
    version: 'build-1',
    now: () => clock.now,
    ...options,
  });
  const get = (path: string, token = 'ana', headers: Record<string, string> = {}) =>
    app.request(path, { headers: { Authorization: `Bearer ${token}`, ...headers } });
  return { app, get, clock, settings, cache, reads: published.reads, draftReads: draft.reads };
}
