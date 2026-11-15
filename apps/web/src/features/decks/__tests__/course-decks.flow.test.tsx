// Tests the course's way to its decks: the card of the course and the page with its deck tree.

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DECK_PATH, renderApp } from '../../../test/render';

describe('catalog', () => {
  it('the course has a card to its decks and a page with its deck tree; a course with only decks is not «Próximamente»', async () => {
    renderApp('/semesters/1');
    const link = await within(await screen.findByRole('main')).findByRole('link', {
      name: /Anatomía I/,
    });
    expect(within(link).getByText('1 mazo · Certamen 1')).toBeInTheDocument();
    await userEvent.click(link);
    const card = await screen.findByRole('link', { name: /^Anki.+/ });
    expect(card).toHaveAttribute('href', '/semesters/1/courses/anatomia-1/anki/certamen-1');
    await userEvent.click(screen.getByRole('link', { name: /Todos los mazos del ramo/ }));
    const tree = await screen.findByRole('list', { name: 'Submazos' });
    expect(await within(tree).findByText('Certamen 1')).toBeInTheDocument();
    expect(within(tree).getByRole('link', { name: 'Estudiar Mazo de prueba' })).toHaveAttribute(
      'href',
      `${DECK_PATH}/study`,
    );
    expect(screen.getByRole('link', { name: 'Estudiar' })).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1/anki/study',
    );
    expect(screen.getByRole('link', { name: /Ver las tarjetas/ })).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1/anki/cards',
    );
    const bar = screen.getByRole('banner');
    expect(within(bar).queryByRole('link', { name: 'Anki' })).toBeNull();
  });
});
