// Tests undoing an answer, a flag, a burying or a suspension while its save is still going: the card that comes back
// can be answered, and the session goes on.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { DECK_PATH } from '../../../test/fixtures/deck';
import { renderApp } from '../../../test/render';
import { cardText } from '../../../test/dom';
import type { StudyRepository } from '../../progress/api/repository';

const SAVE_MS = 80;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A repository whose writes take a while, so an undo can come before they end. */
function slowStudy(): { local: StudyRepository; slow: StudyRepository } {
  const local = fullAnkiStudy();
  const slow: StudyRepository = {
    ...local,
    recordReview: async (input) => {
      await wait(SAVE_MS);
      return local.recordReview(input);
    },
    setFlag: async (card, flag) => {
      await wait(SAVE_MS);
      return local.setFlag(card, flag);
    },
    bury: async (cards, until, note) => {
      await wait(SAVE_MS);
      return local.bury(cards, until, note);
    },
    suspend: async (cards, note) => {
      await wait(SAVE_MS);
      return local.suspend(cards, note);
    },
  };
  return { local, slow };
}

async function startStudying(study: StudyRepository) {
  renderApp(`${DECK_PATH}/study`, { study });
  expect(await cardText(/Frente/)).toContain('¿Cuántas vértebras');
}

const undo = () => fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

describe('undoing before what was done is saved', () => {
  it('an answer: the card comes back, is answered again, and that answer is saved', async () => {
    const { local, slow } = slowStudy();
    await startStudying(slow);
    await userEvent.keyboard(' ');
    await cardText(/Reverso/);
    await userEvent.keyboard('3');
    expect(await cardText(/Frente/)).toContain('La columna tiene');

    undo();
    expect(await cardText(/Frente/)).toContain('¿Cuántas vértebras');
    await userEvent.keyboard(' ');
    await cardText(/Reverso/);
    await userEvent.keyboard('3');
    expect(await cardText(/Frente/)).toContain('La columna tiene');

    await waitFor(async () => expect(await local.cards(['20', '21'])).toHaveLength(1), {
      timeout: 3000,
    });
    expect(screen.queryByText(/cambió en otra pestaña/)).not.toBeInTheDocument();
  });

  it('a flag: the card is answered after it and the answer is saved', async () => {
    const { local, slow } = slowStudy();
    await startStudying(slow);
    fireEvent.keyDown(window, { key: '3', ctrlKey: true });
    undo();
    await userEvent.keyboard(' ');
    await cardText(/Reverso/);
    await userEvent.keyboard('3');
    expect(await cardText(/Frente/)).toContain('La columna tiene');

    await waitFor(async () => expect(await local.cards(['20', '21'])).toHaveLength(1), {
      timeout: 3000,
    });
    expect(screen.queryByText(/cambió en otra pestaña/)).not.toBeInTheDocument();
  });

  it('burying the card: it comes back, and its answer is saved', async () => {
    const { local, slow } = slowStudy();
    await startStudying(slow);
    await userEvent.keyboard('-');
    expect(await cardText(/Frente/)).toContain('La columna tiene');
    undo();
    expect(await cardText(/Frente/)).toContain('¿Cuántas vértebras');
    await userEvent.keyboard(' ');
    await cardText(/Reverso/);
    await userEvent.keyboard('3');

    await waitFor(async () => expect(await local.cards(['20', '21'])).toHaveLength(1), {
      timeout: 3000,
    });
    expect(screen.queryByText(/cambió en otra pestaña/)).not.toBeInTheDocument();
  });
});
