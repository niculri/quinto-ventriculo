// Tests the study adapter's writes: which refusals are the answer and not the network, what each one says, and how the
// card sync moves with what the database reconciled.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { describe, expect, it } from 'vitest';
import {
  CardChangedError,
  PracticeRefusedError,
  supabaseStudyRepository,
  UndoRefusedError,
} from '../';
import type { StudyRepository } from '../';
import {
  NO_AUTH,
  USERS_DB_KEY,
  USERS_DB_URL,
  refusal,
  usersDbFetch,
} from '../../../../../test/appFakes';
import type { UsersDbAnswer, UsersDbCall } from '../../../../../test/appFakes';

function repo(answer: (call: UsersDbCall) => UsersDbAnswer | undefined = () => undefined) {
  const { fetch, calls } = usersDbFetch(answer);
  const client = createClient<Database>(USERS_DB_URL, USERS_DB_KEY, {
    ...NO_AUTH,
    global: { fetch },
  });
  return { study: supabaseStudyRepository(client), calls };
}

const REF = { noteGuid: 'g1', ord: 0, deckId: 'd1' };
const REVIEW = {
  card: REF,
  expectedUpdatedAt: '2026-11-09T12:00:00.123456+00:00',
  rating: 3,
  queueBefore: 'review',
  interval: 4,
  lastInterval: 3,
  durationMs: 5000,
  state: { phase: 'review' },
  bury: [],
  buriedUntil: null,
} as unknown as Parameters<StudyRepository['recordReview']>[0];

const REFUSED: [string, (s: StudyRepository) => Promise<unknown>][] = [
  ['enterrar', (s) => s.bury([REF], new Date('2026-11-10T07:00:00Z'), false)],
  ['suspender', (s) => s.suspend([REF], false)],
  ['marcar la tarjeta', (s) => s.setFlag(REF, 1)],
  ['marcar las tarjetas', (s) => s.setFlags([REF], 1)],
  ['quitar la suspensión', (s) => s.unsuspend([REF])],
  ['desenterrar', (s) => s.unbury([REF])],
  ['olvidar las tarjetas', (s) => s.forget([REF], true)],
  ['deshacer', (s) => s.undo()],
  ['guardar tu respuesta', (s) => s.recordReview(REVIEW)],
  ['leer tu avance', (s) => s.cardsSyncedTo()],
  ['poner al día tus tarjetas', (s) => s.reconcileCards({ since: 0, upTo: 1, changes: [] })],
];

describe('a refused write', () => {
  it.each(REFUSED)('«No se pudo %s» with the database’s message', async (what, call) => {
    const { study } = repo(() => refusal('XX000', 'internal error'));
    await expect(call(study)).rejects.toThrow(`No se pudo ${what}: internal error`);
  });

  it('an answer to a card somebody changed is a CardChangedError, to read the card again', async () => {
    const { study } = repo(() => refusal('P0001', 'record_review: card_changed'));
    await expect(study.recordReview(REVIEW)).rejects.toBeInstanceOf(CardChangedError);
  });
});

describe('the practice', () => {
  it('only the decks with something practised are sent, and nothing when none has', async () => {
    const { study, calls } = repo();
    await study.recordPractice([{ deckId: 'd1', n: 0 }]);
    expect(calls).toEqual([]);
    await study.recordPractice([
      { deckId: 'd1', n: 0 },
      { deckId: 'd2', n: 3 },
    ]);
    expect(calls.map((c) => c.body)).toEqual([{ p: { decks: [{ deckId: 'd2', n: 3 }] } }]);
  });

  it.each(['42501', '22023', 'P0001'])(
    'a refusal %s is the answer, not the network: a PracticeRefusedError',
    async (code) => {
      const { study } = repo(() => refusal(code, 'refused'));
      const e: unknown = await study
        .recordPractice([{ deckId: 'd1', n: 1 }])
        .catch((x: unknown) => x);
      expect(e).toBeInstanceOf(PracticeRefusedError);
      expect((e as Error).message).toBe('No se pudo guardar tu repaso: refused');
    },
  );

  it('another failure is the usual error, that can be retried', async () => {
    const { study } = repo(() => refusal('57014', 'timeout'));
    const e: unknown = await study
      .recordPractice([{ deckId: 'd1', n: 1 }])
      .catch((x: unknown) => x);
    expect(e).not.toBeInstanceOf(PracticeRefusedError);
    expect((e as Error).message).toBe('No se pudo guardar tu repaso: timeout');
  });
});

describe('the card sync', () => {
  it('starts from where a page that was behind left rows to repair, else from what was synced, else 0', async () => {
    const read = (row: unknown) =>
      repo(() => ({ body: row === null ? [] : [row] })).study.cardsSyncedTo();
    expect(await read({ synced_to: 9, repair_from: 4 })).toBe(4);
    expect(await read({ synced_to: 9, repair_from: null })).toBe(9);
    expect(await read(null)).toBe(0);
  });

  it('a reconciling that applied moves the header of the writes; one another tab got first does not', async () => {
    let applied = false;
    const { study, calls } = repo((c) => {
      if (c.name === 'card_sync') return { body: [{ synced_to: 5, repair_from: null }] };
      if (c.name === 'reconcile_cards') return { body: { applied, syncedTo: '8', changed: 2 } };
      return undefined;
    });
    await study.cardsSyncedTo();
    expect(await study.reconcileCards({ since: 5, upTo: 8, changes: [] })).toEqual({
      applied: false,
      syncedTo: 8,
      changed: 2,
    });
    await study.setFlag(REF, 1);
    expect(calls.at(-1)!.headers.get('x-card-sync')).toBe('5');
    applied = true;
    await study.reconcileCards({ since: 5, upTo: 8, changes: [] });
    await study.setFlag(REF, 1);
    expect(calls.at(-1)!.headers.get('x-card-sync')).toBe('8');
  });
});

describe('undo', () => {
  it('nothing to undo is null', async () => {
    expect(await repo(() => ({ body: null })).study.undo()).toBeNull();
  });

  it('sends the action it expects, and a refusal for another one is an UndoRefusedError', async () => {
    const { study, calls } = repo(() => refusal('P0001', 'undo_refused'));
    const expected = { ...REF, action: 'answer' as const, actionId: 'a1' };
    await expect(study.undo(expected)).rejects.toBeInstanceOf(UndoRefusedError);
    expect(calls[0]!.body).toEqual({ expected });
  });

  it('an answer gives the id the database named it with', async () => {
    const { study } = repo(() => ({ body: { actionId: 'a1', updatedAt: 't' } }));
    expect(await study.recordReview(REVIEW)).toEqual({ actionId: 'a1', updatedAt: 't' });
  });
});
