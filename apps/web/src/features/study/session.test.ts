import { DEFAULT_PARAMETERS, retrievability } from '@qv/srs';
import { describe, expect, it } from 'vitest';
import { CATALOG, DECK } from '../../test/render';
import { CardChangedError, defaultPreferences, localStudyRepository } from './repository';
import type { ReviewInput, StoredCard, StudyRepository } from './repository';
import { cardKey, treeDecks } from './scheduler';
import { StudySession, blankRow } from './session';
import { EMPTY_PLAN } from './simple';

const NETWORK = () => new Error('No se pudo guardar tu respuesta: TypeError: Failed to fetch');

function session(repository: StudyRepository, rootId = DECK.id, rows: StoredCard[] = []) {
  return new StudySession(
    {
      deck: DECK,
      decks: treeDecks(CATALOG.anki.decks),
      authorPresets: DECK.presets,
      rows: new Map(rows.map((r) => [cardKey(r), r])),
      answers: [],
      prefs: { ...defaultPreferences('America/Santiago'), fullAnki: true },
      presets: [],
      settings: [],
      plan: { ...EMPTY_PLAN, activations: [{ deckId: '5', active: true }] },
    },
    rootId,
    repository,
    () => {},
    [0, 0],
  );
}

/** Shows the next card, its answer, and answers it. */
function answer(s: StudySession, rating: 1 | 2 | 3 | 4 = 4) {
  s.reveal();
  s.answer(rating);
}

describe('saving the answers when the connection fails', () => {
  it('a failed connection is tried again, and the answer is saved once', async () => {
    const local = localStudyRepository(null);
    let fails = 1;
    const s = session({
      ...local,
      recordReview: (input) =>
        fails-- > 0 ? Promise.reject(NETWORK()) : local.recordReview(input),
    });
    s.showNext();
    answer(s);
    await s.saved();
    expect(s.failure).toBeNull();
    expect(s.pending).toBe(0);
    expect(await local.cards(['20', '21'])).toEqual([expect.objectContaining({ reps: 1 })]);
    expect(await local.answersSince(new Date(0))).toHaveLength(1);
  });

  it('if it was saved and only the reply was lost, the retry sees it and goes on', async () => {
    const local = localStudyRepository(null);
    let lose = 1;
    const s = session({
      ...local,
      recordReview: async (input) => {
        const saved = await local.recordReview(input);
        if (lose-- > 0) throw NETWORK();
        return saved;
      },
    });
    s.showNext();
    answer(s);
    answer(s);
    await s.saved();
    expect(s.failure).toBeNull();
    expect(await local.answersSince(new Date(0))).toHaveLength(2);
  });

  it('when it keeps failing the session stops, and nothing after it is written', async () => {
    const local = localStudyRepository(null);
    const s = session({ ...local, recordReview: () => Promise.reject(NETWORK()) });
    s.showNext();
    answer(s);
    // Two more actions before the first one fails: they are not written either.
    s.flag(2);
    s.hide('suspend_card');
    await s.saved();
    expect(s.failure).toMatch(/No se pudo guardar tu respuesta/);
    expect(s.pending).toBe(0);
    expect(await local.cards(['20', '21'])).toEqual([]);
  });

  it('a card changed in another tab is not retried', async () => {
    const local = localStudyRepository(null);
    let calls = 0;
    const s = session({
      ...local,
      recordReview: () => {
        calls++;
        return Promise.reject(new CardChangedError());
      },
    });
    s.showNext();
    answer(s);
    await s.saved();
    expect(calls).toBe(1);
    expect(s.failure).toMatch(/cambió en otra pestaña/);
  });
});

describe('undo', () => {
  it('stops if the database undid another action (one done in another tab after this one)', async () => {
    const local = localStudyRepository(null);
    const here = session(local);
    here.showNext();
    answer(here);
    await here.saved();
    // Another tab flags a card after it.
    const there = session(local);
    there.showNext();
    there.flag(1);
    await there.saved();

    here.undo();
    await here.saved();
    expect(here.failure).toMatch(/cambió en otra pestaña/);
  });

  it('undoes the session’s own last action', async () => {
    const local = localStudyRepository(null);
    const s = session(local);
    s.showNext();
    answer(s);
    s.flag(3);
    s.undo();
    s.undo();
    await s.saved();
    expect(s.failure).toBeNull();
    expect(await local.cards(['20', '21'])).toEqual([]);
  });
  it('only what was done in this study session: what came before stays', async () => {
    const local = localStudyRepository(null);
    const first = session(local);
    first.showNext();
    answer(first);
    await first.saved();
    const before = await local.cards(['20', '21']);
    expect(before).toHaveLength(1);
    // The student comes back to study (the same deck, a new session): nothing of theirs to undo yet.
    const next = session(local);
    next.showNext();
    expect(next.canUndo).toBe(false);
    next.undo();
    await next.saved();
    expect(next.failure).toBeNull();
    expect(next.toast).toBe('No hay nada que deshacer');
    expect(await local.cards(['20', '21'])).toEqual(before);
  });
});

describe('what an answer saves for the statistics', () => {
  it('the recall FSRS predicted just before (none for a new card) and the card’s version', async () => {
    const DAY = 86_400_000;
    const now = Date.now();
    // The basic card is a review due today, answered 5 days ago; the others are new.
    const basic = DECK.cards[0]!;
    const due: StoredCard = {
      ...blankRow(basic),
      phase: 'review',
      interday: true,
      due: new Date(now - DAY).toISOString(),
      interval: 4,
      stability: 10,
      difficulty: 5,
      reps: 3,
      lastReview: new Date(now - 5 * DAY).toISOString(),
      updatedAt: new Date(now - 5 * DAY).toISOString(),
    };
    const local = localStudyRepository(null);
    const saved: ReviewInput[] = [];
    const s = session(
      {
        ...local,
        recordReview: (input) => {
          saved.push(input);
          return local.recordReview(input);
        },
      },
      DECK.id,
      [due],
    );
    s.showNext();
    for (let i = 0; i < 3 && s.shown; i++) answer(s);
    await s.saved();
    const of = (c: { noteGuid: string; ord: number }) =>
      saved.find((x) => x.card.noteGuid === c.noteGuid && x.card.ord === c.ord);
    const expected = retrievability(DEFAULT_PARAMETERS, { stability: 10, difficulty: 5 }, 5);
    expect(of(basic)?.rBefore).toBeCloseTo(expected, 3);
    expect(of(basic)?.cardVersion).toBe(2);
    const fresh = saved.filter((x) => x !== of(basic));
    expect(fresh.length).toBeGreaterThan(0);
    for (const x of fresh) {
      expect(x.rBefore).toBeNull();
      expect(x.cardVersion).toBe(1);
    }
  });
});
