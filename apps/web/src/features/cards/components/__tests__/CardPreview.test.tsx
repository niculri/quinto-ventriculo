// Tests the table's preview of a card: its sides, a card it could not read, a report sent before the card arrived or
// cancelled, and the information's blanks for what the card does not have.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SchedTiming } from '@qv/srs';
import { describe, expect, it, vi } from 'vitest';
import { browseCard } from '../../../../test/cardsFakes';
import { renderWithServices } from '../../../../test/cardsUiRender';
import { fakeApi } from '../../../../test/fakes/api';
import { ApiRequestError } from '../../../../shared/lib/api';
import { localReportsRepository } from '../../../reports/api/repository';
import { CardInfo, CardPreview } from '../CardPreview';

const TIMING = { now: 1_800_000_000 } as SchedTiming;
const CARD = browseCard({ noteGuid: 's@/AqX%n?#', key: 's@/AqX%n?#/0', note: { guid: 's@/AqX%n?#' } });

const facts = () => {
  const dl = within(screen.getByRole('region', { name: 'Información de la tarjeta' })).getAllByRole('definition');
  const terms = within(screen.getByRole('region', { name: 'Información de la tarjeta' })).getAllByRole('term');
  return Object.fromEntries(terms.map((t, i) => [t.textContent, dl[i]!.textContent]));
};

describe('CardPreview', () => {
  it('a card it could not read says so, and «Reintentar» reads it again', async () => {
    let fail = true;
    const base = fakeApi();
    const api = fakeApi({
      card: async (guid, ord) => {
        if (fail) throw new ApiRequestError(500, 'internal', 'Falló la red.');
        return base.card(guid, ord);
      },
    });
    renderWithServices(<CardPreview card={CARD} timing={TIMING} onEnlarge={vi.fn()} />, { api });
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    fail = false;
    await userEvent.click(retry);
    expect(await screen.findByRole('region', { name: 'Frente de la tarjeta' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reverso' }));
    expect(await screen.findByRole('region', { name: 'Reverso de la tarjeta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reverso' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a report sent before the card arrived goes without its code; a cancelled one says nothing', async () => {
    const reports = localReportsRepository({ admin: true });
    const send = vi.spyOn(reports, 'send');
    const api = fakeApi({ card: () => new Promise(() => {}) });
    renderWithServices(<CardPreview card={CARD} timing={TIMING} onEnlarge={vi.fn()} />, { api, reports });
    expect(screen.getByText('Cargando la tarjeta…')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reportar error' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('Gracias: tu reporte le llegó al autor.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Reportar error' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'Falta algo');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Gracias: tu reporte le llegó al autor.')).toBeInTheDocument();
    expect(send.mock.calls[0]![0]).toMatchObject({ kind: 'card', id: 's@/AqX%n?#:0', code: null, version: null });
  });
});

describe('CardInfo', () => {
  it('a card without note type, deck or code shows a dash for each', async () => {
    renderWithServices(
      <CardInfo card={browseCard({ note: { code: null } })} timing={TIMING} />,
    );
    await screen.findByText('Todavía no la has estudiado.');
    expect(facts()).toMatchObject({ 'Tipo de nota': '—', Mazo: '—', Código: '—', Agregada: '—' });
  });

  it('the deck is named without its root', async () => {
    renderWithServices(
      <CardInfo
        card={browseCard({ deck: { name: 'Raíz::Ramo::Mazo' } as never, noteType: { name: 'Tipo inventado' } as never })}
        timing={TIMING}
      />,
    );
    await screen.findByText('Todavía no la has estudiado.');
    expect(facts()).toMatchObject({ Mazo: 'Ramo › Mazo', 'Tipo de nota': 'Tipo inventado' });
  });

  it('a deck with only its root has no name to show', async () => {
    renderWithServices(<CardInfo card={browseCard({ deck: { name: 'Raíz' } as never })} timing={TIMING} />);
    await screen.findByText('Todavía no la has estudiado.');
    expect(facts()).toMatchObject({ Mazo: '—' });
  });

  it('the simple mode shows only the dates and the counts, without a title', async () => {
    renderWithServices(<CardInfo card={browseCard({ reps: 2 })} timing={TIMING} simple />);
    await screen.findByText('Todavía no la has estudiado.');
    expect(Object.keys(facts())).toEqual(['Primer repaso', 'Último repaso', 'Vencimiento', 'Repasos', 'Olvidos']);
    expect(screen.queryByRole('heading', { name: 'Información de la tarjeta' })).toBeNull();
  });
});
