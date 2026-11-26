// Tests the parts of «Publicaciones» one by one: the changes of each kind with their before and after, the lines of
// what changes in the site, a long check, the impact of each deck, the marks' failures and the record.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  ReleaseArticleItem,
  ReleaseCardItem,
  ReleaseOverview,
  ReleaseQuestionItem,
  ReleaseRecord,
  ReleaseSummary,
} from '@qv/schema';
import { ApiRequestError } from '../../../shared/lib/api';
import type { fakeApi } from '../../../test/fakes/api';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../api/repository';
import {
  RELEASE_ITEMS,
  RELEASE_OVERVIEW,
  RELEASE_SUMMARY,
  releaseApi,
} from '../../../test/releases';

const page = (assessment: string, kind: string) => ({
  items: RELEASE_ITEMS[`${assessment}|${kind}`] ?? [],
  next: null,
});

const adminApi = (changes: Parameters<typeof releaseApi>[0] = {}) =>
  releaseApi({
    releaseCards: async (a) => page(a, 'card') as { items: ReleaseCardItem[]; next: null },
    releaseArticles: async (a) => page(a, 'article') as { items: ReleaseArticleItem[]; next: null },
    releaseQuestions: async (a) =>
      page(a, 'question') as { items: ReleaseQuestionItem[]; next: null },
    ...changes,
  });

const open = (api: ReturnType<typeof fakeApi>, admin = localAdminRepository({ admin: true })) =>
  renderApp('/admin/releases', { admin, api });

const text = (el: Element) => el.textContent;

/** The tab's changes came: its list is there and nothing is loading. */
const loaded = (el: HTMLElement) =>
  waitFor(() => {
    expect(el.querySelector('[aria-busy]')).toBeNull();
    expect(el.querySelector('ul.divide-y')).not.toBeNull();
  });

afterEach(() => window.sessionStorage.clear());

describe('«Publicaciones», piece by piece', () => {
  it('each kind of change, with its before and after, as the tabs open them', async () => {
    open(adminApi());
    const anatomy = await screen.findByRole('article', { name: 'Anatomía I · Certamen 1' });
    const cellBio = screen.getByRole('article', { name: /Biología celular · Certamen 2/ });
    // How many saw each deck comes on its own time: the snapshot waits for it, not for the speed of the machine.
    await waitFor(() => expect(anatomy).not.toHaveTextContent('contando…'));
    expect(text(anatomy)).toMatchSnapshot('anatomy before a tab');
    await userEvent.click(within(anatomy).getByRole('button', { name: /^Tarjetas/ }));
    await loaded(anatomy);
    expect(text(anatomy)).toMatchSnapshot('anatomy cards');
    await userEvent.click(within(cellBio).getByRole('button', { name: /^Artículos/ }));
    await loaded(cellBio);
    expect(text(cellBio)).toMatchSnapshot('cell biology articles');
    await userEvent.click(within(cellBio).getByRole('button', { name: /^Preguntas/ }));
    await loaded(cellBio);
    expect(text(cellBio)).toMatchSnapshot('cell biology questions');
    await userEvent.click(within(cellBio).getByRole('button', { name: /^Preguntas/ }));
    expect(within(cellBio).getByRole('button', { name: /^Preguntas/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('what changes in the site: semesters, courses, note types, presets and decks, each in its line', async () => {
    const deck = (over: Partial<ReleaseSummary['decks'][number]>) => ({
      id: '1',
      name: 'A::B::Mazo uno',
      nameBefore: null,
      op: 'changed' as const,
      cardsBefore: 1,
      cardsAfter: 1,
      presetBefore: 'Una',
      presetAfter: 'Una',
      ...over,
    });
    const overview: ReleaseOverview = {
      ...RELEASE_OVERVIEW,
      summary: {
        ...RELEASE_SUMMARY,
        catalog: [
          { kind: 'semester', id: 's9', op: 'added', before: null, after: { name: 'Semestre 9' } },
          { kind: 'course', id: 'c1', op: 'removed', before: { name: 'Ramo uno' }, after: null },
          { kind: 'course', id: 'c2', op: 'changed', before: null, after: null },
        ],
        noteTypes: [
          { id: 'n1', name: 'Básica', op: 'added' },
          { id: 'n2', name: 'Cloze', op: 'changed' },
        ],
        presets: [
          { name: 'Rápida', op: 'removed' },
          { name: 'Lenta', op: 'added' },
        ],
        decks: [
          deck({ id: '1', op: 'added' }),
          deck({ id: '2', op: 'removed', name: 'A::Mazo dos' }),
          deck({ id: '3', nameBefore: 'A::Viejo', name: 'A::Nuevo' }),
          deck({ id: '4', presetBefore: null, presetAfter: 'Lenta' }),
          deck({ id: '5', presetBefore: 'Lenta', presetAfter: null }),
          deck({ id: '6' }),
        ],
      },
      browseIndexes: [{ assessmentId: 'anatomia-1/certamen-1', op: 'removed' }],
    };
    open(adminApi({ releaseOverview: async () => overview }));
    const changes = await screen.findByRole('region', { name: 'Qué cambia' });
    const lines = within(changes).getAllByRole('list')[0]!.querySelectorAll(':scope > li');
    expect([...lines].map(text)).toMatchSnapshot();
  });

  it('a check with more than 8 items shows 8, then all, then 8 again', async () => {
    const missing = Array.from({ length: 11 }, (_, i) => `img-${i}.png`);
    open(adminApi({ releaseMedia: async () => ({ checked: [], missing, next: null }) }));
    const row = await waitFor(() => {
      const r = document.querySelector('[data-rule="missing_image"]');
      expect(r?.textContent).toMatch(/11/);
      return r!;
    });
    expect(within(row as HTMLElement).getAllByRole('listitem')).toHaveLength(9);
    expect(text(row)).toMatchSnapshot('eight');
    await userEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Ver los 11' }));
    expect(within(row as HTMLElement).getAllByRole('listitem')).toHaveLength(12);
    await userEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Ver menos' }));
    expect(within(row as HTMLElement).getAllByRole('listitem')).toHaveLength(9);
  });

  it('whom it reaches: counting, the count, or that it could not be counted', async () => {
    open(adminApi());
    const anatomy = await screen.findByRole('article', { name: 'Anatomía I · Certamen 1' });
    await waitFor(() => expect(anatomy).toHaveTextContent(/0 alumnos vieron sus tarjetas/));
    expect(text(within(anatomy).getByText('A quién llega').parentElement!)).toMatchSnapshot();
  });

  it('whom it reaches, when the count fails', async () => {
    const admin = localAdminRepository({ admin: true });
    open(adminApi(), {
      ...admin,
      deckImpact: async () => {
        throw new Error('offline');
      },
    });
    const anatomy = await screen.findByRole('article', { name: 'Anatomía I · Certamen 1' });
    await waitFor(() => expect(anatomy).toHaveTextContent(/no se pudo contar/), {
      timeout: 5000,
    });
    expect(text(within(anatomy).getByText('A quién llega').parentElement!)).toMatchSnapshot();
  });

  it('a mark that could not be saved, and one refused because the draft changed', async () => {
    let status = 500;
    open(
      adminApi({
        setReleaseMark: async () => {
          throw new ApiRequestError(status, status === 409 ? 'release_changed' : 'internal', 'x');
        },
      }),
    );
    const phone = await screen.findByRole('switch', { name: 'Vi lo nuevo en el teléfono' });
    await userEvent.click(phone);
    expect(
      await screen.findByText('No se pudo guardar la marca. Inténtalo de nuevo.'),
    ).toHaveAttribute('role', 'alert');
    await waitFor(() => expect(phone).not.toBeChecked());
    status = 409;
    await userEvent.click(phone);
    expect(
      await screen.findByText(
        'El borrador cambió desde que lo abriste: revisa de nuevo lo que trae.',
      ),
    ).toBeInTheDocument();
  });

  it('a review whose texts or images could not be read says so', async () => {
    open(
      adminApi({
        releaseTexts: async () => {
          throw new Error('offline');
        },
      }),
    );
    expect(
      await screen.findByText(
        /No se pudieron revisar las imágenes o los textos/,
        {},
        { timeout: 5000 },
      ),
    ).toHaveAttribute('role', 'alert');
    expect(text(screen.getByRole('region', { name: 'Lista de revisión' }))).toMatchSnapshot();
  });

  it('the record and the last publication, published and undone, with who and when', async () => {
    const record = (id: number, over: Partial<ReleaseRecord> = {}): ReleaseRecord => ({
      id,
      status: 'published',
      title: `Publicación ${id}`,
      schemaVersion: 1,
      publishedAt: '2026-11-07T15:00:00.000+00:00',
      publishedBy: 'alguien@ug.uchile.cl',
      revertedAt: null,
      revertedBy: null,
      changes: {},
      canRevert: false,
      ...over,
    });
    open(
      adminApi({
        releaseLog: async () => ({
          releases: [
            record(3, {
              status: 'reverted',
              revertedAt: '2026-11-08T10:00:00.000+00:00',
              revertedBy: 'otra@ug.uchile.cl',
            }),
            record(2, { status: 'reverted', revertedAt: '2026-11-08T09:00:00.000+00:00' }),
            record(1),
          ],
        }),
      }),
    );
    const last = await screen.findByRole('region', { name: 'Última publicación' });
    await waitFor(() => expect(last).toHaveTextContent('N.º 3'));
    expect(text(last)).toMatchSnapshot('last');
    expect(text(screen.getByRole('region', { name: 'Registro de publicaciones' }))).toMatchSnapshot(
      'record',
    );
  });

  it('the popup to publish, with the warnings of the list', async () => {
    const ready: ReleaseOverview = {
      ...RELEASE_OVERVIEW,
      summary: {
        ...RELEASE_SUMMARY,
        findings: RELEASE_SUMMARY.findings.filter((f) => f.rule !== 'class_without_year'),
        marks: [
          { mark: 'answers', checkedBy: 'a@ug.uchile.cl', checkedAt: '2026-11-07T12:00:00Z' },
          { mark: 'phone', checkedBy: 'a@ug.uchile.cl', checkedAt: '2026-11-07T12:00:00Z' },
        ],
      },
      browseIndexes: [{ assessmentId: 'anatomia-1/certamen-1', op: 'added' }],
    };
    open(adminApi({ releaseOverview: async () => ready }));
    const button = await screen.findByRole('button', { name: 'Publicar' });
    await waitFor(() => expect(button).toBeEnabled());
    expect(text(screen.getByRole('region', { name: 'Lista de revisión' }))).toMatchSnapshot('list');
    await userEvent.click(button);
    const dialog = await screen.findByRole('alertdialog', { name: '¿Publicar el borrador?' });
    expect(text(dialog)).toMatchSnapshot('popup');
  });
});
