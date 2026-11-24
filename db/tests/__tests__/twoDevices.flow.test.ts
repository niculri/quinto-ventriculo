// Two devices of the same student at once: an undo only takes back the action its screen expects, and the
// preferences are saved as a patch, so neither device undoes or overwrites what the other did.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from '../pglite';

let db: PGlite;
const ANA = { sub: '00000000-0000-4000-8000-0000000000a1', email: 'ana@ug.uchile.cl' };
const BETO = { sub: '00000000-0000-4000-8000-0000000000b1', email: 'beto@ug.uchile.cl' };
const OUTSIDER = { sub: '00000000-0000-4000-8000-0000000000c1', email: 'otra@gmail.com' };
const DECK = '3001';

beforeAll(async () => {
  db = await createDatabase('users');
  await db.query('update public.access_settings set open_to_domain = true');
  for (const u of [ANA, BETO, OUTSIDER]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
});

const card = (noteGuid: string) => ({ noteGuid, ord: 0, deckId: DECK });

function answer(noteGuid: string) {
  const now = new Date().toISOString();
  return {
    ...card(noteGuid),
    expectedUpdatedAt: null,
    rating: 3,
    queueBefore: 'new',
    interval: -600,
    lastInterval: 0,
    durationMs: 3000,
    state: {
      phase: 'learning',
      interday: false,
      remainingSteps: 1,
      due: now,
      interval: 0,
      stability: 2.3,
      difficulty: 2.1,
      reps: 1,
      lapses: 0,
      lastReview: now,
      suspended: false,
      leech: false,
    },
    bury: [],
    buriedUntil: null,
  };
}

type Claims = { sub: string; email: string };

async function answerAs(who: Claims, noteGuid: string): Promise<string> {
  const { rows } = await asUser(db, who, (tx) =>
    tx.query<{ r: { actionId: string } }>('select public.record_review($1) as r', [
      answer(noteGuid),
    ]),
  );
  return rows[0]!.r.actionId;
}

const undo = (who: Claims, expected?: unknown) =>
  asUser(db, who, async (tx) => {
    const { rows } = await tx.query<{ r: { action: string; noteGuid: string } | null }>(
      expected === undefined
        ? 'select public.undo_last_review() as r'
        : 'select public.undo_last_review(expected => $1) as r',
      expected === undefined ? [] : [JSON.stringify(expected)],
    );
    return rows[0]!.r;
  });

const cardsOf = async (who: Claims) =>
  (
    await db.query<{ note_guid: string }>(
      'select note_guid from public.card_states where user_id = $1 order by note_guid',
      [who.sub],
    )
  ).rows.map((r) => r.note_guid);

describe('undoing with two devices', () => {
  it('an undo expecting an answer another device followed is refused and changes nothing', async () => {
    const onPhone = await answerAs(ANA, 'p1');
    const onLaptop = await answerAs(ANA, 'p2');
    await expect(undo(ANA, { ...card('p1'), action: 'answer', actionId: onPhone })).rejects.toThrow(
      /undo_refused/,
    );
    expect(await cardsOf(ANA)).toEqual(['p1', 'p2']);
    // The laptop takes back its own answer, and then the phone's is the last one: it can be undone.
    expect(await undo(ANA, { ...card('p2'), action: 'answer', actionId: onLaptop })).toMatchObject({
      action: 'answer',
      noteGuid: 'p2',
    });
    expect(await undo(ANA, { ...card('p1'), action: 'answer', actionId: onPhone })).toMatchObject({
      noteGuid: 'p1',
    });
    expect(await cardsOf(ANA)).toEqual([]);
  });

  it('the same card answered again elsewhere is told apart by the answer’s id', async () => {
    const first = await answerAs(ANA, 'q1');
    const { rows } = await db.query<{ updated_at: string }>(
      `select updated_at from public.card_states where user_id = $1 and note_guid = 'q1'`,
      [ANA.sub],
    );
    await asUser(db, ANA, (tx) =>
      tx.query('select public.record_review($1)', [
        { ...answer('q1'), expectedUpdatedAt: rows[0]!.updated_at },
      ]),
    );
    await expect(undo(ANA, { ...card('q1'), action: 'answer', actionId: first })).rejects.toThrow(
      /undo_refused/,
    );
    // Without the id only the action and its card are compared: the browser of another device would match.
    expect(await undo(ANA, { ...card('q1'), action: 'answer' })).toMatchObject({ noteGuid: 'q1' });
    expect(await undo(ANA, { ...card('q1'), action: 'answer', actionId: first })).toMatchObject({
      noteGuid: 'q1',
    });
  });

  it('an action without an id is checked by what it was and its card', async () => {
    const until = new Date(Date.now() + 86_400_000).toISOString();
    await asUser(db, ANA, (tx) =>
      tx.query('select public.bury_cards($1, $2, true)', [[card('r1'), card('r2')], until]),
    );
    await expect(undo(ANA, { ...card('r1'), action: 'bury_card' })).rejects.toThrow(/undo_refused/);
    await expect(undo(ANA, { ...card('r2'), action: 'bury_note' })).rejects.toThrow(/undo_refused/);
    expect(await undo(ANA, { ...card('r1'), action: 'bury_note' })).toMatchObject({
      action: 'bury_note',
    });
  });

  it('with nothing left to undo an expected action is refused; without one the answer is null', async () => {
    expect(await undo(BETO)).toBeNull();
    await expect(undo(BETO, { ...card('s1'), action: 'answer' })).rejects.toThrow(/undo_refused/);
  });

  it('without `expected` it undoes the last action, whatever it was, as before', async () => {
    await answerAs(BETO, 't1');
    await answerAs(BETO, 't2');
    expect(await undo(BETO)).toMatchObject({ noteGuid: 't2' });
    expect(await cardsOf(BETO)).toEqual(['t1']);
  });

  it('a malformed expectation is refused before looking, and a wrong field is a refusal', async () => {
    await answerAs(BETO, 'u1');
    await expect(undo(BETO, [card('u1')])).rejects.toThrow(/invalid_undo/);
    await expect(undo(BETO, { padding: 'x'.repeat(2000) })).rejects.toThrow(/invalid_undo/);
    await expect(undo(BETO, { ...card('u1'), ord: 'x', action: 'answer' })).rejects.toThrow(
      /undo_refused/,
    );
    await expect(undo(BETO, { ...card('u1'), action: 'answer', actionId: null })).rejects.toThrow(
      /undo_refused/,
    );
    expect(await cardsOf(BETO)).toEqual(['t1', 'u1']);
  });

  it('somebody not invited cannot undo, and anon cannot call it', async () => {
    await expect(undo(OUTSIDER, { ...card('v1'), action: 'answer' })).rejects.toThrow(
      /not_allowed/,
    );
    await expect(
      asUser(db, null, (tx) => tx.query(`select public.undo_last_review('{}')`)),
    ).rejects.toThrow(/permission denied/);
  });
});

type Prefs = Record<string, unknown>;

const save = (who: Claims, p: unknown) =>
  asUser(db, who, async (tx) => {
    const { rows } = await tx.query<{ r: Prefs }>('select public.save_study_preferences($1) as r', [
      JSON.stringify(p),
    ]);
    return rows[0]!.r;
  });

describe('preferences as a patch', () => {
  it('the first save makes the row with the defaults and what it brings', async () => {
    expect(await save(ANA, { fullAnki: true, timeZone: 'America/Punta_Arenas' })).toEqual({
      timeZone: 'America/Punta_Arenas',
      dayStartsAt: 4,
      learnAheadMinutes: 20,
      newCardsIgnoreReviewLimit: false,
      applyAllParentLimits: false,
      fullAnki: true,
      fourButtons: false,
      welcomeSeen: false,
      semester: null,
      addedCourses: [],
      removedCourses: [],
      dismissed: [],
    });
  });

  it('two devices changing different things keep both, also inside the same list', async () => {
    // Both devices loaded the preferences with nothing dismissed and no semester.
    await save(ANA, { dismissed: { add: ['tip-search'], remove: [] }, semester: 3 });
    const laptop = await save(ANA, {
      dismissed: { add: ['first-steps'], remove: [] },
      fourButtons: true,
    });
    expect(laptop).toMatchObject({
      dismissed: ['tip-search', 'first-steps'],
      semester: 3,
      fourButtons: true,
      fullAnki: true,
    });
  });

  it('a course moves between the lists without touching the others, and comes back to the end', async () => {
    await save(ANA, { addedCourses: { add: ['anatomia-1', 'fisica'], remove: [] } });
    const moved = await save(ANA, {
      addedCourses: { add: [], remove: ['anatomia-1'] },
      removedCourses: { add: ['anatomia-1'], remove: [] },
    });
    expect(moved).toMatchObject({ addedCourses: ['fisica'], removedCourses: ['anatomia-1'] });
    const back = await save(ANA, {
      addedCourses: { add: ['anatomia-1', 'fisica', 'anatomia-1'], remove: [] },
      removedCourses: { add: [], remove: ['anatomia-1'] },
    });
    expect(back).toMatchObject({ addedCourses: ['anatomia-1', 'fisica'], removedCourses: [] });
  });

  it('a full list keeps the newest', async () => {
    const many = Array.from({ length: 55 }, (_, i) => `tip-${i}`);
    const r = await save(BETO, { dismissed: { add: many, remove: [] } });
    expect(r.dismissed).toEqual(many.slice(-50));
  });

  it('what is not a preference, a wrong value or too much is refused', async () => {
    await expect(save(ANA, { colour: 'red' })).rejects.toThrow(/invalid_preferences/);
    await expect(save(ANA, [])).rejects.toThrow(/too_large/);
    await expect(save(ANA, { timeZone: 'x'.repeat(17_000) })).rejects.toThrow(/too_large/);
    await expect(save(ANA, { semester: 99 })).rejects.toThrow(/check constraint/);
    await expect(save(ANA, { dismissed: { add: ['Con Espacio'], remove: [] } })).rejects.toThrow(
      /check constraint/,
    );
    await expect(save(ANA, { dismissed: { add: [null], remove: [] } })).rejects.toThrow(
      /check constraint/,
    );
    expect((await save(ANA, {})).semester).toBe(3);
  });

  it('a list sent whole, or without what it gains or loses, is refused; a null in what it loses takes out nothing', async () => {
    const before = await save(ANA, {});
    for (const dismissed of [['tip-x'], { add: ['tip-x'] }, { add: ['tip-x'], remove: 'tip-a' }]) {
      await expect(save(ANA, { dismissed })).rejects.toThrow(/invalid_preferences/);
    }
    expect(await save(ANA, { dismissed: { add: [], remove: [null] } })).toEqual(before);
  });

  it('only the student’s own row, never for somebody not invited, and the list helper is not callable', async () => {
    expect((await save(BETO, {})).fullAnki).toBe(false);
    await expect(save(OUTSIDER, { fullAnki: true })).rejects.toThrow(/not_allowed/);
    await expect(
      asUser(db, ANA, (tx) => tx.query(`select public.patch_text_list('{}', null, 1)`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, null, (tx) => tx.query(`select public.save_study_preferences('{}')`)),
    ).rejects.toThrow(/permission denied/);
  });
});
