// Tests what every part of the study adapter shares: how a refusal reads, the paged reads and the card-sync header.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { describe, expect, it } from 'vitest';
import { supabaseStudyRepository } from '../';
import {
  NO_AUTH,
  USERS_DB_KEY,
  USERS_DB_URL,
  refusal,
  usersDbFetch,
} from '../../../../../test/appFakes';
import type { UsersDbCall, UsersDbAnswer } from '../../../../../test/appFakes';

function repo(answer: (call: UsersDbCall) => UsersDbAnswer | undefined) {
  const { fetch, calls } = usersDbFetch(answer);
  const client = createClient<Database>(USERS_DB_URL, USERS_DB_KEY, {
    ...NO_AUTH,
    global: { fetch },
  });
  return { study: supabaseStudyRepository(client), calls };
}

const cardRow = (i: number) => ({
  note_guid: `g${String(i).padStart(4, '0')}`,
  ord: 0,
  deck_id: 'd1',
  phase: 'new',
  interday: false,
  remaining_steps: 0,
  due: null,
  interval: 0,
  stability: null,
  difficulty: null,
  reps: 0,
  lapses: 0,
  last_review: null,
  flag: 0,
  suspended: false,
  buried_until: null,
  leech: false,
  updated_at: '2026-11-09T12:00:00.123456+00:00',
});

describe('a refusal of the database', () => {
  it('the day’s cap of changes says to go on tomorrow; any other cap, that nothing more fits', async () => {
    const daily = repo(() => refusal('P0001', 'quota_exceeded', 'changes'));
    await expect(
      daily.study.suspend([{ noteGuid: 'g', ord: 0, deckId: 'd1' }], 'n'),
    ).rejects.toThrow(
      'No se pudo suspender: llegaste al máximo de cambios de un día. Sigue mañana.',
    );
    const storage = repo(() => refusal('P0001', 'quota_exceeded', 'rows'));
    await expect(
      storage.study.suspend([{ noteGuid: 'g', ord: 0, deckId: 'd1' }], 'n'),
    ).rejects.toThrow('No se pudo suspender: llegaste al máximo que se puede guardar.');
  });

  it('another refusal is said with what failed and the database’s message', async () => {
    const { study } = repo(() => refusal('42501', 'not_allowed'));
    await expect(study.answeredDecks()).rejects.toThrow(
      'No se pudo leer tus mazos estudiados: not_allowed',
    );
  });
});

describe('the paged reads', () => {
  it('asks for the next thousand rows while a page comes full, and stops at a short one', async () => {
    const { study, calls } = repo((c) => {
      const offset = Number(c.search.get('offset') ?? 0);
      const n = offset === 0 ? 1000 : 3;
      return { body: Array.from({ length: n }, (_, i) => cardRow(offset + i)) };
    });
    const cards = await study.allCards();
    expect(cards).toHaveLength(1003);
    expect(calls.map((c) => [c.search.get('offset') ?? '0', c.search.get('limit')])).toEqual([
      ['0', '1000'],
      ['1000', '1000'],
    ]);
  });

  it('a page that fails stops the read with its error, without the pages after it', async () => {
    const { study, calls } = repo((c) =>
      c.search.get('offset') === '1000'
        ? refusal('57014', 'canceling statement due to statement timeout')
        : { body: Array.from({ length: 1000 }, (_, i) => cardRow(i)) },
    );
    await expect(study.allCards()).rejects.toThrow(
      'No se pudo leer tu avance: canceling statement due to statement timeout',
    );
    expect(calls).toHaveLength(2);
  });
});

describe('the card sync of each write', () => {
  it('a write carries up to which content change the page read only once it read it', async () => {
    const { study, calls } = repo((c) =>
      c.name === 'card_sync' ? { body: [{ synced_to: 42, repair_from: 40 }] } : undefined,
    );
    const ref = { noteGuid: 'g', ord: 0, deckId: 'd1' };
    await study.setFlag(ref, 1);
    expect(calls.at(-1)!.headers.get('x-card-sync')).toBeNull();
    expect(await study.cardsSyncedTo()).toBe(40);
    await study.setFlag(ref, 2);
    expect(calls.at(-1)!.headers.get('x-card-sync')).toBe('42');
  });
});
