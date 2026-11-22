// Tests the parts of the cards page around its list: the search box and the unit, the line of a heatmap day, the
// viewer's actions, moving through the list with the keyboard, the hidden answers and «Practicar».

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { dayOf } from '@qv/srs';
import { isoOfDay } from '@qv/study';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { renderApp } from '../../../test/render';
import { defaultPreferences, localStudyRepository } from '../../progress/api/repository';
import type { StudyRepository } from '../../progress/api/repository';

const PAGE = '/semesters/1/courses/anatomia-1/anki/certamen-1/cards';
const search = (router: { state: { location: { search: string } } }) =>
  new URLSearchParams(router.state.location.search);

async function today(study: StudyRepository) {
  const prefs = { ...defaultPreferences(), ...(await study.preferences()) };
  return dayOf(Date.now() / 1000, prefs.timeZone, prefs.dayStartsAt);
}

describe('the cards page’s controls', () => {
  it('searches a moment after typing stops, and the unit goes to the URL', async () => {
    const { router } = renderApp(PAGE, { study: localStudyRepository(null) });
    const box = await screen.findByRole('searchbox', { name: 'Buscar en estas tarjetas' });
    expect(box).toHaveAttribute('placeholder', 'Buscar por texto o código');
    await userEvent.type(box, 'columna');
    expect(search(router).get('q')).toBeNull();
    await waitFor(() => expect(search(router).get('q')).toBe('columna'));
    expect(await screen.findByText('1 nota · 2 tarjetas')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Semana o clase: Todo el certamen' }));
    expect(screen.getAllByRole('menuitemradio').map((o) => o.textContent)).toEqual([
      'Todo el certamen',
      'S1 - Semana de prueba',
    ]);
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'S1 - Semana de prueba' }));
    expect(search(router).get('unit')).toBe('s1-semana-de-prueba');
    await userEvent.clear(box);
    await waitFor(() => expect(search(router).get('q')).toBeNull());
    expect(await screen.findByText('3 notas · 4 tarjetas')).toBeInTheDocument();
  });

  it('in «Modo avanzado» the search box takes Anki’s syntax, and the table has no search box nor filters', async () => {
    renderApp(`${PAGE}?unit=s1-semana-de-prueba`, { study: fullAnkiStudy() });
    const box = await screen.findByRole('searchbox', { name: 'Buscar en estas tarjetas' });
    await waitFor(() =>
      expect(box).toHaveAttribute('placeholder', 'Texto, código o sintaxis de Anki'),
    );
    await userEvent.type(box, 'is:new{Enter}');
    expect(await screen.findByText('3 notas · 4 tarjetas')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tabla' }));
    expect(await screen.findByRole('grid', { name: 'Tarjetas' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: 'Buscar en estas tarjetas' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Filtros' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Tabla' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('4 tarjetas')).toBeInTheDocument();
  });
});

describe('the cards page’s list and table', () => {
  it('«Lista» goes back from the table to the list, without the card that was open', async () => {
    const { router } = renderApp(`${PAGE}?view=table&card=0%3Acloze-1`, { study: fullAnkiStudy() });
    await screen.findByRole('grid', { name: 'Tarjetas' });
    await userEvent.click(screen.getByRole('button', { name: 'Lista' }));
    expect(await screen.findByText('3 notas · 4 tarjetas')).toBeInTheDocument();
    expect([search(router).get('view'), search(router).get('card')]).toEqual([null, null]);
    expect(screen.getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('in «Modo avanzado» a search it does not understand says why over the list', async () => {
    renderApp(`${PAGE}?q=${encodeURIComponent('(vértebra')}`, { study: fullAnkiStudy() });
    expect(await screen.findByText('No se entiende la búsqueda')).toBeInTheDocument();
  });
});

describe('the cards page’s rows', () => {
  it('a click on a row opens its first card, and «Atrás» closes it', async () => {
    const { router } = renderApp(PAGE, { study: localStudyRepository(null) });
    await userEvent.click(await screen.findByRole('button', { name: /^La columna tiene/ }));
    expect(search(router).get('card')).toBe('0:cloze-1');
    expect(await screen.findByRole('dialog', { name: /T-PR-01-002\.1/ })).toBeInTheDocument();
    await act(() => router.navigate(-1));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /T-PR-01-002/ })).toBeNull());
  });

  it('«Todo el certamen» takes the unit out of the URL', async () => {
    const { router } = renderApp(`${PAGE}?unit=s1-semana-de-prueba`, {
      study: localStudyRepository(null),
    });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Semana o clase: S1 - Semana de prueba' }),
    );
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Todo el certamen' }));
    expect(search(router).get('unit')).toBeNull();
  });
});

describe('the cards page’s filters', () => {
  it('a state, an origin and a kind go to the URL, and «Todas» or switching off takes them away', async () => {
    const { router } = renderApp(PAGE, { study: localStudyRepository(null) });
    await screen.findByText('3 notas · 4 tarjetas');
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const panel = await screen.findByRole('dialog', { name: 'Filtros' });
    const state = within(panel).getByRole('radiogroup', { name: 'Estado' });
    const kind = within(panel).getByRole('radiogroup', { name: 'Tipo' });
    await userEvent.click(within(panel).getByRole('switch', { name: 'Lo recalcó el profe' }));
    expect(search(router).get('origin')).toBe('profe');
    await userEvent.click(within(state).getByRole('radio', { name: /^Sin ver/ }));
    expect(search(router).get('state')).toBe('new');
    await userEvent.click(within(kind).getByRole('radio', { name: /^Texto/ }));
    expect(search(router).get('kind')).toBe('text');
    expect(await screen.findByText('1 nota · 1 tarjeta')).toBeInTheDocument();
    await userEvent.click(within(kind).getByRole('radio', { name: /^Todas/ }));
    await userEvent.click(within(state).getByRole('radio', { name: /^Todas/ }));
    await userEvent.click(within(panel).getByRole('switch', { name: 'Lo recalcó el profe' }));
    expect([...search(router).keys()]).toEqual([]);
    expect(await screen.findByText('3 notas · 4 tarjetas')).toBeInTheDocument();
  });

  it('an origin in the URL starts on, and the origins no note has are off', async () => {
    const { router } = renderApp(`${PAGE}?origin=profe`, { study: localStudyRepository(null) });
    await screen.findByText('1 nota · 1 tarjeta');
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const panel = await screen.findByRole('dialog', { name: 'Filtros' });
    expect(within(panel).getByRole('switch', { name: 'Salió en un control' })).toBeDisabled();
    await userEvent.click(within(panel).getByRole('switch', { name: 'Lo recalcó el profe' }));
    expect(search(router).get('origin')).toBeNull();
    await userEvent.click(within(panel).getByRole('switch', { name: 'Lo recalcó el profe' }));
    expect(search(router).get('origin')).toBe('profe');
  });
});

describe('the line of a heatmap day', () => {
  it('a day that does not exist, a day to come and going back to every day', async () => {
    const study = fullAnkiStudy();
    const first = renderApp(`${PAGE}?day=manana`, { study });
    expect(await screen.findByText('Ese día no existe.')).toBeInTheDocument();
    first.unmount();
    const t = await today(study);
    const { router } = renderApp(`${PAGE}?day=${isoOfDay(t + 3)}`, { study });
    expect(await screen.findByText(/: 0 tarjetas por repasar\.$/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver todos los días' }));
    expect(search(router).get('day')).toBeNull();
  });

  it('a day already answered says how many, and one it could not read offers to try again', async () => {
    const study = fullAnkiStudy();
    const t = await today(study);
    let fail = true;
    const answered: StudyRepository = {
      ...study,
      async ratedBetween() {
        if (fail) throw new Error('Sin conexión');
        return [
          {
            noteGuid: 'cloze-1',
            ord: 0,
            deckId: '20',
            rating: 1,
            reviewedAt: new Date().toISOString(),
          },
          {
            noteGuid: 'cloze-1',
            ord: 0,
            deckId: '20',
            rating: 3,
            reviewedAt: new Date().toISOString(),
          },
        ];
      },
    };
    renderApp(`${PAGE}?day=${isoOfDay(t)}`, { study: answered });
    expect(
      await screen.findByText('No se pudieron leer las tarjetas de ese día.'),
    ).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByText(/: respondiste 1 tarjeta \(2 respuestas\)\.$/),
    ).toBeInTheDocument();
    expect(await screen.findByText('1 nota · 1 tarjeta')).toBeInTheDocument();
  });
});

describe('the cards page’s viewer', () => {
  it('hides a card and shows it again, says it, and goes back when saving fails', async () => {
    const study = fullAnkiStudy();
    let fail = false;
    const flaky: StudyRepository = {
      ...study,
      async suspend(refs, notes) {
        if (fail) throw new Error('Sin conexión');
        return study.suspend(refs, notes);
      },
    };
    renderApp(`${PAGE}?card=${encodeURIComponent('0:cloze-1')}`, { study: flaky });
    const viewer = await screen.findByRole('dialog', { name: /T-PR-01-002\.1/ });
    const actions = within(viewer).getByRole('toolbar', { name: 'Acciones de la tarjeta' });
    expect(
      within(actions)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Marcar', 'No mostrar más', 'Reportar error', 'Historial']);
    await userEvent.click(within(actions).getByRole('button', { name: 'No mostrar más' }));
    expect(await within(actions).findByText('No se mostrará más')).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Volver a mostrar' })).toBeEnabled();
    await waitFor(async () =>
      expect((await study.allCards()).find((c) => c.noteGuid === 'cloze-1')?.suspended).toBe(true),
    );
    await userEvent.click(within(actions).getByRole('button', { name: 'Volver a mostrar' }));
    expect(await within(actions).findByText('Se mostrará de nuevo')).toBeInTheDocument();
    fail = true;
    await userEvent.click(within(actions).getByRole('button', { name: 'No mostrar más' }));
    expect(
      await within(actions).findByText('No se pudo guardar. Intenta de nuevo.'),
    ).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'No mostrar más' })).toBeInTheDocument();
  });

  it('reports a mistake and thanks; in the simple mode the history shows less', async () => {
    const study = localStudyRepository(null, { welcomeSeen: true });
    renderApp(`${PAGE}?card=${encodeURIComponent('0:s@/AqX%n?#')}`, { study });
    const viewer = await screen.findByRole('dialog', { name: /T-PR-01-001\.2/ });
    const actions = within(viewer).getByRole('toolbar', { name: 'Acciones de la tarjeta' });
    await userEvent.click(within(actions).getByRole('button', { name: 'Historial' }));
    const history = await screen.findByRole('dialog', { name: 'Historial de la tarjeta' });
    const info = within(history).getByRole('region', { name: 'Información de la tarjeta' });
    expect([...info.querySelectorAll('dt')].map((d) => d.textContent)).toEqual([
      'Primer repaso',
      'Último repaso',
      'Vencimiento',
      'Repasos',
      'Olvidos',
    ]);
    expect(within(info).queryByRole('heading', { name: 'Información de la tarjeta' })).toBeNull();
    expect(within(info).getByText('Todavía no la has estudiado.')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Historial de la tarjeta' })).toBeNull(),
    );
    await userEvent.click(within(actions).getByRole('button', { name: 'Reportar error' }));
    const dialog = await screen.findByRole('dialog', { name: /Reportar/ });
    await userEvent.type(within(dialog).getByRole('textbox'), 'Son siete');
    await userEvent.click(within(dialog).getByRole('button', { name: /Enviar/ }));
    expect(
      await within(actions).findByText('Gracias: tu reporte le llegó al autor.'),
    ).toBeInTheDocument();
  });

  it('the arrows go through the list, and closing takes the card out of the URL', async () => {
    const { router } = renderApp(`${PAGE}?card=${encodeURIComponent('0:s@/AqX%n?#')}`, {
      study: localStudyRepository(null),
    });
    await screen.findByRole('dialog', { name: /T-PR-01-001\.2/ });
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(search(router).get('card')).toBe('0:cloze-1'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(search(router).get('card')).toBeNull());
  });
});

describe('the cards page’s list', () => {
  it('the arrows, Home and End move the focus from row to row', async () => {
    renderApp(PAGE, { study: localStudyRepository(null) });
    const first = await screen.findByRole('button', {
      name: /^¿Cuántas vértebras cervicales hay\?/,
    });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toHaveAccessibleName(/^La columna tiene/));
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-position', '2'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement).toHaveAttribute('data-position', '2');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-position', '0'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toHaveAttribute('data-position', '0');
  });

  it('with the answers hidden, a cloze shows its holes and an image has no answer', async () => {
    localStorage.setItem('qv-cards-hide-answers', '1');
    renderApp(PAGE, { study: localStudyRepository(null) });
    const cloze = await screen.findByRole('button', { name: /^La columna tiene/ });
    expect(cloze).toHaveAccessibleName(
      'La columna tiene[hueco]vértebras[hueco]— 2 tarjetas: 2 sin ver',
    );
    expect(screen.getByRole('button', { name: /^Vértebra de prueba/ })).toHaveAccessibleName(
      'Vértebra de prueba—1 rótulo— 1 tarjeta: 1 sin ver',
    );
  });

  it('a filter with nothing in it leaves «Practicar estas» off, and practicing it says so', async () => {
    const study = fullAnkiStudy();
    const first = renderApp(`${PAGE}?state=marked`, { study });
    expect(await screen.findByText('0 notas · 0 tarjetas')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Practicar estas' })).toBeNull();
    expect(screen.getByText('Practicar estas').closest('[aria-disabled]')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    first.unmount();
    renderApp(`${PAGE}/practice?state=marked`, { study });
    expect(await screen.findByRole('heading', { name: 'Nada que practicar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a las tarjetas' })).toHaveAttribute(
      'href',
      `${PAGE}?state=marked`,
    );
  });

  it('a practice round tells how many are left, and starts again', async () => {
    renderApp(`${PAGE}/practice?kind=image`, { study: fullAnkiStudy() });
    expect(await screen.findByText('Quedan 1')).toBeInTheDocument();
    expect(screen.getByText('Practicar · quedan 1')).toBeInTheDocument();
    expect(
      screen.getByText('Esta práctica no cambia las fechas de tus tarjetas.'),
    ).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Mostrar respuesta' }));
    await userEvent.click(screen.getByRole('button', { name: /^Bien/ }));
    expect(
      await screen.findByRole('heading', { name: 'Terminaste la práctica' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Practicar de nuevo' }));
    expect(await screen.findByText('Quedan 1')).toBeInTheDocument();
  });
});
