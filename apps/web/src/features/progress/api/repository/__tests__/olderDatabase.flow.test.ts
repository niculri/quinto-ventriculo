// The study adapter against a users' database without the two-devices migration: an undo is taken back and compared
// afterwards, as the web did before, and the preferences are saved whole with the patch over what is stored.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { createDatabase } from '@qv/db/testing';
import { fakeSupabase, signIn } from '@qv/db/postgrest';
import type { Person } from '@qv/db/postgrest';
import { preferencesPatch } from '@qv/study';
import { beforeAll, describe, expect, it } from 'vitest';
import { DATABASE_TIMEOUT } from '../../../../../test/contract';
import { answer, card } from '../../../../../test/studyContract';
import { CardChangedError, defaultPreferences } from '../model';
import { supabaseStudyRepository } from '../supabase';

type PGlite = Awaited<ReturnType<typeof createDatabase>>;
let db: PGlite;
let n = 0;

beforeAll(async () => {
  db = await createDatabase('users', [], '20261127000000_two_devices.sql');
}, DATABASE_TIMEOUT);

/** The same student on two devices. */
async function devices() {
  const me = await signIn(db, `estudiante${++n}@ug.uchile.cl`);
  const device = (who: Person) => {
    const rest = fakeSupabase(db, () => who);
    return supabaseStudyRepository(createClient<Database>(rest.url, rest.key, rest.options));
  };
  return { phone: device(me), laptop: device(me) };
}

describe('a users’ database from before the two-devices migration', () => {
  it('an undo of the last action goes; one another device followed stops the session', async () => {
    const { phone, laptop } = await devices();
    const { actionId } = await phone.recordReview(answer(card('a'), null, Date.now()));
    expect(
      await phone.undo({ ...card('a'), action: 'answer', ...(actionId ? { actionId } : {}) }),
    ).toMatchObject({ action: 'answer', noteGuid: 'a' });
    expect(await phone.allCards()).toEqual([]);

    await phone.recordReview(answer(card('b'), null, Date.now()));
    await laptop.recordReview(answer(card('c'), null, Date.now()));
    await expect(phone.undo({ ...card('b'), action: 'answer' })).rejects.toBeInstanceOf(
      CardChangedError,
    );
  });

  it('the preferences: a patch over what is stored, keeping what the other device saved', async () => {
    const { phone, laptop } = await devices();
    const prefs = defaultPreferences('America/Santiago');
    await phone.savePreferences(preferencesPatch(null, prefs));
    await laptop.savePreferences({ fourButtons: true });
    const saved = await phone.savePreferences({ dismissed: { add: ['tip-search'], remove: [] } });
    expect(saved).toEqual({ ...prefs, fourButtons: true, dismissed: ['tip-search'] });
    expect(await laptop.preferences()).toEqual(saved);
  });
});
