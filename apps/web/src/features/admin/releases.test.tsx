// Step 1.7, part 2: the release panel («Opciones» → «Publicaciones») and the preview of the draft, without network.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReleaseSummary } from '@qv/schema';
import { ApiRequestError } from '../../lib/api';
import type { ReleaseOverview } from '@qv/schema';
import {
  CATALOG,
  SESSION_ANA,
  fakeApi,
  fakeSession,
  fullAnkiStudy,
  renderApp,
  acceptedAccount,
} from '../../test/render';
import type { Services } from '../../app/services';
import { localQuizRepository } from '../quiz/repository';
import { localStudyRepository } from '../study/repository';
import { PreviewSwitch, previewStudyRepository, usePreview } from '../preview/preview';
import type { Preview, PreviewParts } from '../preview/preview';
import { localAdminRepository } from './repository';

/** What the database gives for the e2e folder's draft (db/tests/release.test.ts writes it). */
const SUMMARY = ReleaseSummary.parse(
  JSON.parse(
    readFileSync(join(import.meta.dirname, '../../../e2e/content/release/summary.json'), 'utf8'),
  ),
);
const OVERVIEW: ReleaseOverview = { supportedSchemaVersion: 1, summary: SUMMARY };

const adminApi = (changes: Parameters<typeof fakeApi>[0] = {}) =>
  fakeApi({
    releaseOverview: async () => OVERVIEW,
    releaseTexts: async () => ({ items: [], next: null }),
    releaseMedia: async () => ({ checked: [], missing: [], next: null }),
    releaseLog: async () => ({ releases: [] }),
    ...changes,
  });

afterEach(() => window.sessionStorage.clear());

describe('the release panel', () => {
  it('a student does not see it in the menu, and its URL does not exist for them', async () => {
    renderApp('/admin/releases');
    expect(
      await screen.findByRole('heading', { name: /no aparece ni en el Netter/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Lista de revisión')).toBeNull();
    const menu = screen.getByRole('navigation', { name: 'Menú del sitio' });
    expect(within(menu).queryByText('Publicaciones')).toBeNull();
  });

  it('an administrator: the review list, what changes and the marks by hand', async () => {
    const setReleaseMark = vi.fn(
      async (_fp: string, mark: 'phone' | 'answers' | 'announcement', checked: boolean) => ({
        marks: checked
          ? [{ mark, checkedBy: 'ana@ug.uchile.cl', checkedAt: '2026-11-07T12:00:00Z' }]
          : [],
      }),
    );
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: adminApi({ setReleaseMark }),
    });
    expect(await screen.findByText('Hay 1 regla que impide publicar.')).toBeInTheDocument();
    expect(
      screen.getByText(/Núcleo celular \(AP-BC-C2-10\) no dice de qué año es la clase/),
    ).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Anatomía I · Certamen 1' })).toHaveTextContent(
      '2 pueden cambiar la respuesta',
    );
    const menu = screen.getByRole('navigation', { name: 'Menú del sitio' });
    expect(within(menu).getByRole('link', { name: 'Publicaciones' })).toHaveAttribute(
      'href',
      '/admin/releases',
    );
    await userEvent.click(screen.getByRole('switch', { name: 'Vi lo nuevo en el teléfono' }));
    await waitFor(() =>
      expect(setReleaseMark).toHaveBeenCalledWith(SUMMARY.fingerprint, 'phone', true),
    );
    expect(await screen.findByText('Marcada por ana@ug.uchile.cl')).toBeInTheDocument();
  });

  it('a draft equal to what is published says so', async () => {
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: adminApi({
        releaseOverview: async () => ({
          supportedSchemaVersion: 1,
          summary: {
            ...SUMMARY,
            assessments: [],
            catalog: [],
            noteTypes: [],
            presets: [],
            decks: [],
            findings: [],
          },
        }),
      }),
    });
    expect(await screen.findByText(/El borrador es igual a lo publicado/)).toBeInTheDocument();
  });
});

// Step 1.7, part 3: «Publicar», its popup, the last publication and «Deshacer la última publicación».
describe('publishing and undoing', () => {
  /** The e2e draft without the rule that stops it, with both marks checked: ready to publish. */
  const READY: ReleaseOverview = {
    supportedSchemaVersion: 1,
    summary: {
      ...SUMMARY,
      findings: SUMMARY.findings.filter((f) => f.rule !== 'class_without_year'),
      marks: [
        { mark: 'answers', checkedBy: 'ana@ug.uchile.cl', checkedAt: '2026-11-07T12:00:00Z' },
        { mark: 'phone', checkedBy: 'ana@ug.uchile.cl', checkedAt: '2026-11-07T12:00:00Z' },
      ],
    },
  };
  const record = (id: number, status: 'published' | 'reverted' = 'published') => ({
    id,
    status,
    title: 'Anatomía I · Certamen 1 y Biología celular · Certamen 2',
    schemaVersion: 1,
    publishedAt: '2026-11-07T15:00:00.000+00:00',
    publishedBy: 'ana@ug.uchile.cl',
    revertedAt: status === 'reverted' ? '2026-11-07T15:10:00.000+00:00' : null,
    revertedBy: status === 'reverted' ? 'ana@ug.uchile.cl' : null,
    changes: {},
    canRevert: status === 'published',
  });

  it('«Publicar» is off while the list is not ready, and so is undoing without a publication', async () => {
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: adminApi(),
    });
    expect(await screen.findByText('Hay 1 regla que impide publicar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(
      await screen.findByText('Todavía no hay publicaciones.', { selector: 'p[role=status]' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deshacer la última publicación' })).toBeDisabled();
  });

  it('publishes from its popup what the panel showed, with its review list; then shows it', async () => {
    let log = [] as ReturnType<typeof record>[];
    let overview = READY;
    const publishRelease = vi.fn(async (body: { fingerprint: string; title: string }) => {
      log = [record(1)];
      overview = { ...READY, summary: { ...READY.summary, assessments: [], findings: [] } };
      return { id: 1, title: body.title, publishedAt: '2026-11-07T15:00:00Z', changes: {} };
    });
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: adminApi({
        releaseOverview: async () => overview,
        releaseLog: async () => ({ releases: log }),
        publishRelease,
      }),
    });
    const button = await screen.findByRole('button', { name: 'Publicar' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    const dialog = await screen.findByRole('alertdialog', { name: '¿Publicar el borrador?' });
    expect(dialog).toHaveTextContent('Anatomía I · Certamen 1 y Biología celular · Certamen 2');
    expect(dialog).toHaveTextContent(/Anatomía I · Certamen 1: .*tarjeta nueva/);
    expect(publishRelease).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(publishRelease).toHaveBeenCalledWith({
      fingerprint: READY.summary.fingerprint,
      title: 'Anatomía I · Certamen 1 y Biología celular · Certamen 2',
      checks: expect.objectContaining({ blocking: 0, pending: 0, ready: true }),
    });
    expect(await screen.findByText(/N\.º 1 · Anatomía I/)).toBeInTheDocument();
    expect(await screen.findByText(/El borrador es igual a lo publicado/)).toBeInTheDocument();
  });

  it('Revisión de cero (1.8): the empty assessments of the catalog are one line each, with their course', async () => {
    const [an, bc] = READY.summary.assessments;
    const empty = (id: string, courseName: string) => ({
      ...an!,
      id,
      courseId: id.split('/')[0]!,
      courseName,
      name: 'Certamen 1',
      articles: { added: 0, removed: 0, content: 0, format: 0 },
      questions: {
        ...an!.questions,
        added: 0,
        removed: 0,
        answer: 0,
        noAnswer: 0,
        format: 0,
        moved: 0,
        keyChanged: 0,
        total: 0,
      },
      quizzes: [],
      cards: { added: 0, removed: 0, moved: 0, answer: 0, noAnswer: 0, format: 0, notes: 0 },
      decks: [],
      impactDecks: [],
    });
    const added = (id: string) => ({
      kind: 'assessment' as const,
      id,
      op: 'added' as const,
      before: null,
      after: { id, course_id: id.split('/')[0]!, name: 'Certamen 1', position: 1 },
    });
    // The Seminario 8 moves to a new Certamen 3 (a format change there) and two empty «Certamen 1» come in.
    const c3 = {
      ...empty('biologia-celular/certamen-3', bc!.courseName!),
      name: 'Certamen 3',
      articles: { added: 0, removed: 0, content: 0, format: 1 },
    };
    const overview: ReleaseOverview = {
      ...READY,
      summary: {
        ...READY.summary,
        catalog: [
          added('quimica-general-y-organica/certamen-1'),
          added('matematicas/certamen-1'),
          { ...added('biologia-celular/certamen-3'), after: { name: 'Certamen 3' } },
        ],
        assessments: [
          empty('quimica-general-y-organica/certamen-1', 'Química general y orgánica'),
          empty('matematicas/certamen-1', 'Matemáticas'),
          c3,
        ],
      },
    };
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: adminApi({ releaseOverview: async () => overview }),
    });
    expect(
      await screen.findByText('La evaluación «Química general y orgánica · Certamen 1» es nueva.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('La evaluación «Matemáticas · Certamen 1» es nueva.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: 'Biología celular · Certamen 3' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: /Certamen 1/ })).toBeNull();
    const button = await screen.findByRole('button', { name: 'Publicar' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    const dialog = await screen.findByRole('alertdialog', { name: '¿Publicar el borrador?' });
    expect(dialog).toHaveTextContent('Biología celular · Certamen 3: 1 artículo cambiado.');
    expect(dialog).toHaveTextContent('Además, 3 cambios del catálogo');
    expect(dialog).not.toHaveTextContent('Matemáticas');
  });

  it('cancelling publishes nothing; a refusal stays in the popup', async () => {
    const publishRelease = vi.fn(async () => {
      throw new ApiRequestError(
        409,
        'release_changed',
        'El borrador o lo publicado cambió: revisa de nuevo lo que trae.',
      );
    });
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: adminApi({ releaseOverview: async () => READY, publishRelease }),
    });
    const button = await screen.findByRole('button', { name: 'Publicar' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(publishRelease).not.toHaveBeenCalled();
    await userEvent.click(button);
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('revisa de nuevo');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('undoes the last publication from its popup', async () => {
    let log = [record(2), { ...record(1), canRevert: false }];
    const revertRelease = vi.fn(async (id: number) => {
      log = [record(2, 'reverted'), { ...record(1), canRevert: false }];
      return { id, revertedAt: '2026-11-07T15:10:00Z', changes: {} };
    });
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: adminApi({ releaseLog: async () => ({ releases: log }), revertRelease }),
    });
    const undo = await screen.findByRole('button', { name: 'Deshacer la última publicación' });
    await waitFor(() => expect(undo).toBeEnabled());
    await userEvent.click(undo);
    const dialog = await screen.findByRole('alertdialog', {
      name: '¿Deshacer la publicación n.º 2?',
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deshacer' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(revertRelease).toHaveBeenCalledWith(2);
    expect(
      await screen.findByText(/Deshecha el/, { selector: 'p[role=status]' }),
    ).toBeInTheDocument();
    expect(undo).toBeDisabled();
    const list = screen.getByRole('region', { name: 'Registro de publicaciones' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.dataset.release),
    ).toEqual(['2', '1']);
  });
});

describe('the preview of the draft', () => {
  it('reads the site with the preview API, in a cache of its own, and leaves nothing when it ends', async () => {
    const published = vi.fn(async () => CATALOG);
    const draft = vi.fn(async () => CATALOG);
    const { router } = renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: adminApi({ catalog: published }),
      previewApi: adminApi({ catalog: draft }),
    });
    await userEvent.click(
      await screen.findByRole('switch', { name: 'Ver el sitio con el borrador' }),
    );
    expect(window.sessionStorage.getItem('qv-preview')).toBe('draft');
    expect(screen.getByText('Estás viendo el borrador, no lo publicado.')).toBeInTheDocument();
    // Revisión de cero (1.7, parte 2): what stays on the screen (the site's menu) reads the draft at once, too.
    await waitFor(() => expect(draft).toHaveBeenCalled());
    published.mockClear();
    await act(() => router.navigate('/home'));
    await waitFor(() => expect(draft).toHaveBeenCalled());
    expect(published).not.toHaveBeenCalled();
    await act(() => router.navigate('/admin/releases'));
    await userEvent.click(
      await screen.findByRole('switch', { name: 'Ver el sitio con el borrador' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Estás viendo el borrador, no lo publicado.')).toBeNull(),
    );
    expect(window.sessionStorage.getItem('qv-preview')).toBeNull();
    // The published site again, from its own cache (kept apart while the preview lasted).
    draft.mockClear();
    await act(() => router.navigate('/home'));
    expect(await screen.findByRole('heading', { name: /Hola/ })).toBeInTheDocument();
    expect(draft).not.toHaveBeenCalled();
  });

  it('studying in the preview writes nothing in the real repository, and starts from what the user chose', async () => {
    const real = fullAnkiStudy();
    await real.setDeckActivation('20', true);
    const activations = await real.deckActivations();
    const writes = vi.fn();
    const spied = new Proxy(real, {
      get(target, key, receiver) {
        const v: unknown = Reflect.get(target, key, receiver);
        if (typeof v !== 'function') return v;
        const name = String(key);
        return (...args: unknown[]) => {
          if (!/^(preferences|deckActivations|assessmentSettings)$/.test(name)) writes(name);
          return (v as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    const preview = previewStudyRepository(spied);
    expect((await preview.preferences())?.fullAnki).toBe(true);
    expect(await preview.deckActivations()).toEqual(activations);
    await preview
      .recordReview({
        card: { noteGuid: 'g', ord: 0, deckId: '20' },
        rating: 3,
        expectedUpdatedAt: null,
        state: {
          phase: 'learning',
          interday: false,
          remainingSteps: 1,
          due: new Date().toISOString(),
          interval: 0,
          stability: 1,
          difficulty: 5,
          reps: 1,
          lapses: 0,
          lastReview: new Date().toISOString(),
          leech: false,
        },
        log: {},
      } as unknown as Parameters<typeof preview.recordReview>[0])
      .catch(() => undefined);
    await preview.setDeckActivation('21', true);
    expect(writes).not.toHaveBeenCalled();
    expect(await real.deckActivations()).toEqual(activations);
    // A new preview starts again from nothing of the old one.
    const again = previewStudyRepository(localStudyRepository(null));
    expect(await again.deckActivations()).toEqual([]);
  });

  it('Revisión de cero (1.7, parte 2): a tab left in the preview, where somebody who is not an administrator signs in, leaves it', async () => {
    window.sessionStorage.setItem('qv-preview', 'draft');
    const published = vi.fn(async () => CATALOG);
    const draft = vi.fn(async () => CATALOG);
    const study = fullAnkiStudy();
    // Only the real repository reads the progress (the preview's never asks the real one for it).
    const progress = vi.spyOn(study, 'deckProgress');
    const { router } = renderApp('/home', {
      // A student (localAdminRepository: not an administrator).
      api: fakeApi({ catalog: published }),
      previewApi: fakeApi({ catalog: draft }),
      study,
    });
    await waitFor(() => expect(window.sessionStorage.getItem('qv-preview')).toBeNull());
    expect(screen.queryByText('Estás viendo el borrador, no lo publicado.')).toBeNull();
    // From now on, their own site: what is published, and their progress where it always is.
    await waitFor(() => expect(published).toHaveBeenCalled());
    await waitFor(() => expect(progress).toHaveBeenCalled());
    draft.mockClear();
    await act(() => router.navigate('/settings/anki'));
    await act(() => router.navigate('/home'));
    expect(await screen.findByRole('heading', { name: /Hola/ })).toBeInTheDocument();
    expect(draft).not.toHaveBeenCalled();
  });

  it('Revisión de cero (1.7, parte 2): a mark checked in the preview is checked after leaving it', async () => {
    // One server behind both clients, as in the site.
    let marks: {
      mark: 'phone' | 'answers' | 'announcement';
      checkedBy: string;
      checkedAt: string;
    }[] = [];
    const server = {
      releaseOverview: async () => ({ ...OVERVIEW, summary: { ...SUMMARY, marks } }),
      setReleaseMark: async (
        _fp: string,
        mark: 'phone' | 'answers' | 'announcement',
        on: boolean,
      ) => {
        marks = on
          ? [{ mark, checkedBy: 'ana@ug.uchile.cl', checkedAt: '2026-11-07T12:00:00Z' }]
          : [];
        return { marks };
      },
    };
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: adminApi(server),
      previewApi: adminApi(server),
    });
    const toggle = await screen.findByRole('switch', { name: 'Ver el sitio con el borrador' });
    await userEvent.click(toggle);
    const phone = await screen.findByRole('switch', { name: 'Vi lo nuevo en el teléfono' });
    await userEvent.click(phone);
    expect(await screen.findByText('Marcada por ana@ug.uchile.cl')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Ver el sitio con el borrador' }));
    await waitFor(() =>
      expect(screen.queryByText('Estás viendo el borrador, no lo publicado.')).toBeNull(),
    );
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Vi lo nuevo en el teléfono' })).toBeChecked(),
    );
    expect(screen.getByText('Marcada por ana@ug.uchile.cl')).toBeInTheDocument();
  });

  it('Revisión de cero (1.7, parte 2): signing out leaves the preview', async () => {
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: adminApi(),
      previewApi: adminApi(),
    });
    await userEvent.click(
      await screen.findByRole('switch', { name: 'Ver el sitio con el borrador' }),
    );
    expect(
      await screen.findByText('Estás viendo el borrador, no lo publicado.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tu cuenta' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Cerrar sesión/ }));
    expect(screen.queryByText('Estás viendo el borrador, no lo publicado.')).toBeNull();
    await waitFor(() => expect(window.sessionStorage.getItem('qv-preview')).toBeNull());
  });

  it('Revisión de cero (1.7, parte 2): nothing done in the preview reaches the real repositories (study, tests, reports)', async () => {
    const calls: string[] = [];
    const spy = <T extends object>(name: string, o: T): T =>
      new Proxy(o, {
        get(target, key, receiver) {
          const v: unknown = Reflect.get(target, key, receiver);
          if (typeof v !== 'function') return v;
          return (...args: unknown[]) => {
            calls.push(`${name}.${String(key)}`);
            return (v as (...a: unknown[]) => unknown).apply(target, args);
          };
        },
      });
    const services: Services = {
      session: fakeSession(SESSION_ANA),
      api: fakeApi(),
      previewApi: fakeApi(),
      study: spy('study', fullAnkiStudy()),
      quiz: spy('quiz', localQuizRepository(null)),
      admin: spy('admin', localAdminRepository({ admin: true })),
      account: acceptedAccount(),
    };
    let parts: PreviewParts | null = null;
    let preview: Preview | null = null;
    function Probe() {
      preview = usePreview();
      return null;
    }
    render(
      <PreviewSwitch
        services={services}
        client={new QueryClient()}
        previewClient={new QueryClient()}
        render={(p) => {
          parts = p;
          return <Probe />;
        }}
      />,
    );
    act(() => preview!.enter());
    const s = parts!.services;
    expect(s.api).toBe(services.previewApi);
    const card = { noteGuid: 'g', ord: 0, deckId: '20' };
    const attempts: (() => Promise<unknown>)[] = [
      () => s.quiz.save({ quizId: 'q', sectionId: 's' } as never),
      () => s.admin.reportCard({ noteGuid: 'g', ord: 0, comment: 'x' } as never),
      () => s.study.savePreferences({ fullAnki: false } as never),
      () => s.study.setDeckActivation('21', true),
      () => s.study.saveAssessmentSetting({ assessmentId: 'a', examDate: '2026-12-01' } as never),
      () => s.study.recordReview({ card, rating: 3 } as never),
      () => s.study.bury([card], new Date(), false),
      () => s.study.suspend([card], false),
      () => s.study.setFlag(card, 1),
      () => s.study.forget([card], true),
      () => s.study.savePreset({ name: 'x', config: {} } as never),
      () => s.study.setDeckPreset('20', { kind: 'author', name: 'Default' } as never),
      () => s.study.reconcileCards({ changes: [], upTo: 1 } as never),
    ];
    for (const f of attempts) await f().catch(() => undefined);
    await waitFor(() => expect(calls).toContain('admin.isAdmin'));
    // Only the reads that seed the preview, and whether the user is an administrator.
    expect(
      calls.filter(
        (c) =>
          !/^(study\.(preferences|deckActivations|assessmentSettings)|admin\.isAdmin)$/.test(c),
      ),
    ).toEqual([]);
  });

  it('without the preview API (a build that cannot), the switch is off and does nothing', async () => {
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: adminApi(),
    });
    const toggle = await screen.findByRole('switch', { name: 'Ver el sitio con el borrador' });
    expect(toggle).toBeDisabled();
    await act(async () => {
      toggle.click();
    });
    expect(window.sessionStorage.getItem('qv-preview')).toBeNull();
  });
});
