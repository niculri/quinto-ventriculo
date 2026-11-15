// Tests cardWrites: each write of the cards page calls one repository method, with the same arguments as before.
import { describe, expect, it } from 'vitest';
import type { CardRef } from '@qv/schema/user';
import type { StudyRepository } from '../../../progress/api/repository';
import { writeCards } from '../cardWrites';
import type { CardWrite } from '../cardWrites';

const A: CardRef = { noteGuid: 'n1', ord: 0, deckId: 'd1' };
const B: CardRef = { noteGuid: 'n2', ord: 1, deckId: 'd1' };

function recording() {
  const calls: unknown[][] = [];
  const study = new Proxy({} as StudyRepository, {
    get:
      (_, name) =>
      (...args: unknown[]) => {
        calls.push([name, ...args]);
        return Promise.resolve();
      },
  });
  return { study, calls };
}

describe('writeCards', () => {
  it('sends each kind of write to its method, with nothing added', async () => {
    const until = new Date(0);
    const writes: [CardWrite, unknown[]][] = [
      [{ kind: 'suspend', cards: [A, B] }, ['suspend', [A, B], false]],
      [{ kind: 'unsuspend', cards: [A] }, ['unsuspend', [A]]],
      [{ kind: 'unbury', cards: [B] }, ['unbury', [B]]],
      [{ kind: 'bury', cards: [A], until }, ['bury', [A], until, false]],
      [{ kind: 'flags', cards: [A, B], flag: 3 }, ['setFlags', [A, B], 3]],
      [{ kind: 'forget', cards: [B], reset: true }, ['forget', [B], true]],
      [{ kind: 'flag', card: A, flag: 1 }, ['setFlag', A, 1]],
    ];
    for (const [w, call] of writes) {
      const { study, calls } = recording();
      await writeCards(study, w);
      expect(calls).toEqual([call]);
    }
  });
});
