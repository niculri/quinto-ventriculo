// Tests the study adapter's counts: what each read says when refused, what a missing part of an answer reads as, and
// the decks the days of study are asked for.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { describe, expect, it } from 'vitest';
import { supabaseStudyRepository } from '../';
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

const UNTIL = new Date('2026-11-10T07:00:00Z');

const REFUSED: [string, (s: StudyRepository) => Promise<unknown>][] = [
  ['leer tu avance', (s) => s.deckProgress(UNTIL)],
  ['leer tu tiempo por tarjeta', (s) => s.medianAnswerMs()],
  ['leer tus días de estudio', (s) => s.heatmap(null)],
  ['leer tus estadísticas', (s) => s.cardStats(['d1'])],
  ['leer tu avance', (s) => s.homeCounts(['d1'], UNTIL, {})],
];

describe('a refused count', () => {
  it.each(REFUSED)('«No se pudo %s»', async (what, call) => {
    const { study } = repo(() => refusal('42501', 'not_allowed'));
    await expect(call(study)).rejects.toThrow(`No se pudo ${what}: not_allowed`);
  });
});

describe('the counts', () => {
  it('no answers yet: no median time', async () => {
    expect(await repo(() => ({ body: null })).study.medianAnswerMs()).toBeNull();
  });

  it('the days of all decks ask for none; of some, for those', async () => {
    const { study, calls } = repo(() => ({ body: {} }));
    expect(await study.heatmap(null)).toEqual({ days: [], due: [], tests: [] });
    await study.heatmap(['d1', 'd2']);
    await study.heatmap(null, ['q1']);
    expect(calls.map((c) => c.body)).toEqual([
      {},
      { p_deck_ids: ['d1', 'd2'] },
      { p_quiz_ids: ['q1'] },
    ]);
    expect(await repo(() => ({ body: null })).study.heatmap(null)).toEqual({
      days: [],
      due: [],
      tests: [],
    });
  });

  it('the home page’s counts: nothing to ask for no decks; a missing list reads as empty', async () => {
    const empty = repo();
    expect(await empty.study.homeCounts([], UNTIL, {})).toEqual({ decks: [], truncated: false });
    expect(empty.calls).toEqual([]);
    const { study } = repo(() => ({
      body: { truncated: true, decks: [['d1', 4, 1, 2, 0, 0.8, null]] },
    }));
    expect(await study.homeCounts(['d1'], UNTIL, {})).toEqual({
      truncated: true,
      decks: [
        { deckId: 'd1', seen: 4, hiddenNew: 1, touched: 2, suspended: 0, recall: 0.8, due: [] },
      ],
    });
    const nothing = repo(() => ({ body: null }));
    expect(await nothing.study.homeCounts(['d1'], UNTIL, {})).toEqual({
      decks: [],
      truncated: false,
    });
  });
});
