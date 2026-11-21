// Tests which cards a command changes the mark of.
import { describe, expect, it } from 'vitest';
import { touchedBy } from '../commands';
import type { Command } from '../commands';

const a = { noteGuid: 'a', ord: 0, deckId: '1' };
const b = { noteGuid: 'b', ord: 1, deckId: '2' };

describe('the cards a command touches', () => {
  it('an answer touches its card and the siblings it buries', () => {
    const answer: Command = {
      kind: 'saveAnswer',
      id: '1.0',
      review: {
        card: a,
        rating: 3,
        queueBefore: 'new',
        interval: 1,
        lastInterval: 0,
        durationMs: 10,
        state: {
          phase: 'learning',
          interday: false,
          remainingSteps: 1,
          due: null,
          interval: 0,
          stability: null,
          difficulty: null,
          reps: 1,
          lapses: 0,
          lastReview: null,
          suspended: false,
          leech: false,
        },
        bury: [b],
        buriedUntil: null,
      },
    };
    expect(touchedBy(answer)).toEqual([a, b]);
  });

  it('burying and suspending touch the cards they name, a flag its card', () => {
    expect(
      touchedBy({
        kind: 'bury',
        id: '2.0',
        cards: [a, b],
        untilMs: 0,
        note: true,
      }),
    ).toEqual([a, b]);
    expect(touchedBy({ kind: 'suspend', id: '3.0', cards: [b], note: false })).toEqual([b]);
    expect(touchedBy({ kind: 'setFlag', id: '4.0', card: a, flag: 2 })).toEqual([a]);
  });

  it('an undo and a prefetch touch none', () => {
    expect(
      touchedBy({
        kind: 'undo',
        id: '5.0',
        undoes: '4.0',
        action: 'flag',
        card: a,
      }),
    ).toEqual([]);
    expect(touchedBy({ kind: 'prefetch', id: '6.0', entries: [] })).toEqual([]);
  });
});
