// Tests for the announcements in the panel: publishing with one, without one or with one that could not be saved, and
// «Anuncios» with its list, writing one about the site, saving again a failed one and withdrawing one.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminAnnouncement, PublishRequest, ReleaseOverview } from '@qv/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../../shared/lib/api';
import { renderApp } from '../../../test/render';
import { RELEASE_SUMMARY, releaseApi } from '../../../test/releases';
import { localAdminRepository } from '../api/repository';

afterEach(() => window.sessionStorage.clear());

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

const row = (o: Partial<AdminAnnouncement>): AdminAnnouncement => ({
  id: 1,
  releaseId: null,
  releaseTitle: null,
  kind: 'site',
  title: 'Sitio',
  body: '',
  items: [],
  createdAt: '2026-11-24T12:00:00.000Z',
  createdBy: 'ana@ug.uchile.cl',
  publishAt: '2026-11-24T12:30:00.000Z',
  withdrawnAt: null,
  withdrawnBy: null,
  status: 'out',
  ...o,
});

async function openPublish(answer: 'none' | 'saved' | 'failed' = 'saved', overview = READY) {
  const publishRelease = vi.fn(async (body: PublishRequest) => ({
    id: 4,
    title: body.title,
    publishedAt: '2026-11-07T15:00:00Z',
    changes: {},
    announcement: answer,
  }));
  const saveAnnouncement = vi.fn((_body: unknown) =>
    Promise.resolve(row({ id: 9, releaseId: 4, status: 'waiting' })),
  );
  renderApp('/admin/releases', {
    admin: localAdminRepository({ admin: true }),
    api: releaseApi({
      releaseOverview: async () => overview,
      publishRelease,
      saveAnnouncement,
      announcements: async () => ({ announcements: [] }),
    }),
  });
  const button = await screen.findByRole('button', { name: 'Publicar' });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  const dialog = await screen.findByRole('alertdialog', { name: '¿Publicar el borrador?' });
  return { dialog, publishRelease, saveAnnouncement };
}

describe('publishing with an announcement', () => {
  it('the proposal can be edited; it goes with the publication', async () => {
    const { dialog, publishRelease } = await openPublish();
    const title = within(dialog).getByRole('textbox', { name: 'Título' });
    await userEvent.clear(title);
    await userEvent.type(title, 'Clases para el próximo certamen');
    expect(within(dialog).getByText(/: el calendario de este semestre\.$/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tipo: Material nuevo' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Material actualizado' }));
    const publish = within(dialog).getByRole('button', { name: 'Publicar' });
    await userEvent.clear(title);
    expect(publish).toBeDisabled();
    await userEvent.type(title, 'Clases nuevas');
    await userEvent.click(publish);
    await waitFor(() => expect(publishRelease).toHaveBeenCalledOnce());
    expect(publishRelease.mock.calls[0]![0].announcement).toMatchObject({
      kind: 'update',
      title: 'Clases nuevas',
    });
  });

  it('with the switch off it goes without one, and the empty title does not stop it', async () => {
    const { dialog, publishRelease } = await openPublish('none');
    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Título' }));
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Avisar a los alumnos' }));
    expect(within(dialog).getByRole('textbox', { name: 'Título' })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(publishRelease).toHaveBeenCalledOnce());
    expect(publishRelease.mock.calls[0]![0].announcement).toBeNull();
  });

  it('a draft about no course starts without one, and cannot have one', async () => {
    const siteOnly = {
      ...READY,
      summary: {
        ...READY.summary,
        assessments: READY.summary.assessments.map((a) => ({ ...a, courseId: null })),
      },
    };
    const { dialog } = await openPublish('none', siteOnly);
    const toggle = within(dialog).getByRole('switch', { name: 'Avisar a los alumnos' });
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeDisabled();
  });

  it('a draft that only changes format starts without one, and can have it', async () => {
    const zero = { added: 0, removed: 0, answer: 0, noAnswer: 0, format: 0, moved: 0 };
    const formatOnly = {
      ...READY,
      summary: {
        ...READY.summary,
        assessments: READY.summary.assessments.map((a) => ({
          ...a,
          articles: { added: 0, removed: 0, content: 0, format: 2 },
          questions: { ...zero, keyChanged: 0, total: a.questions.total },
          cards: { ...zero, notes: 0 },
          quizzes: [],
          decks: [],
        })),
      },
    };
    const { dialog, publishRelease } = await openPublish('saved', formatOnly);
    const toggle = within(dialog).getByRole('switch', { name: 'Avisar a los alumnos' });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(toggle).toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(publishRelease).toHaveBeenCalledOnce());
    expect(publishRelease.mock.calls[0]![0].announcement).toMatchObject({
      kind: 'update',
      body: '',
    });
  });

  it('one that could not be saved: a notice that leads to «Anuncios», where it is saved again', async () => {
    const { dialog, saveAnnouncement } = await openPublish('failed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar' }));
    const notice = await screen.findByText('Se publicó, pero el anuncio no se guardó.');
    expect(notice).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ir a Anuncios' }));
    expect(
      await screen.findByRole('heading', {
        name: 'El anuncio de la publicación n.º 4 no se guardó',
      }),
    ).toBeInTheDocument();
    saveAnnouncement.mockRejectedValueOnce(new ApiRequestError(503, 'internal', ''));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar de nuevo' }));
    expect(
      await screen.findByText('No se pudo guardar. Inténtalo de nuevo.', {
        selector: 'p[role="alert"]',
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar de nuevo' }));
    await waitFor(() => expect(saveAnnouncement).toHaveBeenCalledTimes(2));
    expect(saveAnnouncement.mock.calls[0]).toMatchObject([{ releaseId: 4, kind: 'new' }]);
    await waitFor(() => expect(screen.queryByRole('heading', { name: /no se guardó/ })).toBeNull());
  });

  it('the notice closes with its ✕', async () => {
    const { dialog } = await openPublish('failed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar el aviso' }));
    expect(screen.queryByText('Se publicó, pero el anuncio no se guardó.')).toBeNull();
  });
});

describe('«Anuncios»', () => {
  const LIST = [
    row({ id: 3, status: 'waiting', title: 'Por salir', body: 'Texto.' }),
    row({ id: 2, releaseId: 5, releaseTitle: 'Física · Certamen 3', kind: 'new', title: 'Afuera' }),
    row({
      id: 4,
      releaseId: 6,
      kind: 'update',
      title: 'Sin título de publicación',
      status: 'withdrawn',
    }),
    row({
      id: 1,
      title: 'Retirado',
      status: 'withdrawn',
      withdrawnAt: '2026-11-24T13:00:00.000Z',
      withdrawnBy: 'ana@ug.uchile.cl',
    }),
  ];

  it('every announcement with its status and origin; one is withdrawn from its popup', async () => {
    const withdrawAnnouncement = vi
      .fn()
      .mockRejectedValueOnce(new ApiRequestError(503, 'internal', ''))
      .mockResolvedValueOnce(row({ id: 3, status: 'withdrawn' }));
    renderApp('/admin/announcements', {
      admin: localAdminRepository({ admin: true }),
      api: releaseApi({
        announcements: async () => ({ announcements: LIST }),
        withdrawAnnouncement,
      }),
    });
    await screen.findByText('Por salir');
    const [waiting, out, undone, withdrawn] = [
      ...document.querySelectorAll<HTMLElement>('[data-announcement]'),
    ];
    expect(waiting).toHaveTextContent(
      /Sale el 24 de noviembre de 2026.*Del sitio.*Por salir.*Texto\./,
    );
    expect(out).toHaveTextContent('Lo ven los alumnos·De la publicación «Física · Certamen 3»');
    expect(undone).toHaveTextContent('Retirado·De la publicación n.º 6');
    expect(undone).toHaveTextContent('La publicación se deshizo.');
    expect(within(withdrawn!).getByRole('button', { name: 'Retirar' })).toBeDisabled();
    await userEvent.click(within(waiting!).getByRole('button', { name: 'Retirar' }));
    const dialog = await screen.findByRole('alertdialog', { name: '¿Retirar el anuncio?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retirar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No se pudo retirar. Inténtalo de nuevo.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retirar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(withdrawAnnouncement).toHaveBeenLastCalledWith(3);
    await userEvent.click(within(waiting!).getByRole('button', { name: 'Retirar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('writing one about the site: saved, then the fields are empty again; a failure says so', async () => {
    const saveAnnouncement = vi
      .fn()
      .mockRejectedValueOnce(new ApiRequestError(503, 'internal', ''))
      .mockResolvedValueOnce(row({ id: 7, status: 'waiting' }));
    renderApp('/admin/announcements', {
      admin: localAdminRepository({ admin: true }),
      api: releaseApi({ announcements: async () => ({ announcements: [] }), saveAnnouncement }),
    });
    expect(await screen.findByText('Todavía no hay anuncios.')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Guardar el anuncio' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: 'Título' }), 'El explorador cambió');
    await userEvent.type(screen.getByRole('textbox', { name: 'Texto' }), 'Ahora busca más.');
    await userEvent.click(save);
    const failed = { selector: 'p' };
    expect(
      await screen.findByText('No se pudo guardar. Inténtalo de nuevo.', failed),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Texto' }), ' ');
    expect(screen.queryByText('No se pudo guardar. Inténtalo de nuevo.', failed)).toBeNull();
    await userEvent.click(save);
    expect(await screen.findByText('Guardado: sale en 30 minutos.')).toBeInTheDocument();
    expect(saveAnnouncement).toHaveBeenLastCalledWith({
      kind: 'site',
      title: 'El explorador cambió',
      body: 'Ahora busca más.',
      items: [],
      releaseId: null,
    });
    expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('');
  });

  it('while the list comes, and if it cannot be read', async () => {
    const first = renderApp('/admin/announcements', {
      admin: localAdminRepository({ admin: true }),
      api: releaseApi({ announcements: () => new Promise(() => undefined) }),
    });
    expect(await screen.findByRole('heading', { name: 'Todos los anuncios' })).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    first.unmount();
    renderApp('/admin/announcements', {
      admin: localAdminRepository({ admin: true }),
      api: releaseApi({
        announcements: async () => {
          throw new ApiRequestError(503, 'internal', '');
        },
      }),
    });
    expect(await screen.findByText('No se pudieron leer los anuncios.')).toBeInTheDocument();
  });
});
