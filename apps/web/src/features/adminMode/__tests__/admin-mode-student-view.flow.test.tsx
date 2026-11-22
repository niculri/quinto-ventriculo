// Tests that, in the admin mode, studying and counting go over what the students have: a card or a deck that only the
// draft has is looked at, and neither enters the queue, nor the counts of the deck page and «Hoy», nor is written.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { AnkiTreeDeck, CardSummary, Catalog } from '@qv/schema';
import type { StudyRepository } from '../../progress/api/repository';
import { ApiRequestError } from '../../../shared/lib/api';
import type { ApiClient } from '../../../shared/lib/api';
import { cardText, pageLoad } from '../../../test/dom';
import { fakeApi } from '../../../test/fakes/api';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { CARDS, CARD_INDEX } from '../../../test/fixtures/cards';
import { CATALOG } from '../../../test/fixtures/catalog';
import { DECK_PATH, WEEK } from '../../../test/fixtures/deck';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../../admin/api/repository';

afterEach(() => window.localStorage.clear());

const NEW_CARD: CardSummary = {
  noteGuid: 'solo-borrador',
  ord: 0,
  deckId: '20',
  code: null,
  version: null,
  kind: 'basic',
  text: 'Pregunta solo del borrador',
};
const NEW_NOTE = {
  ...CARD_INDEX.notes[0]!,
  guid: NEW_CARD.noteGuid,
  code: null,
  version: null,
  fields: ['Pregunta solo del borrador', '7'],
  sortField: 'Pregunta solo del borrador',
  front: 'Pregunta solo del borrador',
  cards: [{ ord: 0, deckId: '20' }],
};
const NEW_DECK_ID = '30';
const NEW_DECK_CARDS = 6;

const notFound = () => new ApiRequestError(404, 'not_found', 'No existe.');
const holds = (name: string, of: string) => name === of || of.startsWith(`${name}::`);

/** The draft: one card more in the test deck and a whole deck of its own, in the same week. */
function drafted(): Catalog {
  const own = CATALOG.anki.decks.find((d) => d.id === '20')!;
  const added = (d: AnkiTreeDeck, by: number) => ({
    ...d,
    cardCount: d.cardCount + by,
    noteCount: d.noteCount + by,
  });
  const decks = CATALOG.anki.decks.map((d) => {
    const by =
      (holds(d.name, own.name) ? 1 : 0) +
      (holds(d.name, `${WEEK}::Solo borrador`) ? NEW_DECK_CARDS : 0);
    return by ? added(d, by) : d;
  });
  const only: AnkiTreeDeck = {
    ...own,
    id: NEW_DECK_ID,
    name: `${WEEK}::Solo borrador`,
    parentId: '5',
    cardCount: NEW_DECK_CARDS,
    noteCount: NEW_DECK_CARDS,
    ownNoteCount: NEW_DECK_CARDS,
    exclusiveNoteCount: NEW_DECK_CARDS,
    closedNoteCount: NEW_DECK_CARDS,
  };
  return {
    ...CATALOG,
    anki: { ...CATALOG.anki, decks: [...decks, { ...only, cardCount: NEW_DECK_CARDS }] },
    adminOnly: { [`deck:${NEW_DECK_ID}`]: ['draft'] },
  };
}

/** The API of the admin mode: the draft by default, and what the students have with `published`. */
function draftApi(): ApiClient {
  const students = fakeApi();
  return fakeApi({
    catalog: async (signal, options) => (options?.published ? students.catalog(signal) : drafted()),
    deck: async (id, signal, options) => {
      if (id === NEW_DECK_ID) {
        if (options?.published) throw notFound();
        return { ...(await students.deck('20')), id, cards: [] };
      }
      const deck = await students.deck(id, signal);
      const holdsTheCard = ['3', '4', '5', '20'].includes(id);
      return !options?.published && holdsTheCard
        ? { ...deck, cardCount: deck.cardCount + 1, cards: [...deck.cards, NEW_CARD] }
        : deck;
    },
    cardIndex: async (assessmentId, hash, signal) => {
      const index = await students.cardIndex(assessmentId, hash, signal);
      return { ...index, notes: [...index.notes, NEW_NOTE] };
    },
    card: async (guid, ord, signal, options) => {
      if (guid !== NEW_CARD.noteGuid) return students.card(guid, ord, signal);
      if (options?.published) throw notFound();
      return { ...CARDS['cloze-1/0']!, noteGuid: guid, front: '<p>Pregunta solo del borrador</p>' };
    },
  });
}

const adminMode = { admin: localAdminRepository({ admin: true }), adminApi: draftApi() };

function watched(): { study: StudyRepository; reviewed: string[] } {
  const study = fullAnkiStudy();
  const reviewed: string[] = [];
  const record = study.recordReview.bind(study);
  study.recordReview = async (input) => {
    reviewed.push(input.card.noteGuid);
    return record(input);
  };
  return { study, reviewed };
}

describe('the admin mode over what the students have', () => {
  it('counts the deck page as a student does: a card only the draft has adds nothing', async () => {
    const asStudent = renderApp(DECK_PATH, { study: fullAnkiStudy() });
    const student = await pageLoad();
    asStudent.unmount();

    window.localStorage.setItem('qv-admin-mode', 'admin');
    renderApp(DECK_PATH, { ...adminMode, study: fullAnkiStudy() });
    expect(await pageLoad()).toBe(student);
  });

  it('does not queue the card only the draft has, and writes nothing for it', async () => {
    window.localStorage.setItem('qv-admin-mode', 'admin');
    const { study, reviewed } = watched();
    renderApp(`${DECK_PATH}/study`, { ...adminMode, study });

    for (let i = 0; i < 3; i++) {
      expect(await cardText(/Frente/)).not.toContain('Pregunta solo del borrador');
      await userEvent.keyboard(' ');
      await cardText(/Reverso/);
      // «Fácil»: the card leaves the day, and the next one is not one of these coming back to learn.
      await userEvent.keyboard('4');
    }
    expect(await screen.findByText(/Has finalizado este mazo por ahora/)).toBeInTheDocument();
    expect(screen.queryByText(/Pregunta solo del borrador/)).toBeNull();
    await waitFor(() => expect(reviewed).toHaveLength(3));
    expect(reviewed).not.toContain(NEW_CARD.noteGuid);
  });

  it('adds to «Hoy» nothing of a deck or a card only the draft has, in «Modo avanzado»', async () => {
    const todayOf = async () => {
      await screen.findByRole('region', { name: 'Días de estudio' });
      await waitFor(() => expect(document.querySelector('main .animate-pulse')).toBeNull());
      return screen.getByRole('region', { name: 'Hoy' }).textContent;
    };
    const asStudent = renderApp('/home', { study: fullAnkiStudy() });
    const student = await todayOf();
    asStudent.unmount();

    window.localStorage.setItem('qv-admin-mode', 'admin');
    renderApp('/home', { ...adminMode, study: fullAnkiStudy() });
    expect(await todayOf()).toBe(student);
  });

  describe('in the explorer', () => {
    const TABLE = '/semesters/1/courses/anatomia-1/anki/certamen-1/cards?view=table';
    const ACTIONS = ['Suspender', 'Enterrar', 'Marcar', 'Olvidar…'];

    async function rowOf(text: string) {
      const grid = await screen.findByRole('grid', { name: /Tarjetas/ });
      return within(grid).getByText(text).closest('[role="row"]')!;
    }

    it('turns the actions off for a card only the draft has, says why, and the shortcuts write nothing', async () => {
      window.localStorage.setItem('qv-admin-mode', 'admin');
      const study = fullAnkiStudy();
      renderApp(TABLE, { ...adminMode, study });

      await userEvent.click(await rowOf('Pregunta solo del borrador'));
      for (const name of ACTIONS) {
        expect(await screen.findByRole('button', { name })).toBeDisabled();
      }
      expect(
        screen.getByText(/se miran, no se suspenden, entierran ni marcan/),
      ).toBeInTheDocument();
      await act(async () => {
        fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
        fireEvent.keyDown(window, { key: '3', ctrlKey: true });
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await study.allCards()).toEqual([]);

      await userEvent.click(await rowOf('¿Cuántas vértebras cervicales hay?'));
      for (const name of ACTIONS) {
        expect(await screen.findByRole('button', { name })).toBeEnabled();
      }
      expect(screen.queryByText(/se miran, no se suspenden/)).toBeNull();
    });

    it('is the student’s explorer, all of it, when it is not the admin mode', async () => {
      renderApp(TABLE, { ...adminMode, study: fullAnkiStudy() });
      await userEvent.click(await rowOf('¿Cuántas vértebras cervicales hay?'));
      for (const name of ACTIONS) {
        expect(await screen.findByRole('button', { name })).toBeEnabled();
      }
    });
  });
});
