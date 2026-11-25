// Tests the switches of the deck list: one per topic, a week's that turns all of them and shows «en parte», and
// «Estudiar» on something off, which turns it on, opens it and, back on the list, offers to undo that.

import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { WEEK } from '../../../test/fixtures/deck';
import { renderApp } from '../../../test/render';
import { localStudyRepository } from '../../progress/api/repository';
import type { StudyRepository } from '../../progress/api/repository';
import { activationNotice } from '../model/activationNotice';

const ASSESSMENT_PATH = '/semesters/1/courses/anatomia-1/anki/certamen-1';
const WEEK_NAME = 'S1 - Semana de prueba';

afterEach(() => act(() => activationNotice.clear()));

/** The test week with a second topic, «Otro tema» (id 22), of two cards. */
function twoTopics() {
  const catalog = structuredClone(CATALOG);
  const week = catalog.anki.decks.find((d) => d.id === '5')!;
  const topic = catalog.anki.decks.find((d) => d.id === '20')!;
  week.cardCount += 2;
  catalog.anki.decks.push({ ...topic, id: '22', name: `${WEEK}::Otro tema`, cardCount: 2 });
  return fakeApi({ catalog: async () => catalog });
}

const student = () => localStudyRepository(null, { welcomeSeen: true });
const list = () => screen.findByRole('list', { name: 'Submazos' });
const saved = async (study: StudyRepository) =>
  Object.fromEntries((await study.deckActivations()).map((a) => [a.deckId, a.active]));

describe('a week of topics', () => {
  it('is «en parte» while some are on, says how many, and its switch turns all of them', async () => {
    const study = student();
    await study.setDeckActivations([{ deckId: '20', active: true }]);
    renderApp(ASSESSMENT_PATH, { study, api: twoTopics() });
    const tree = await list();
    const week = await within(tree).findByRole('switch', { name: `Activar ${WEEK_NAME}` });
    await waitFor(() => expect(week).toHaveAccessibleDescription('1 de 2 temas activados'));
    expect(week).not.toBeChecked();
    expect(within(tree).getByRole('switch', { name: 'Activar Mazo de prueba' })).toBeChecked();
    expect(within(tree).getByRole('switch', { name: 'Activar Otro tema' })).not.toBeChecked();
    expect(week.closest('li')!.textContent).toContain('1 de 2 temas activados');

    await userEvent.click(week);
    await waitFor(() => expect(week).toBeChecked());
    expect(within(tree).getByRole('switch', { name: 'Activar Otro tema' })).toBeChecked();
    await waitFor(async () => expect(await saved(study)).toEqual({ 5: true, 20: true, 22: true }));

    await userEvent.click(week);
    await waitFor(async () =>
      expect(await saved(study)).toEqual({ 5: false, 20: false, 22: false }),
    );
    expect(within(tree).getByRole('switch', { name: 'Activar Mazo de prueba' })).not.toBeChecked();
  });

  it('turning off the last topic of a week saved on turns the week off too', async () => {
    const study = student();
    await study.setDeckActivations([{ deckId: '5', active: true }]);
    renderApp(ASSESSMENT_PATH, { study });
    const topic = await within(await list()).findByRole('switch', {
      name: 'Activar Mazo de prueba',
    });
    await waitFor(() => expect(topic).toBeChecked());
    await userEvent.click(topic);
    await waitFor(async () => expect(await saved(study)).toEqual({ 5: false, 20: false }));
  });

  it('a topic alone turns on and off without touching the others', async () => {
    const study = student();
    renderApp(ASSESSMENT_PATH, { study, api: twoTopics() });
    const tree = await list();
    const other = await within(tree).findByRole('switch', { name: 'Activar Otro tema' });
    await waitFor(() => expect(other).toBeEnabled());
    await userEvent.click(other);
    await waitFor(async () => expect(await saved(study)).toEqual({ 22: true }));
    expect(within(tree).getByRole('switch', { name: `Activar ${WEEK_NAME}` })).not.toBeChecked();
  });
});

describe('«Estudiar» on something off', () => {
  it('turns the topic on and opens it; back on the list, «Deshacer» turns it off again', async () => {
    const study = student();
    renderApp(ASSESSMENT_PATH, { study });
    const tree = await list();
    await userEvent.click(
      await within(tree).findByRole('button', { name: 'Activar y estudiar Mazo de prueba' }),
    );
    expect(await screen.findByRole('button', { name: 'Mostrar respuesta' })).toBeInTheDocument();
    expect(await saved(study)).toEqual({ 20: true });
    // Not shown before leaving: only once back on a list of the same assessment.
    expect(screen.queryByText('Se activó «Mazo de prueba»')).toBeNull();

    await userEvent.click(screen.getByRole('link', { name: /^Volver a/ }));
    const notice = (await screen.findByText('Se activó «Mazo de prueba»')).closest('[role=status]');
    if (!(notice instanceof HTMLElement)) throw new Error('The notice is not a status');
    await userEvent.click(within(notice).getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () => expect(await saved(study)).toEqual({ 20: false }));
    expect(screen.queryByText('Se activó «Mazo de prueba»')).toBeNull();
  });

  it('on a week off, turns all its topics on; the ✕ closes the notice and keeps them on', async () => {
    const study = student();
    renderApp(ASSESSMENT_PATH, { study, api: twoTopics() });
    await userEvent.click(
      await within(await list()).findByRole('button', {
        name: `Activar y estudiar ${WEEK_NAME}`,
      }),
    );
    expect(await screen.findByRole('button', { name: 'Mostrar respuesta' })).toBeInTheDocument();
    expect(await saved(study)).toEqual({ 5: true, 20: true, 22: true });
    await userEvent.click(screen.getByRole('link', { name: /^Volver a/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar el aviso' }));
    expect(screen.queryByText(`Se activó «${WEEK_NAME}»`)).toBeNull();
    expect(await saved(study)).toEqual({ 5: true, 20: true, 22: true });
  });

  it('on something already on, it is a plain link to study it', async () => {
    const study = student();
    await study.setDeckActivations([{ deckId: '20', active: true }]);
    renderApp(ASSESSMENT_PATH, { study });
    const tree = await list();
    await waitFor(() =>
      expect(within(tree).getByRole('link', { name: 'Estudiar Mazo de prueba' })).toBeVisible(),
    );
    expect(within(tree).queryByRole('button', { name: /^Activar y estudiar/ })).toBeNull();
  });

  it('if it cannot turn it on, it stays on the list and says so', async () => {
    const study = student();
    study.setDeckActivations = () => Promise.reject(new Error('sin conexión'));
    renderApp(ASSESSMENT_PATH, { study });
    const play = await within(await list()).findByRole('button', {
      name: 'Activar y estudiar Mazo de prueba',
    });
    await userEvent.click(play);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar');
    await waitFor(() => expect(play).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Mostrar respuesta' })).toBeNull();
  });
});
