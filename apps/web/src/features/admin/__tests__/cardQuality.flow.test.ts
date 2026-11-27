// Tests «Tarjetas» in the administration panel: the hardest and the suspicious of a course, an assessment or a week,
// with their figures and links, a database without the summary, a summary not made yet, the CSV file and a failure.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CardQuality, CardQualityReport } from '@qv/schema';
import { ApiRequestError } from '../../../shared/lib/api';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../api/repository';

const admin = () => localAdminRepository({ admin: true, email: 'dueno@ug.uchile.cl' });

afterEach(() => {
  vi.restoreAllMocks();
});

const card = (over: Partial<CardQuality> = {}): CardQuality => ({
  noteGuid: 'cloze-1',
  ord: 1,
  deckId: '20',
  version: 2,
  students: 12,
  firstView: { n: 12, again: 4, low: 0.1381, high: 0.6094 },
  reviews: { n: 40, again: 10, low: 0.1422, high: 0.4004 },
  predicted: { n: 30, again: 9, expected: 0.1 },
  medianMs: 1450,
  suspended: 3,
  buried: 1,
  flagged: 2,
  leeches: 1,
  openReports: 1,
  reasons: ['unexpected', 'fast'],
  ...over,
});

const report = (
  deckId: string,
  over: Partial<Extract<CardQualityReport, { status: 'ok' }>> = {},
): CardQualityReport => ({
  status: 'ok',
  deckId,
  refreshedAt: '2026-11-26T09:37:00.000Z',
  minStudents: 5,
  measured: 2,
  few: 4,
  hardest: [
    card(),
    card({ noteGuid: 'oclusion-1', ord: 0, reasons: [], openReports: 0, flagged: 0, leeches: 0 }),
    card({
      noteGuid: 'fuera',
      ord: 0,
      deckId: '999',
      version: null,
      firstView: null,
      reviews: null,
      predicted: null,
      medianMs: null,
      reasons: [],
      openReports: 3,
      flagged: 0,
      leeches: 2,
    }),
  ],
  suspicious: [card()],
  ...over,
});

function open(answer: (deckId: string) => Promise<CardQualityReport>) {
  const asked: string[] = [];
  renderApp('/admin/cards', {
    admin: admin(),
    api: fakeApi({
      cardQuality: async (deckId) => {
        asked.push(deckId);
        return answer(deckId);
      },
    }),
  });
  return asked;
}

describe('«Tarjetas»', () => {
  it('the hardest of the course: front and code from the index, the rates with their intervals, the links', async () => {
    const asked = open(async (deck) => report(deck));
    expect(await screen.findByRole('heading', { level: 2, name: 'Tarjetas' })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Las más difíciles' });
    const [first, second] = within(list).getAllByRole('listitem');
    expect(asked).toEqual(['3']);
    expect(
      await within(first!).findByRole('link', {
        name: 'Abrir «T-PR-01-002» en el explorador de tarjetas',
      }),
    ).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1/anki/certamen-1/cards?card=1%3Acloze-1',
    );
    expect(first).toHaveTextContent('La columna tiene […] vértebras […]');
    expect(first).toHaveTextContent('T-PR-01-002 · versión 2 · Certamen 1 › S1 - Semana de prueba');
    expect(first).toHaveTextContent('Otra vez, 1.ª vista33 %14–61 %');
    expect(first).toHaveTextContent('Otra vez, repasos25 %14–40 %');
    expect(first).toHaveTextContent('FSRS esperaba10 %de 30');
    expect(first).toHaveTextContent('Mediana1,5 s');
    expect(first).toHaveTextContent('La suspendieron31 la enterraron');
    expect(first).toHaveTextContent('Falla más de lo esperado');
    expect(first).toHaveTextContent('2 con bandera · 1 sanguijuela');
    expect(within(first!).getByRole('link', { name: '1 reporte abierto' })).toHaveAttribute(
      'href',
      '/admin/reports',
    );
    expect(second).toHaveTextContent('Vértebra de prueba');
    expect(second).not.toHaveTextContent('bandera');
    // A card of a deck the catalog no longer has: its figures without a link, and «—» where there are none.
    const third = within(list).getAllByRole('listitem')[2]!;
    expect(within(third).queryByRole('link', { name: /explorador/ })).toBeNull();
    expect(third).toHaveTextContent('Otra vez, 1.ª vista—');
    expect(third).toHaveTextContent('FSRS esperaba—');
    expect(third).toHaveTextContent('Mediana—');
    expect(third).toHaveTextContent('2 sanguijuelas');
    expect(within(third).getByRole('link', { name: '3 reportes abiertos' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Calculado el 26 de noviembre de 2026 a las 06:37 · 2 tarjetas con cifras · 4 con menos de 5 estudiantes',
      ),
    ).toBeInTheDocument();
  });

  it('narrows to the assessment and the week, and the suspicious list says why', async () => {
    const asked = open(async (deck) => report(deck));
    await screen.findByRole('list', { name: 'Las más difíciles' });
    await userEvent.click(screen.getByRole('button', { name: 'Certamen: Todo el ramo' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Certamen 1' }));
    await waitFor(() => expect(asked).toEqual(['3', '4']));
    await userEvent.click(screen.getByRole('button', { name: 'Semana o clase: Todo el certamen' }));
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'S1 - Semana de prueba' }),
    );
    await waitFor(() => expect(asked).toEqual(['3', '4', '5']));
    await userEvent.click(screen.getByRole('button', { name: 'Ramo: Anatomía I' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Anatomía I' }));
    expect(screen.getByRole('button', { name: 'Semana o clase: Todo el certamen' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Lista: Las más difíciles' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Las sospechosas' }));
    const list = await screen.findByRole('list', { name: 'Las sospechosas' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent('Respuesta en menos de 2 s');
  });

  it('exports the list shown as a CSV file named after the scope and the list', async () => {
    const blobs: Blob[] = [];
    Object.assign(URL, {
      createObjectURL: (b: Blob) => {
        blobs.push(b);
        return 'blob:lista';
      },
      revokeObjectURL: vi.fn(),
    });
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    open(async (deck) => report(deck));
    await screen.findByRole('list', { name: 'Las más difíciles' });
    await userEvent.click(screen.getByRole('button', { name: /Exportar la lista/ }));
    expect(saved).toEqual(['Las más difíciles - Anatomía I.csv']);
    const text = await blobs[0]!.text();
    expect(text.split('\r\n')).toHaveLength(5);
    expect(text).toContain('T-PR-01-002;2;');
  });

  it('without rows, with the summary not made yet or a database without it, it says so', async () => {
    open(async (deck) =>
      report(deck, { measured: 0, few: 3, hardest: [], suspicious: [], refreshedAt: null }),
    );
    expect(
      await screen.findByText('Todavía ninguna tarjeta de aquí la vieron 5 estudiantes o más.'),
    ).toBeInTheDocument();
    // Its place keeps the longest summary too, hidden: the one that is read is the other.
    expect(
      screen
        .getAllByText('Las cifras todavía no se calculan: se calculan cada noche.')
        .filter((e) => !e.closest('[aria-hidden="true"]')),
    ).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Exportar la lista/ })).toBeDisabled();
  });

  it('a database without the summary: the notice instead of the list', async () => {
    open(async (deckId) => ({ status: 'unavailable', deckId }));
    expect(
      await screen.findByText(/todavía no están disponibles en este sitio/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Las más difíciles' })).toBeNull();
  });

  it('a failure offers to try again, and trying again reads it', async () => {
    let fail = true;
    open(async (deck) => {
      if (fail) throw new ApiRequestError(503, 'card_quality_unavailable', 'No se pudieron leer.');
      return report(deck);
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    fail = false;
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Las más difíciles' })).toBeInTheDocument();
  });

  it('without any course with cards there is nothing to ask for', async () => {
    const empty = structuredClone(CATALOG);
    empty.anki.decks = [];
    const asked: string[] = [];
    renderApp('/admin/cards', {
      admin: admin(),
      api: fakeApi({
        catalog: async () => empty,
        cardQuality: async (deckId) => {
          asked.push(deckId);
          return report(deckId);
        },
      }),
    });
    expect(await screen.findByText('Todavía no hay ramos con tarjetas.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ramo' })).toBeDisabled();
    expect(asked).toEqual([]);
  });
});
