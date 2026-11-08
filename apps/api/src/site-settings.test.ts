// Step 1.8: the administrator's switch that hides the semesters without material. The API takes them out of the
// catalog for everybody (also in the preview, about the draft), only an administrator reads or changes it, and a
// failure reading it hides nothing.
import { describe, expect, it } from 'vitest';
import { Catalog, SiteSettings } from '@qv/schema';
import type { ContentBundle } from '@qv/schema';
import { PREVIEW_HEADER, createApp } from './app';
import { MediaSigner } from './media';
import { memoryRepository } from './repositories/memory';
import { memorySiteSettings } from './repositories/memory-settings';
import type { SiteSettingsRepository } from './repository';

const ADMIN = 'dueno@ug.uchile.cl';
const STUDENT = 'ana@ug.uchile.cl';

/** Three semesters: the 1st with an article, the 2nd with only a course, the 3rd with nothing. */
const bundle = (withDraftArticle = false): ContentBundle => ({
  semesters: [
    { number: 1, name: '1° Semestre' },
    { number: 2, name: '2° Semestre' },
    { number: 3, name: '3° Semestre' },
  ],
  courses: [
    { id: 'anatomia-1', semester: 1, name: 'Anatomía I', emoji: '🦴', position: 1 },
    { id: 'fisica', semester: 2, name: 'Física', emoji: '🧲', position: 1 },
  ],
  assessments: [
    { id: 'anatomia-1/certamen-1', courseId: 'anatomia-1', name: 'Certamen 1', position: 1 },
    { id: 'fisica/certamen-1', courseId: 'fisica', name: 'Certamen 1', position: 1 },
  ],
  notes: [
    note('AP-A1-S3-01', 'anatomia-1', 'anatomia-1/certamen-1'),
    ...(withDraftArticle ? [note('AP-FI-C1-01', 'fisica', 'fisica/certamen-1')] : []),
  ],
  ankiNoteTypes: [],
  ankiPresets: [],
  ankiDecks: [],
  ankiNotes: [],
  quizzes: [],
});

function note(id: string, courseId: string, assessmentId: string) {
  return {
    id,
    slug: id.toLowerCase(),
    courseId,
    assessmentId,
    kind: 'lecture' as const,
    title: id,
    position: 1,
    updatedAt: '2026-11-07T12:00:00.000Z',
    sources: [],
    html: '<p>x</p>',
    toc: [],
    sections: [],
    hash: id,
    media: [],
  };
}

function appWith(settings?: SiteSettingsRepository) {
  return createApp({
    verifier: { verify: async (token) => ({ id: token, email: token }) },
    repository: memoryRepository(bundle()),
    preview: memoryRepository(bundle(true)),
    media: { get: async () => null },
    signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
    admins: { isAdmin: async (token) => token === ADMIN },
    ...(settings ? { settings } : {}),
  });
}

const get = (app: ReturnType<typeof createApp>, path: string, who: string, headers = {}) =>
  app.request(path, { headers: { Authorization: `Bearer ${who}`, ...headers } });
const put = (app: ReturnType<typeof createApp>, who: string, body: unknown) =>
  app.request('/api/admin/site-settings', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${who}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const semesters = async (r: Response) => {
  const c = Catalog.parse(await r.json());
  return { numbers: c.semesters.map((s) => s.number), hidden: c.hiddenSemesters };
};

describe('hiding the semesters without material', () => {
  it('off: every semester, as before', async () => {
    const app = appWith(memorySiteSettings());
    expect(await semesters(await get(app, '/api/catalog', STUDENT))).toEqual({
      numbers: [1, 2, 3],
      hidden: undefined,
    });
  });

  it('the administrator turns it on and off; everybody sees it at once, with how many went', async () => {
    const app = appWith(memorySiteSettings());
    const on = await put(app, ADMIN, { hideEmptySemesters: true });
    expect(on.status).toBe(200);
    expect(on.headers.get('Cache-Control')).toBe('no-store');
    expect(SiteSettings.parse(await on.json())).toMatchObject({
      hideEmptySemesters: true,
      updatedBy: ADMIN,
    });
    for (const who of [STUDENT, ADMIN]) {
      expect(await semesters(await get(app, '/api/catalog', who))).toEqual({
        numbers: [1],
        hidden: 2,
      });
    }
    // In the preview, «without material» is about the draft: the 2nd has an article there.
    expect(
      await semesters(await get(app, '/api/catalog', ADMIN, { [PREVIEW_HEADER]: 'draft' })),
    ).toEqual({ numbers: [1, 2], hidden: 1 });
    expect((await get(app, '/api/admin/site-settings', ADMIN)).status).toBe(200);
    await put(app, ADMIN, { hideEmptySemesters: false });
    expect(await semesters(await get(app, '/api/catalog', STUDENT))).toEqual({
      numbers: [1, 2, 3],
      hidden: undefined,
    });
  });

  it('a student can neither read nor change it: «no existe», never kept', async () => {
    const settings = memorySiteSettings();
    const app = appWith(settings);
    for (const r of [
      await get(app, '/api/admin/site-settings', STUDENT),
      await put(app, STUDENT, { hideEmptySemesters: true }),
    ]) {
      expect(r.status).toBe(404);
      expect(r.headers.get('Cache-Control')).toBe('no-store');
    }
    expect((await settings.get()).hideEmptySemesters).toBe(false);
    expect((await put(app, 'x', { hideEmptySemesters: true })).status).toBe(404);
    const anonymous = await app.request('/api/admin/site-settings');
    expect(anonymous.status).toBe(401);
  });

  it('refuses another body', async () => {
    const app = appWith(memorySiteSettings());
    for (const body of [{}, { hideEmptySemesters: 'yes' }, { hideEmptySemesters: true, by: 'x' }]) {
      const r = await put(app, ADMIN, body);
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ error: 'invalid_settings' });
    }
  });

  it('without settings, or if they cannot be read, nothing is hidden (and the panel has no switch)', async () => {
    expect(await semesters(await get(appWith(), '/api/catalog', STUDENT))).toMatchObject({
      numbers: [1, 2, 3],
    });
    expect((await get(appWith(), '/api/admin/site-settings', ADMIN)).status).toBe(404);
    const broken: SiteSettingsRepository = {
      get: async () => {
        throw new Error('function public.site_settings() does not exist');
      },
      set: async () => {
        throw new Error('no');
      },
    };
    const errors = console.error;
    console.error = () => {};
    try {
      const r = await get(appWith(broken), '/api/catalog', STUDENT);
      expect(r.status).toBe(200);
      expect(await semesters(r)).toMatchObject({ numbers: [1, 2, 3] });
    } finally {
      console.error = errors;
    }
  });
});
