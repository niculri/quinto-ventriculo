// Tests «Publicaciones»: the review list, what changes, the marks by hand, publishing and undoing, without network.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReleaseOverview } from '@qv/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../../shared/lib/api';
import { fakeApi } from '../../../test/fakes/api';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../api/repository';
import { RELEASE_SUMMARY, releaseApi } from '../../../test/releases';

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
      api: releaseApi({ setReleaseMark }),
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
      expect(setReleaseMark).toHaveBeenCalledWith(RELEASE_SUMMARY.fingerprint, 'phone', true),
    );
    expect(await screen.findByText('Marcada por ana@ug.uchile.cl')).toBeInTheDocument();
  });

  it('a draft equal to what is published says so', async () => {
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: releaseApi({
        releaseOverview: async () => ({
          supportedSchemaVersion: 1,
          summary: {
            ...RELEASE_SUMMARY,
            assessments: [],
            catalog: [],
            noteTypes: [],
            presets: [],
            decks: [],
            findings: [],
          },
          browseIndexes: [],
        }),
      }),
    });
    expect(await screen.findByText(/El borrador es igual a lo publicado/)).toBeInTheDocument();
  });

  // The summary does not describe the card browser's indexes; a draft with only them is not empty.
  it('a draft whose only change is the card browser’s indexes can be reviewed and published', async () => {
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: releaseApi({
        releaseOverview: async () => ({
          supportedSchemaVersion: 1,
          summary: {
            ...RELEASE_SUMMARY,
            assessments: [],
            catalog: [],
            noteTypes: [],
            presets: [],
            decks: [],
            findings: [],
          },
          browseIndexes: [
            { assessmentId: 'anatomia-1/certamen-1', op: 'added' },
            { assessmentId: 'otro/certamen-9', op: 'changed' },
          ],
        }),
      }),
    });
    expect(
      await screen.findByText(/Las tarjetas de «.*Certamen 1» se pueden explorar\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText('El explorador de tarjetas de «otro/certamen-9» se actualiza.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/El borrador es igual a lo publicado/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeInTheDocument();
  });
});

describe('publishing and undoing', () => {
  const READY: ReleaseOverview = {
    supportedSchemaVersion: 1,
    summary: {
      ...RELEASE_SUMMARY,
      findings: RELEASE_SUMMARY.findings.filter((f) => f.rule !== 'class_without_year'),
      marks: [
        { mark: 'answers', checkedBy: 'ana@ug.uchile.cl', checkedAt: '2026-11-07T12:00:00Z' },
        { mark: 'phone', checkedBy: 'ana@ug.uchile.cl', checkedAt: '2026-11-07T12:00:00Z' },
      ],
    },
    browseIndexes: [],
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
      api: releaseApi(),
    });
    expect(await screen.findByText('Hay 1 regla que impide publicar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(
      await screen.findByText('Todavía no hay publicaciones.', { selector: 'p[role=status]' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deshacer la última publicación' })).toBeDisabled();
  });

  it('publishes from its popup what the panel showed, with its review list; then shows it', async () => {
    const catalog = vi.fn(fakeApi().catalog);
    let log = [] as ReturnType<typeof record>[];
    let overview = READY;
    const publishRelease = vi.fn(async (body: { fingerprint: string; title: string }) => {
      log = [record(1)];
      overview = { ...READY, summary: { ...READY.summary, assessments: [], findings: [] } };
      return { id: 1, title: body.title, publishedAt: '2026-11-07T15:00:00Z', changes: {} };
    });
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: releaseApi({
        releaseOverview: async () => overview,
        releaseLog: async () => ({ releases: log }),
        publishRelease,
        catalog,
      }),
    });
    const button = await screen.findByRole('button', { name: 'Publicar' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    const dialog = await screen.findByRole('alertdialog', { name: '¿Publicar el borrador?' });
    expect(dialog).toHaveTextContent('Anatomía I · Certamen 1 y Biología celular · Certamen 2');
    expect(dialog).toHaveTextContent(/Anatomía I · Certamen 1: .*tarjeta nueva/);
    expect(publishRelease).not.toHaveBeenCalled();
    const readBefore = catalog.mock.calls.length;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(publishRelease).toHaveBeenCalledWith({
      fingerprint: READY.summary.fingerprint,
      title: 'Anatomía I · Certamen 1 y Biología celular · Certamen 2',
      checks: expect.objectContaining({ blocking: 0, pending: 0, ready: true }) as unknown,
    });
    expect(await screen.findByText(/N\.º 1 · Anatomía I/)).toBeInTheDocument();
    expect(await screen.findByText(/El borrador es igual a lo publicado/)).toBeInTheDocument();
    // What the site already read of the material is read again: the menu shows what was published.
    await waitFor(() => expect(catalog.mock.calls.length).toBeGreaterThan(readBefore));
  });

  it('the empty assessments of the catalog are one line each, with their course', async () => {
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
      api: releaseApi({ releaseOverview: async () => overview }),
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
      api: releaseApi({ releaseOverview: async () => READY, publishRelease }),
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

  it('undoes the last publication from its popup, and reads the material again', async () => {
    const catalog = vi.fn(fakeApi().catalog);
    let log = [record(2), { ...record(1), canRevert: false }];
    const revertRelease = vi.fn(async (id: number) => {
      log = [record(2, 'reverted'), { ...record(1), canRevert: false }];
      return { id, revertedAt: '2026-11-07T15:10:00Z', changes: {} };
    });
    renderApp('/admin/releases', {
      admin: localAdminRepository({ admin: true }),
      api: releaseApi({ releaseLog: async () => ({ releases: log }), revertRelease, catalog }),
    });
    const undo = await screen.findByRole('button', { name: 'Deshacer la última publicación' });
    await waitFor(() => expect(undo).toBeEnabled());
    await userEvent.click(undo);
    const dialog = await screen.findByRole('alertdialog', {
      name: '¿Deshacer la publicación n.º 2?',
    });
    const readBefore = catalog.mock.calls.length;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deshacer' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(revertRelease).toHaveBeenCalledWith(2);
    await waitFor(() => expect(catalog.mock.calls.length).toBeGreaterThan(readBefore));
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
