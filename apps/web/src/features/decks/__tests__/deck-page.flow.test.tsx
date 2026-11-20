// Tests a deck's page in the full mode: which decks have one, and what a deck above adds up.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ankiScreens } from '../../../app/ankiScreens';
import { DECK_PATH } from '../../../test/fixtures/deck';
import { renderApp } from '../../../test/render';
import { pageLoad } from '../../../test/dom';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
  it('«Estudiar» has its screen fetched as a pointer reaches it, or the focus', async () => {
    const study = vi.spyOn(ankiScreens.study, 'preload');
    renderApp('/semesters/1/courses/anatomia-1/anki/certamen-1');
    const link = await screen.findByRole('link', { name: 'Estudiar' });
    study.mockClear();
    await userEvent.hover(link);
    expect(study).toHaveBeenCalledTimes(1);
    link.focus();
    expect(study).toHaveBeenCalledTimes(2);
  });

  it('with the data saver on, reaching «Estudiar» fetches nothing', async () => {
    const study = vi.spyOn(ankiScreens.study, 'preload');
    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } });
    renderApp('/semesters/1/courses/anatomia-1/anki/certamen-1');
    const link = await screen.findByRole('link', { name: 'Estudiar' });
    study.mockClear();
    await userEvent.hover(link);
    link.focus();
    expect(study).not.toHaveBeenCalled();
  });
});
