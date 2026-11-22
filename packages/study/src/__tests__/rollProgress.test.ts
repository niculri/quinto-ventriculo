// Tests what happens to a deck's progress when a new day comes with a session open.
import { describe, expect, it } from 'vitest';
import type { DeckProgress } from '@qv/schema/user';
import { rollProgress } from '../rollProgress';

const L1 = '51';
const L2 = '52';

const row = (deckId: string, over: Partial<DeckProgress> = {}): DeckProgress => ({
  deckId,
  seen: 0,
  newSuspended: 0,
  overdue: 0,
  newToday: 0,
  newYesterday: 0,
  ...over,
});

describe('a new day with a session open', () => {
  it('what was answered stops being new, and only then', () => {
    const answers = [
      { deckId: L1, queueBefore: 'new' },
      { deckId: L1, queueBefore: 'new' },
      { deckId: L1, queueBefore: 'review' },
      { deckId: L2, queueBefore: 'new' },
    ];
    const before = [row(L1, { seen: 10, newToday: 1, newYesterday: 7 })];
    const after = rollProgress(before, answers);
    expect(after.find((p) => p.deckId === L1)).toMatchObject({
      seen: 11,
      newToday: 0,
      newYesterday: 2,
    });
    expect(after.find((p) => p.deckId === L2)).toMatchObject({ seen: 1, newYesterday: 1 });
  });
});
