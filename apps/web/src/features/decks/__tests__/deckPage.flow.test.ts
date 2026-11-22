// Tests a deck's page in the full mode: which decks have one, and what a deck above adds up.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DECK_PATH } from '../../../test/fixtures/deck';
import { renderApp } from '../../../test/render';
import { pageLoad } from '../../../test/dom';

describe('deck page', () => {
  it('a deck inside a week or lecture has no page of its own, also in «Modo avanzado»', async () => {
    const { router } = renderApp(DECK_PATH);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Certamen 1' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/semesters/1/courses/anatomia-1/anki/certamen-1');
  });

  it('a deck above (the assessment, the course) adds up what is below it, as Anki', async () => {
    const assessment = renderApp('/semesters/1/courses/anatomia-1/anki/certamen-1');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Certamen 1' }),
    ).toBeInTheDocument();
    const trail = screen.getByRole('navigation', { name: 'Ruta' });
    expect(within(trail).getByRole('link', { name: '1° Semestre' })).toHaveAttribute(
      'href',
      '/semesters/1',
    );
    expect(within(trail).getByRole('link', { name: 'Anatomía I' })).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1',
    );
    expect(within(trail).queryByText(/Medicina UCH/)).toBeNull();
    await waitFor(async () => expect(await pageLoad()).toBe(3));
    const sub = screen.getByRole('list', { name: 'Submazos' });
    expect(within(sub).getByText('S1 - Semana de prueba')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Buscar tarjetas|Opciones de Anki/ })).toBeNull();

    assessment.unmount();

    const course = renderApp('/semesters/1/courses/anatomia-1/anki');
    const tree = await screen.findByRole('list', { name: 'Submazos' });
    for (const name of ['Certamen 1', 'S1 - Semana de prueba', 'Mazo de prueba']) {
      expect(await within(tree).findByText(name)).toBeInTheDocument();
    }
    await userEvent.click(within(tree).getByRole('button', { name: 'Plegar Certamen 1' }));
    expect(within(tree).queryByText('Mazo de prueba')).toBeNull();
    course.unmount();
    renderApp('/semesters/1/courses/anatomia-1/anki');
    const again = await screen.findByRole('list', { name: 'Submazos' });
    expect(within(again).queryByText('Mazo de prueba')).toBeNull();
    await userEvent.click(within(again).getByRole('button', { name: 'Desplegar Certamen 1' }));
    expect(await within(again).findByText('Mazo de prueba')).toBeInTheDocument();
  });
});
