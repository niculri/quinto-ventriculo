// Tests what a deck's page says, part by part, and the dialog of a deck's configuration when a change fails.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { adminKey } from '@qv/schema/http';
import { fakeApi } from '../../../test/fakes/api';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { CATALOG } from '../../../test/fixtures/catalog';
import { renderApp } from '../../../test/render';
import { ApiRequestError } from '../../../shared/lib/api';
import { localAdminRepository } from '../../admin/api/repository';
import { localStudyRepository } from '../../progress/api/repository';
import { DECK } from '../../../test/fixtures/deck';

const ASSESSMENT_PATH = '/semesters/1/courses/anatomia-1/anki/certamen-1';

async function student() {
  const study = localStudyRepository(null, { welcomeSeen: true });
  await study.setDeckActivation('5', true);
  return study;
}

describe('a deck’s page, what it says', () => {
  it('its title line, its tools, the waiting final review and the lines under «Estudiar»', async () => {
    renderApp(ASSESSMENT_PATH, { study: await student() });
    const heading = await screen.findByRole('heading', { level: 1, name: 'Certamen 1' });
    expect(heading.nextElementSibling!.textContent).toBe('Mazo de Anki · 3 notas · 4 tarjetas');
    const tools = screen.getByRole('navigation', { name: 'Herramientas de Anki' });
    expect(within(tools).getByRole('link').textContent).toBe(' Ver las tarjetas');
    const review = await screen.findByRole('button', { name: 'Repaso final' });
    expect(review).toHaveAttribute('title', 'Se activa cuando hayas visto tarjetas');
    const panel = screen.getByRole('region', { name: 'Estudiar' });
    expect(
      within(panel).getByText(
        'Activa lo que estás viendo en clases: cada semana o clase parte desactivada.',
      ),
    ).toBeInTheDocument();
    const heavy = within(panel).getByText(
      'Es bastante para un día. Puedes parar cuando quieras: lo que no alcances sale mañana.',
    );
    expect(heavy).toHaveAttribute('aria-hidden', 'true');
  });

  it('the options of an assessment and the rows of its decks, with their texts', async () => {
    renderApp(ASSESSMENT_PATH, { study: await student() });
    const box = await screen.findByRole('region', { name: 'Opciones de Certamen 1' });
    await waitFor(() =>
      expect(
        within(box).getByRole('spinbutton', { name: 'Tarjetas nuevas por día' }),
      ).toBeEnabled(),
    );
    expect(box.textContent).toMatchSnapshot();
    const tree = await screen.findByRole('list', { name: 'Submazos' });
    expect(await within(tree).findAllByRole('switch')).not.toHaveLength(0);
    await waitFor(() => expect(within(tree).queryAllByText(/para hoy/).length).toBeGreaterThan(0));
    await waitFor(() => expect(tree.textContent).toContain('% de dominio'));
    expect(
      within(tree)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toMatchSnapshot();
  });
});

describe('the dialog of a deck’s configuration', () => {
  it('says what a configuration is, and a change that fails says so', async () => {
    const study = fullAnkiStudy();
    study.setDeckPreset = () => Promise.reject(new Error('sin conexión'));
    renderApp(ASSESSMENT_PATH, { study });
    const open = await screen.findByRole('button', { name: 'Configuración de Mazo de prueba' });
    expect(open).toHaveAttribute('title', 'Configuración del mazo');
    await userEvent.click(open);
    const dialog = await screen.findByRole('dialog', { name: 'Configuración de Mazo de prueba' });
    expect(
      within(dialog).getByText(
        'Una configuración se comparte: cambiarla cambia todos los mazos que la usan.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
    await userEvent.click(
      await within(dialog).findByRole('button', { name: /^Configuración de este mazo:/ }),
    );
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Extras (del autor)' }));
    expect(await within(dialog).findByText('No se pudo cambiar')).toBeInTheDocument();
    expect(within(dialog).getByText('sin conexión')).toBeInTheDocument();
  });
});

describe('a deck’s page when something is missing', () => {
  it('a deck that does not load says so in place of «Estudiar», and «Reintentar» brings it', async () => {
    let fail = true;
    const base = fakeApi();
    const api = fakeApi({
      deck: async (id) => {
        if (fail) throw new ApiRequestError(500, 'internal', 'Falló el servidor.');
        return base.deck(id);
      },
    });
    renderApp(ASSESSMENT_PATH, { study: await student(), api });
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    expect(screen.queryByRole('region', { name: 'Estudiar' })).toBeNull();
    fail = false;
    await userEvent.click(retry);
    expect(await screen.findByRole('region', { name: 'Estudiar' })).toBeInTheDocument();
  });

  it('a deck only the draft has shows the notice, without its options nor «Estudiar»', async () => {
    localStorage.setItem('qv-admin-mode', 'admin');
    const draft = { ...CATALOG, adminOnly: { [adminKey('deck', '4')]: ['draft' as const] } };
    renderApp(ASSESSMENT_PATH, {
      study: await student(),
      admin: localAdminRepository({ admin: true }),
      adminApi: fakeApi({ catalog: async () => draft }),
    });
    expect(await screen.findByText('Esto solo está en el borrador')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Opciones de Certamen 1' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Estudiar' })).toBeNull();
  });

  it('a deck of one note and one card says it in the singular', async () => {
    const catalog = structuredClone(CATALOG);
    Object.assign(catalog.anki.decks.find((d) => d.id === '4')!, { noteCount: 1, cardCount: 1 });
    renderApp(ASSESSMENT_PATH, {
      study: await student(),
      api: fakeApi({ catalog: async () => catalog }),
    });
    const heading = await screen.findByRole('heading', { level: 1, name: 'Certamen 1' });
    expect(heading.nextElementSibling!.textContent).toBe('Mazo de Anki · 1 nota · 1 tarjeta');
  });

  it('the dialog of a deck’s configuration waits for the presets before offering them', async () => {
    const study = fullAnkiStudy();
    let release = () => {};
    const presets = study.presets.bind(study);
    study.presets = () =>
      new Promise((resolve) => {
        release = () => void presets().then(resolve);
      });
    renderApp(ASSESSMENT_PATH, { study });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Configuración de Mazo de prueba' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Configuración de Mazo de prueba' });
    expect(
      within(dialog).queryByRole('button', { name: /^Configuración de este mazo:/ }),
    ).toBeNull();
    release();
    expect(
      await within(dialog).findByRole('button', { name: /^Configuración de este mazo:/ }),
    ).toBeInTheDocument();
  });
});

it('with every card suspended, the deck and its week are at 0 % of mastery', async () => {
  const study = await student();
  await study.suspend(
    DECK.cards.map((c) => ({ noteGuid: c.noteGuid, ord: c.ord, deckId: c.deckId })),
    false,
  );
  renderApp(ASSESSMENT_PATH, { study });
  const panel = await screen.findByRole('region', { name: 'Estudiar' });
  await waitFor(() => expect(panel.querySelectorAll('[data-mastery]').length).toBeGreaterThan(1));
  const meters = [...panel.querySelectorAll('[data-mastery]')].map((m) => m.textContent);
  expect(meters.every((t) => t.includes('0 % de dominio'))).toBe(true);
});

it('with a large backlog, «Estudiar» gives the plan to catch up instead of what to turn on', async () => {
  const study = await student();
  const progress = study.deckProgress.bind(study);
  study.deckProgress = async (day) => [
    ...(await progress(day)).filter((p) => p.deckId !== '20'),
    { deckId: '20', seen: 4, newSuspended: 0, overdue: 60, newToday: 0, newYesterday: 0 },
  ];
  renderApp(ASSESSMENT_PATH, { study });
  const panel = await screen.findByRole('region', { name: 'Estudiar' });
  expect(
    await within(panel).findByText(
      'Llevas 60 atrasadas. Con ~15 al día, además de lo de hoy, te pones al día en 5 días.',
    ),
  ).toHaveAttribute('role', 'status');
  expect(within(panel).queryByText(/^Activa lo que estás viendo/)).toBeNull();
});

it('an assessment without weeks yet has no list of subdecks', async () => {
  const catalog = structuredClone(CATALOG);
  const fullName = '() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 2';
  const empty = { noteCount: 0, cardCount: 0, assessmentId: null };
  catalog.anki.decks.push({
    ...catalog.anki.decks.find((d) => d.id === '4')!,
    ...empty,
    id: '30',
    name: fullName,
  });
  const base = fakeApi();
  const deck = async (id: string) =>
    id === '30'
      ? {
          ...DECK,
          ...empty,
          id,
          name: 'Certamen 2',
          fullName,
          courseId: 'anatomia-1',
          subdecks: [],
          cards: [],
        }
      : base.deck(id);
  renderApp('/semesters/1/courses/anatomia-1/anki/certamen-2', {
    study: await student(),
    api: fakeApi({ catalog: async () => catalog, deck }),
  });
  await waitFor(() =>
    expect(
      screen.getByRole('group', { name: 'Para hoy' }).querySelector('.animate-pulse'),
    ).toBeNull(),
  );
  expect(screen.getByRole('region', { name: 'Estudiar' })).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Submazos' })).toBeNull();
});
