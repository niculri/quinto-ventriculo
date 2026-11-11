// Plan step 3.3 (ANK-7): the progress of the decks of an assessment in one call (card_states_of_decks()), and a page at a
// time when the users' database does not have it yet.
import { describe, expect, it } from 'vitest';
import { CARDS_OF_DECKS_MAX, supabaseStudyRepository } from './repository';

const row = (note_guid: string, deck_id: string) => ({
  note_guid,
  ord: 0,
  deck_id,
  phase: 'review',
  interday: true,
  remaining_steps: 0,
  due: '2026-11-12T09:00:00+00:00',
  interval: 3,
  stability: 4.5,
  difficulty: 6,
  reps: 3,
  lapses: 1,
  last_review: '2026-11-09T12:00:00+00:00',
  flag: 0,
  suspended: false,
  buried_until: null,
  leech: false,
  updated_at: '2026-11-09T12:00:00.123456+00:00',
  retired_at: null,
});

/** Just what `cards()` calls: the function, and the table a page at a time (only if the function is missing). */
function fakeClient(rpc: { data: unknown; error: { code: string; message: string } | null }) {
  const calls: string[] = [];
  const client = {
    rpc: async (fn: string, args: { p_deck_ids: string[] }) => {
      calls.push(`${fn}(${args.p_deck_ids.length})`);
      return rpc;
    },
    from: (table: string) => {
      const q = {
        ids: [] as string[],
        select: () => q,
        in: (_c: string, ids: string[]) => ((q.ids = ids), q),
        order: () => q,
        range: async (from: number) => {
          calls.push(`${table}.in(${q.ids.length}) from ${from}`);
          return { data: from === 0 ? q.ids.map((d) => row(`p-${d}`, d)) : [], error: null };
        },
      };
      return q;
    },
  };
  return { client: client as unknown as Parameters<typeof supabaseStudyRepository>[0], calls };
}

describe('cards(deckIds) (step 3.3)', () => {
  it('one call for the decks of an assessment, its rows as the table’s', async () => {
    const { client, calls } = fakeClient({ data: [row('a', '1'), row('b', '2')], error: null });
    const cards = await supabaseStudyRepository(client).cards(['1', '2', '3']);
    expect(calls).toEqual(['card_states_of_decks(3)']);
    expect(cards.map((c) => [c.noteGuid, c.deckId, c.phase, c.lapses])).toEqual([
      ['a', '1', 'review', 1],
      ['b', '2', 'review', 1],
    ]);
    // The time of the row as the database wrote it (the answer sends it back).
    expect(cards[0]!.updatedAt).toBe('2026-11-09T12:00:00.123456+00:00');
    expect(cards[0]!.due).toBe('2026-11-12T09:00:00.000Z');
  });

  it('nothing to ask for no decks; a very long list in pieces of the database’s cap', async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    expect(await supabaseStudyRepository(client).cards([])).toEqual([]);
    expect(calls).toEqual([]);
    const many = Array.from({ length: CARDS_OF_DECKS_MAX + 1 }, (_, i) => String(i));
    await supabaseStudyRepository(client).cards(many);
    expect(calls).toEqual([
      `card_states_of_decks(${CARDS_OF_DECKS_MAX})`,
      'card_states_of_decks(1)',
    ]);
  });

  it('a users’ database from before the function: the table a page at a time, sixty decks a request', async () => {
    const { client, calls } = fakeClient({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function' },
    });
    const ids = Array.from({ length: 61 }, (_, i) => String(i));
    const cards = await supabaseStudyRepository(client).cards(ids);
    expect(cards).toHaveLength(61);
    expect(calls).toEqual([
      'card_states_of_decks(61)',
      'card_states.in(60) from 0',
      'card_states.in(1) from 0',
    ]);
  });

  it('another error is said', async () => {
    const { client } = fakeClient({ data: null, error: { code: '42501', message: 'not_allowed' } });
    await expect(supabaseStudyRepository(client).cards(['1'])).rejects.toThrow();
  });
});
