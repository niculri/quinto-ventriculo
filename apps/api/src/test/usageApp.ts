// The app of the tests of the usage counts and figures: a catalog with a deck tree, a users' database double that
// records what it was asked, and helpers to read and to open.
import type { AdminUsageRow, Catalog, Note, QuizDetail } from '@qv/schema';
import { createApp } from '../app';
import type { AppOptions } from '../dependencies';
import type { ContentRepository } from '../ports/content';
import type { UsageGroups, UsageStatsSource } from '../ports/usage';
import { MediaSigner } from '../services/mediaSigner';
import { siteDay } from '../services/usageReport';

export const ADMIN = 'dueno@ug.uchile.cl';
export const STUDENT = 'ana.prueba@ug.uchile.cl';
export const STUDENT_ID = '00000000-0000-4000-8000-0000000000a1';
export const SECRET_QUERY = 'mitocondria secreta';

const deck = (id: string, name: string, parentId: string | null, a: string | null) => ({
  id,
  name,
  parentId,
  preset: null,
  semester: name.split('::').length > 1 ? 2 : null,
  courseId: name.split('::').length > 2 ? 'ramo' : null,
  assessmentId: a,
  noteCount: 1,
  cardCount: 1,
});
const ROOT = '() Medicina UCH';
export const CATALOG = {
  semesters: [
    {
      number: 2,
      name: 'Segundo semestre',
      courses: [
        {
          id: 'ramo',
          semester: 2,
          name: 'Ramo de prueba',
          emoji: '🧪',
          position: 1,
          assessments: [
            {
              id: 'ramo/certamen-1',
              courseId: 'ramo',
              name: 'Certamen 1',
              position: 1,
              notes: [{ id: 'n1', slug: 'apunte', title: 'Apunte' }],
              cardCount: 3,
              quizzes: [
                {
                  id: 'test-de-prueba',
                  slug: 'practica',
                  courseId: 'ramo',
                  assessmentId: 'ramo/certamen-1',
                  title: 'Test de prueba',
                  position: 1,
                  questionCount: 3,
                  sectionCount: 1,
                  updatedAt: '2026-11-01T12:00:00.000Z',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  anki: {
    decks: [
      deck('1', ROOT, null, null),
      deck('2', `${ROOT}::2° Semestre`, '1', null),
      deck('3', `${ROOT}::2° Semestre::Ramo`, '2', null),
      deck('4', `${ROOT}::2° Semestre::Ramo::Certamen 1`, '3', 'ramo/certamen-1'),
      deck('5', `${ROOT}::2° Semestre::Ramo::Certamen 1::01 - Clase`, '4', 'ramo/certamen-1'),
      deck(
        '6',
        `${ROOT}::2° Semestre::Ramo::Certamen 1::01 - Clase::Extras`,
        '5',
        'ramo/certamen-1',
      ),
    ],
    presets: [],
    noteTypes: [],
  },
} as unknown as Catalog;

export const content = (): ContentRepository =>
  ({
    catalog: async () => CATALOG,
    note: async (slug: string) =>
      slug === 'apunte'
        ? ({ slug, title: 'Apunte', html: '<p>Hola</p>' } as unknown as Note)
        : null,
    deckJson: async (id: string) => (id === '5' ? '{"id":"5"}' : null),
    quiz: async (id: string) =>
      id === 'test-de-prueba' ? ({ id, title: 'Test' } as unknown as QuizDetail) : null,
    search: async () => [],
  }) as unknown as ContentRepository;

export function row(groups?: UsageGroups): AdminUsageRow {
  const today = siteDay(Date.now());
  const f = (active: number) => ({
    active_students: active,
    new_students: 0,
    anki_answers: 20 * active,
    new_cards: 4,
    rounds_started: 6,
    rounds_finished: 5,
  });
  const day = (back: number) => siteDay(Date.now() - back * 86_400_000);
  return {
    generated_at: new Date().toISOString(),
    today,
    time_zone: 'America/Santiago',
    totals: { today: f(6), last_7: f(8), last_30: f(9) },
    days: Array.from({ length: 30 }, (_, i) => ({ day: day(29 - i), ...f(i === 29 ? 6 : 2) })),
    weeks: Array.from({ length: 12 }, (_, i) => ({ week: day(7 * (11 - i)), ...f(3) })),
    decks: groups ? [{ deck_id: '5', students: 6, answers: 120, new_cards: 4 }] : [],
    quizzes: [],
    courses: [],
    assessments: [],
    invited: { signed_in: 7, never: 2 },
    activation: { eligible: 6, activated: 6, not_activated: 0, percent: 100 },
  };
}

export function appWith(deps: Partial<AppOptions> = {}) {
  const asked: { token: string; groups: UsageGroups }[] = [];
  const stats: UsageStatsSource = {
    stats: async (token, groups) => {
      asked.push({ token, groups });
      return row(groups);
    },
  };
  const preview = content();
  const app = createApp({
    verifier: {
      verify: async (token) => ({ id: token === STUDENT ? STUDENT_ID : token, email: token }),
    },
    repository: content(),
    preview,
    media: { get: async () => null },
    signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    admins: { isAdmin: async (token) => token === ADMIN },
    usageStats: stats,
    ...deps,
  });
  return { app, asked };
}

export const get = (app: ReturnType<typeof createApp>, path: string, who: string | null, h = {}) =>
  app.request(path, {
    headers: {
      ...(who ? { Authorization: `Bearer ${who}` } : {}),
      'CF-Connecting-IP': '203.0.113.7',
      'CF-IPCountry': 'CL',
      'User-Agent': 'Navegador de prueba/1.0',
      ...h,
    },
  });

export const open = (
  app: ReturnType<typeof createApp>,
  body: unknown,
  who: string | null = STUDENT,
  h: Record<string, string> = {},
) =>
  app.request('/api/usage/open', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      ...(who ? { Authorization: `Bearer ${who}` } : {}),
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.7',
      'CF-IPCountry': 'CL',
      'User-Agent': 'Navegador de prueba/1.0',
      ...h,
    },
  });

export const OPENS = [
  { kind: 'note', id: 'apunte' },
  { kind: 'deck', id: '5' },
  { kind: 'quiz', id: 'test-de-prueba' },
  { kind: 'search', from: 'note' },
];
export const GETS = [
  '/api/notes/apunte',
  '/api/decks/5',
  '/api/quizzes/test-de-prueba',
  `/api/search?q=${encodeURIComponent(SECRET_QUERY)}`,
];
