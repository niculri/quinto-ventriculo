// Tests «Publicaciones» at its edges: «Reintentar» on what cannot be read, «Ver más», a mark taken off, an undo that
// fails, and an assessment's suggested date and decks.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReleaseCardItem, ReleaseOverview, ReleaseRecord } from '@qv/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../../shared/lib/api';
import { renderApp } from '../../../test/render';
import { RELEASE_OVERVIEW, RELEASE_SUMMARY, releaseApi } from '../../../test/releases';
import { localAdminRepository } from '../api/repository';

afterEach(() => window.sessionStorage.clear());

const open = (api: ReturnType<typeof releaseApi>) =>
  renderApp('/admin/releases', { admin: localAdminRepository({ admin: true }), api });

const offline = () => new ApiRequestError(503, 'unavailable', 'Sin conexión de prueba.');

const cardItem = (guid: string): ReleaseCardItem => ({
  guid,
  op: 'added',
  classification: null,
  changedFields: [],
  code: guid,
  versionBefore: null,
  versionAfter: null,
  noteType: null,
  fieldsBefore: null,
  fieldsAfter: { Frente: 'frente' },
  cards: [],
});

describe('what cannot be read', () => {
  it('the draft: «Reintentar» reads it again', async () => {
    let fails = true;
    open(
      releaseApi({
        releaseOverview: async () => {
          if (fails) throw offline();
          return RELEASE_OVERVIEW;
        },
      }),
    );
    expect(await screen.findByText('Sin conexión de prueba.')).toBeInTheDocument();
    fails = false;
    await userEvent.click(screen.getAllByRole('button', { name: 'Reintentar' })[0]!);
    expect(
      await screen.findByRole('article', { name: 'Anatomía I · Certamen 1' }),
    ).toBeInTheDocument();
  });

  it('the record: «Reintentar» reads it again', async () => {
    let fails = true;
    open(
      releaseApi({
        releaseLog: async () => {
          if (fails) throw offline();
          return { releases: [] };
        },
      }),
    );
    const record = await screen.findByRole('region', { name: 'Registro de publicaciones' });
    const retry = await within(record).findByRole('button', { name: 'Reintentar' });
    fails = false;
    await userEvent.click(retry);
    expect(await within(record).findByText('Todavía no hay publicaciones.')).toBeInTheDocument();
  });

  it('a tab: «Reintentar» reads it again, and «Ver más» brings the next page', async () => {
    let fails = true;
    const releaseCards = vi.fn(async (_a: string, after: string | null) => {
      if (fails) throw offline();
      return after === null
        ? { items: [cardItem('T-UNO')], next: 'p2' }
        : { items: [cardItem('T-DOS')], next: null };
    });
    open(releaseApi({ releaseCards }));
    const anatomy = await screen.findByRole('article', { name: 'Anatomía I · Certamen 1' });
    await userEvent.click(within(anatomy).getByRole('button', { name: /^Tarjetas/ }));
    const retry = await within(anatomy).findByRole('button', { name: 'Reintentar' });
    fails = false;
    await userEvent.click(retry);
    expect(await within(anatomy).findByText('T-UNO')).toBeInTheDocument();
    await userEvent.click(within(anatomy).getByRole('button', { name: 'Ver más' }));
    expect(await within(anatomy).findByText('T-DOS')).toBeInTheDocument();
    expect(within(anatomy).queryByRole('button', { name: 'Ver más' })).toBeNull();
    expect(releaseCards.mock.calls.map((c) => c[1])).toEqual([null, null, 'p2']);
  });
});

describe('the marks by hand', () => {
  it('a mark taken off goes away at once, before the answer', async () => {
    const overview: ReleaseOverview = {
      ...RELEASE_OVERVIEW,
      summary: {
        ...RELEASE_SUMMARY,
        marks: [
          { mark: 'phone', checkedBy: 'ana@ug.uchile.cl', checkedAt: '2026-11-07T12:00:00Z' },
        ],
      },
    };
    let answer: (v: { marks: [] }) => void = () => undefined;
    const setReleaseMark = vi.fn(() => new Promise<{ marks: [] }>((r) => (answer = r)));
    open(releaseApi({ releaseOverview: async () => overview, setReleaseMark }));
    const phone = await screen.findByRole('switch', { name: 'Vi lo nuevo en el teléfono' });
    expect(screen.getByText('Marcada por ana@ug.uchile.cl')).toBeInTheDocument();
    await userEvent.click(phone);
    await waitFor(() => expect(screen.queryByText('Marcada por ana@ug.uchile.cl')).toBeNull());
    expect(phone).not.toBeChecked();
    expect(setReleaseMark).toHaveBeenCalledWith(RELEASE_SUMMARY.fingerprint, 'phone', false);
    answer({ marks: [] });
  });
});

describe('undoing', () => {
  it('a failure without a message says it could not, and the popup stays', async () => {
    const record: ReleaseRecord = {
      id: 4,
      status: 'published',
      title: 'Publicación 4',
      schemaVersion: 1,
      publishedAt: '2026-11-07T15:00:00.000+00:00',
      publishedBy: 'alguien@ug.uchile.cl',
      revertedAt: null,
      revertedBy: null,
      changes: {},
      canRevert: true,
    };
    open(
      releaseApi({
        releaseLog: async () => ({ releases: [record] }),
        revertRelease: async () => {
          throw new Error('');
        },
      }),
    );
    const undo = await screen.findByRole('button', { name: 'Deshacer la última publicación' });
    await waitFor(() => expect(undo).toBeEnabled());
    await userEvent.click(undo);
    const dialog = await screen.findByRole('alertdialog', {
      name: '¿Deshacer la publicación n.º 4?',
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deshacer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No se pudo deshacer. Inténtalo de nuevo.',
    );
  });
});

describe('an assessment', () => {
  it('says its suggested date, and a deck without a name by its id', async () => {
    const [anatomy, ...rest] = RELEASE_SUMMARY.assessments;
    const overview: ReleaseOverview = {
      ...RELEASE_OVERVIEW,
      summary: {
        ...RELEASE_SUMMARY,
        assessments: [
          {
            ...anatomy!,
            suggestedDate: '2026-12-01',
            impactDecks: [{ id: '999', name: null, cards: 2 }],
          },
          ...rest,
        ],
      },
    };
    open(releaseApi({ releaseOverview: async () => overview }));
    const card = await screen.findByRole('article', { name: 'Anatomía I · Certamen 1' });
    expect(card).toHaveTextContent('Prueba sugerida: 2026-12-01');
    await waitFor(() => expect(card).toHaveTextContent(/999: 0 alumnos vieron sus tarjetas/));
  });
});
