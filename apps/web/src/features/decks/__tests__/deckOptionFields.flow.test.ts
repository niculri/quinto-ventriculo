// Tests that every row of «Configuración de mazos» and of the advanced part of «Anki general» saves its own value, and
// what the options say when what they need does not load.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { chooseIn } from '../../../test/dom';
import { renderApp } from '../../../test/render';

async function typeIn(label: string, value: string) {
  const field = screen.getByLabelText(label);
  await userEvent.clear(field);
  await userEvent.type(field, `${value}{Enter}`);
}

async function save() {
  await userEvent.click(screen.getAllByRole('button', { name: 'Guardar' })[0]!);
  await screen.findByText('Guardado');
}

describe('each option saves its own value', () => {
  it('«Configuración de mazos»: the numbers, the lists and the switches of a preset', async () => {
    const study = fullAnkiStudy();
    renderApp('/settings/deck-options?preset=Default', { study });
    await screen.findByLabelText('Tarjetas nuevas/día');
    await typeIn('Umbral para olvidadas', '5');
    await typeIn('Tiempo máximo de respuesta en segundos', '90');
    const lists: [RegExp, string][] = [
      [/^Acción para olvidadas: /, 'Suspender tarjeta'],
      [/^Nuevo orden de recolección de tarjetas: /, 'Notas aleatorias'],
      [/^Nuevo orden de clasificación de tarjetas: /, 'Aleatorio'],
      [/^Nuevos\/revisiones \(orden de estudio\): /, 'Mostrar antes de las tarjetas para revisar'],
      [
        /^Aprendizaje entre días\/revisiones \(orden de estudio\): /,
        'Mostrar después de las tarjetas para revisar',
      ],
      [/^Revisar orden de clasificación: /, 'Orden añadido'],
    ];
    for (const [list, option] of lists) {
      await chooseIn(screen.getByRole('button', { name: list }), option);
    }
    const switches = {
      buryNew: 'Enterrar tarjetas hermanas nuevas (de la nota) hasta el día siguiente.',
      buryReviews: 'Enterrar tarjetas hermanas (de la nota).',
      buryInterdayLearning:
        'Enterrar a las tarjetas hermanas (de la nota) de aprendizaje entre días.',
    };
    const flipped: Record<string, boolean> = {};
    for (const [key, name] of Object.entries(switches)) {
      const control = screen.getByRole<HTMLInputElement>('switch', { name });
      flipped[key] = !control.checked;
      await userEvent.click(control);
    }
    await save();
    expect((await study.presets())[0]!.config).toMatchObject({
      leechThreshold: 5,
      capAnswerTimeToSecs: 90,
      leechAction: 'suspend',
      newCardGatherPriority: 'randomNotes',
      newCardSortOrder: 'randomCard',
      newMix: 'beforeReviews',
      interdayLearningMix: 'afterReviews',
      reviewOrder: 'added',
      ...flipped,
    });
    expect(Object.values(flipped)).toEqual([false, false, true]);
  });

  it('«Anki general» in «Modo avanzado»: studying ahead and new cards past the review limit', async () => {
    const study = fullAnkiStudy();
    renderApp('/settings/anki', { study });
    await screen.findByLabelText('Límite del estudio por adelantado');
    await typeIn('Límite del estudio por adelantado', '45');
    await userEvent.click(
      screen.getByRole('switch', { name: 'Las tarjetas nuevas ignoran el límite de revisión' }),
    );
    await save();
    await waitFor(async () =>
      expect(await study.preferences()).toMatchObject({
        learnAheadMinutes: 45,
        newCardsIgnoreReviewLimit: true,
        applyAllParentLimits: false,
      }),
    );
  });
});

it('the options that do not load say so, and «Reintentar» asks again only for what failed', async () => {
  const study = fullAnkiStudy();
  const settings = study.deckSettings.bind(study);
  const preferences = study.preferences.bind(study);
  let fail = true;
  let preferenceReads = 0;
  study.deckSettings = () => (fail ? Promise.reject(new Error('sin conexión')) : settings());
  study.preferences = () => {
    preferenceReads++;
    return preferences();
  };
  renderApp('/settings/deck-options?preset=Default', { study });
  const retry = await screen.findByRole('button', { name: 'Reintentar' });
  expect(screen.queryByLabelText('Tarjetas nuevas/día')).toBeNull();
  const before = preferenceReads;
  fail = false;
  await userEvent.click(retry);
  expect(await screen.findByLabelText('Tarjetas nuevas/día')).toBeInTheDocument();
  expect(preferenceReads).toBe(before);
});
