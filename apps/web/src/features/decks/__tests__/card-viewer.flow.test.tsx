// Tests the card viewer opened from a row of the cards page: its Shadow DOM, its keys and its arrows.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test/render';
import { cardShadowRoot } from '../CardFrame';

const CARDS = '/semesters/1/courses/anatomia-1/anki/certamen-1/cards';
const viewing = (note: string, ord: number, extra = '') =>
  `${CARDS}?${extra}card=${encodeURIComponent(`${ord}:${note}`)}`;

async function cardRoot(
  label: RegExp | string = /Frente de la tarjeta/,
  within_: HTMLElement | null = null,
) {
  const dialog = within_ ?? (await screen.findByRole('dialog'));
  const region = await within(dialog).findByRole('region', { name: label });
  await waitFor(() => expect(cardShadowRoot(region)?.querySelector('.card')).toBeTruthy());
  return cardShadowRoot(region)!;
}

describe('card viewer (a row of the cards page)', () => {
  it('its arrows: «Anterior» off on the first card, «Siguiente» off on the last, and the place in the list', async () => {
    renderApp(viewing('s@/AqX%n?#', 0));
    await cardRoot();
    const dialog = screen.getByRole('dialog');
    const previous = within(dialog).getByRole('button', { name: 'Tarjeta anterior' });
    const next = within(dialog).getByRole('button', { name: 'Tarjeta siguiente' });
    expect(previous).toBeDisabled();
    expect(previous.textContent).toBe('Anterior');
    expect(next.textContent).toBe('Siguiente');
    for (let i = 0; i < 3; i++) await userEvent.click(next);
    expect(await within(dialog).findByText(/· 4 de 4$/)).toBeInTheDocument();
    expect(next).toBeDisabled();
    expect(previous).toBeEnabled();
    expect(
      within(dialog).getByRole('toolbar', { name: 'Acciones de la tarjeta' }),
    ).toBeInTheDocument();
  });
});
