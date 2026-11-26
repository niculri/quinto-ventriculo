// The app of the tests of the announcements: two courses with material, a release double that publishes and undoes,
// the announcements in memory with the release's state, a clock the test moves and tokens that are their own email.
import type { ContentBundle } from '@qv/schema';
import { memoryAnnouncements } from '../adapters/memory/announcements';
import { memoryRepository } from '../adapters/memory/content';
import { memorySiteSettings } from '../adapters/memory/settings';
import { createApp } from '../app';
import type { ReleaseRepository } from '../ports/releases';
import { MediaSigner } from '../services/mediaSigner';
import { releases as panelDouble } from './draftApp';

export const NEWS_ADMIN = 'dueno@ug.uchile.cl';
export const NEWS_STUDENT = 'ana@ug.uchile.cl';
/** 2026-11-25 12:00 UTC, in the seconds of `deps.now`. */
const START = Date.parse('2026-11-25T12:00:00Z') / 1000;

const note = (id: string, courseId: string, assessmentId: string) => ({
  id,
  slug: id.toLowerCase(),
  courseId,
  assessmentId,
  kind: 'lecture' as const,
  title: id,
  position: 1,
  updatedAt: '2026-11-20T12:00:00.000Z',
  sources: [],
  html: '<p>x</p>',
  toc: [],
  sections: [],
  hash: id,
  media: [],
});

const NEWS_BUNDLE: ContentBundle = {
  semesters: [{ number: 2, name: '2° Semestre' }],
  courses: [
    { id: 'anatomia-2', semester: 2, name: 'Anatomía II', emoji: '🦴', position: 1 },
    { id: 'fisica', semester: 2, name: 'Física', emoji: '🧲', position: 2 },
  ],
  assessments: [
    { id: 'anatomia-2/certamen-3', courseId: 'anatomia-2', name: 'Certamen 3', position: 3 },
    { id: 'fisica/certamen-1', courseId: 'fisica', name: 'Certamen 1', position: 1 },
  ],
  notes: [
    note('AP-A2-1', 'anatomia-2', 'anatomia-2/certamen-3'),
    note('AP-FI-1', 'fisica', 'fisica/certamen-1'),
  ],
  ankiNoteTypes: [],
  ankiPresets: [],
  ankiDecks: [],
  ankiNotes: [],
  quizzes: [],
};

export function newsApp(
  options: { hiddenCourses?: string[]; announcements?: boolean; versioned?: boolean } = {},
) {
  const clock = { now: START };
  const reads = { catalog: 0, feed: 0 };
  const log = new Map<number, 'published' | 'reverted'>();
  let last = 0;
  const releases: ReleaseRepository = {
    ...panelDouble,
    publish: async (input) => {
      last += 1;
      log.set(last, 'published');
      return {
        ok: true,
        result: {
          id: last,
          title: input.title,
          publishedAt: '2026-11-25T12:00:00.000Z',
          changes: {},
        },
      };
    },
    revert: async (id) => {
      log.set(id, 'reverted');
      return { ok: true, result: { id, revertedAt: '2026-11-25T12:05:00.000Z', changes: {} } };
    },
  };
  const kept = memoryAnnouncements({
    now: () => clock.now * 1000,
    releaseStatus: (id) => Promise.resolve(log.get(id) ?? null),
  });
  const announcements = {
    ...kept,
    feed: (at: string, limit: number) => {
      reads.feed += 1;
      return kept.feed(at, limit);
    },
  };
  const repository = memoryRepository(NEWS_BUNDLE);
  const app = createApp({
    verifier: { verify: async (token) => ({ id: token, email: token }) },
    repository: {
      ...repository,
      catalog: () => {
        reads.catalog += 1;
        return repository.catalog();
      },
    },
    preview: repository,
    ...(options.versioned
      ? {
          contentVersion: {
            current: async () => `r${String(last)}${log.get(last) === 'reverted' ? 'x' : ''}`,
          },
          contentVersionTtl: 0,
        }
      : {}),
    media: { get: async () => null },
    signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    releases,
    ...(options.announcements === false ? {} : { announcements }),
    settings: memorySiteSettings({ hiddenCourses: options.hiddenCourses ?? [] }),
    settingsTtl: 0,
    admins: { isAdmin: async (token) => token === NEWS_ADMIN },
    now: () => clock.now,
  });
  const call = (path: string, who = NEWS_STUDENT, body?: unknown) =>
    app.request(path, {
      method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { Authorization: `Bearer ${who}`, 'Content-Type': 'application/json' },
    });
  return { app, call, clock, announcements: kept, reads };
}
