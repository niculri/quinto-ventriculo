// Tests the card viewer opened from a row of the cards page: its Shadow DOM, its keys and its arrows.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../../../test/render';
import { BASE_CSS, cardShadowRoot } from '../components/CardFrame';

afterEach(() => document.documentElement.classList.remove('dark'));

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
  it('shows the front in a Shadow DOM with the note type CSS, then the back', async () => {
    const { router } = renderApp(CARDS);
    await userEvent.click(await screen.findByRole('button', { name: /^¿Cuántas vértebras/ }));
    expect(router.state.location.search).toBe(`?card=${encodeURIComponent('0:s@/AqX%n?#')}`);
    const dialog = await screen.findByRole('dialog', { name: 'T-PR-01-001.2' });
    expect(within(dialog).getByText('Básica · 1 de 4')).toBeInTheDocument();

    const root = await cardRoot(/Frente de la tarjeta/, dialog);
    const card = root.querySelector('.qv-body > .card')!;
    expect(card.className).toBe('card card1');
    expect(card.querySelector('.pregunta')!.textContent).toBe('¿Cuántas vértebras cervicales hay?');
    expect(root.querySelector('[onerror]')).toBeNull();
    const styles = [...root.querySelectorAll('style')].map((s) => s.textContent);
    expect(styles[0]).toBe(BASE_CSS);
    expect(styles[1]).toContain('.pie { position: fixed');
    expect(document.querySelector('.pregunta')).toBeNull();
    expect(root.querySelector('.qv-body .pie')).not.toBeNull();
    const region = within(dialog).getByRole('region', { name: 'Frente de la tarjeta' });
    expect(region).toHaveClass('qv-frame');
    expect(region.style.contain).toBe('layout paint');
    const scroller = region.querySelector('.qv-scroll')!;
    expect(scroller).toHaveClass('overflow-y-auto');
    expect(scroller.querySelector('.qv-card')!.shadowRoot).toBe(root);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Mostrar respuesta' }));
    const back = await cardRoot(/Reverso de la tarjeta/, dialog);
    expect(back.querySelector('.respuesta')!.textContent).toBe('7');
    expect(within(dialog).getByRole('button', { name: 'Ver el frente' })).toBeInTheDocument();
  });

  it('the hint link opens its hint (its onclick does not survive the sanitizing)', async () => {
    renderApp(viewing('s@/AqX%n?#', 0));
    const root = await cardRoot();
    const link = root.querySelector<HTMLAnchorElement>('a.hint')!;
    const hint = root.querySelector<HTMLElement>('div.hint')!;
    expect(hint.style.display).toBe('none');
    link.click();
    expect(hint.style.display).toBe('block');
    expect(link.style.display).toBe('none');
  });

  it('keyboard: space shows the answer, arrows move through the list', async () => {
    renderApp(viewing('s@/AqX%n?#', 0));
    await cardRoot();
    await userEvent.keyboard(' ');
    await cardRoot(/Reverso/);
    await userEvent.keyboard('{ArrowRight}');
    expect(
      await screen.findByRole('dialog', { name: 'T-PR-01-002.1 · hueco 1' }),
    ).toBeInTheDocument();
    const front = await cardRoot();
    expect(front.querySelector('.cloze')!.textContent).toBe('[...]');
  });

  it('in dark mode the card gets nightMode, as in Anki', async () => {
    document.documentElement.classList.add('dark');
    renderApp(viewing('cloze-1', 0));
    const root = await cardRoot();
    expect(root.querySelector('.card')!.className).toBe('card card1 nightMode night_mode');
  });

  it('space or enter on a button inside the card activates it, without turning the card', async () => {
    renderApp(viewing('oclusion-1', 0));
    await cardRoot();
    await userEvent.keyboard(' ');
    for (const key of [' ', 'Enter']) {
      const back = await cardRoot(/Reverso/);
      const toggle = back.querySelector<HTMLButtonElement>('#toggle')!;
      toggle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.getByRole('region', { name: /Reverso/ })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: /Frente/ })).toBeNull();
    }
  });

  it('an occlusion card has its container, canvas and hidden shapes', async () => {
    renderApp(viewing('oclusion-1', 0));
    const root = await cardRoot();
    expect(
      root.querySelector('#image-occlusion-container canvas#image-occlusion-canvas'),
    ).not.toBeNull();
    expect(root.querySelector('div.cloze')!.getAttribute('data-shape')).toBe('rect');
  });

  it('closing the viewer goes back to the list, with its search', async () => {
    const { router } = renderApp(viewing('cloze-1', 0, 'q=columna&'));
    await cardRoot();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(router.state.location.search).toBe('?q=columna'));
  });

  it('the browser’s old link of a card goes to that card, open, on its assessment’s page', async () => {
    const { router } = renderApp('/anki/browse?q=%22T-PR-01-002%22&note=cloze-1&ord=0');
    await waitFor(() => expect(router.state.location.pathname).toBe(CARDS));
    expect(new URLSearchParams(router.state.location.search).get('card')).toBe('0:cloze-1');
    expect(await screen.findByRole('dialog', { name: /T-PR-01-002/ })).toBeInTheDocument();
  });

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
