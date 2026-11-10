// Plan step 3.2 (20261122000000_home.sql): the home page's counts without the decks, and the two new preferences.
import type { PGlite } from '@electric-sql/pglite';
import { retrievability } from '@qv/srs';
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createDatabase } from './pglite';

const ANA = { sub: '00000000-0000-4000-8000-00000000004a', email: 'ana@ug.uchile.cl' };
const BETO = { sub: '00000000-0000-4000-8000-00000000004b', email: 'beto@ug.uchile.cl' };
const OUTSIDER = { sub: '00000000-0000-4000-8000-00000000004c', email: 'otro@gmail.com' };
const DECK = '2059400110';
const EXTRAS = '2059400111';

type Q = Pick<PGlite, 'query'>;
type Row = [string, number, number, number, number, number, [string, number, string, number][]];
type Result = { decks: Row[]; truncated: boolean };

const HOUR = 3_600_000;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const until = iso(now + 20 * HOUR);

const counts = async (tx: Q, decks: string[], decay: Record<string, number> = {}) =>
  (
    await tx.query<{ r: Result }>('select public.home_counts($1, $2, $3) as r', [
      decks,
      until,
      decay,
    ])
  ).rows[0]!.r;

let db: PGlite;

/** A row of card_states, written as the database's owner (the student writes through record_review()). */
async function state(user: { sub: string }, row: Record<string, unknown>) {
  const r: Record<string, unknown> = {
    deck_id: DECK,
    phase: 'review',
    interday: true,
    due: iso(now - HOUR),
    last_review: iso(now - 3 * 24 * HOUR),
    stability: 5,
    difficulty: 5,
    suspended: false,
    buried_until: null,
    retired_at: null,
    ...row,
  };
  await db.query(
    `insert into public.card_states (user_id, note_guid, ord, deck_id, phase, interday, due, last_review, stability,
       difficulty, suspended, buried_until, retired_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      user.sub,
      r['note_guid'],
      r['ord'],
      r.deck_id,
      r.phase,
      r.interday,
      r.phase === 'new' ? null : r.due,
      r.phase === 'new' ? null : r.last_review,
      r.phase === 'new' ? null : r.stability,
      r.phase === 'new' ? null : r.difficulty,
      r.suspended,
      r.buried_until,
      r.retired_at,
    ],
  );
}

beforeAll(async () => {
  db = await createDatabase('users');
  await db.query('update public.access_settings set open_to_domain = true');
  for (const u of [ANA, BETO, OUTSIDER]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
  }
  // A review due, its sibling not yet due, a learning step of today, learning past a day, a review of tomorrow.
  await state(ANA, { note_guid: 'a', ord: 0 });
  await state(ANA, { note_guid: 'a', ord: 1, due: iso(now + 5 * 24 * HOUR) });
  await state(ANA, {
    note_guid: 'b',
    ord: 0,
    phase: 'learning',
    interday: false,
    due: iso(now + 600_000),
  });
  await state(ANA, {
    note_guid: 'c',
    ord: 0,
    phase: 'learning',
    interday: true,
    due: iso(now - 2 * HOUR),
  });
  await state(ANA, { note_guid: 'd', ord: 0, due: iso(now + 30 * HOUR) });
  // Hidden: suspended, buried until later, a new card suspended, a new card buried, a new card forgotten.
  await state(ANA, { note_guid: 'e', ord: 0, suspended: true });
  await state(ANA, { note_guid: 'f', ord: 0, buried_until: iso(now + 10 * HOUR) });
  await state(ANA, { note_guid: 'g', ord: 0, phase: 'new', interday: false, suspended: true });
  await state(ANA, {
    note_guid: 'g',
    ord: 1,
    phase: 'new',
    interday: false,
    buried_until: iso(now + HOUR),
  });
  await state(ANA, { note_guid: 'h', ord: 0, phase: 'new', interday: false });
  // Taken out of the site: out of everything.
  await state(ANA, { note_guid: 'i', ord: 0, retired_at: iso(now - HOUR) });
  // Another deck, and another student.
  await state(ANA, { note_guid: 'j', ord: 0, deck_id: EXTRAS, stability: 2 });
  await state(BETO, { note_guid: 'a', ord: 0 });
});

describe('home_counts', () => {
  it('each deck with what it has seen, what is hidden and the cards that can come out today', async () => {
    const r = await asUser(db, ANA, (tx) => counts(tx, [DECK]));
    expect(r.truncated).toBe(false);
    expect(r.decks).toHaveLength(1);
    const [deck, seen, hiddenNew, touched, suspended, , due] = r.decks[0]!;
    expect(deck).toBe(DECK);
    // a0 a1 b c d e f (seen); g0 g1 h are new; i is out. Notes a to h.
    expect(seen).toBe(7);
    expect(hiddenNew).toBe(2);
    expect(touched).toBe(8);
    expect(suspended).toBe(2);
    expect(due.map(([g, o, q]) => `${g}${o}${q}`)).toEqual(['a0r', 'b0l', 'c0d']);
    const learning = due.find(([g]) => g === 'b')!;
    expect(learning[3]).toBe(Math.floor((now + 600_000) / 1000));
  });

  it('the dominio is @qv/srs’s retrievability, with each deck’s decay', async () => {
    const r = await asUser(db, ANA, (tx) => counts(tx, [DECK, EXTRAS], { [EXTRAS]: 0.2 }));
    const extras = r.decks.find((d) => d[0] === EXTRAS)!;
    const days = 3;
    const params = [...Array(20).fill(0), 0.2];
    expect(extras[5]).toBeCloseTo(retrievability(params, { stability: 2, difficulty: 5 }, days), 4);
    const deck = r.decks.find((d) => d[0] === DECK)!;
    // Six cards seen and not suspended (f is buried: it still counts), all answered three days ago with stability 5.
    const one = retrievability([...Array(20).fill(0), 0.5], { stability: 5, difficulty: 5 }, days);
    expect(deck[5]).toBeCloseTo(6 * one, 4);
  });

  it('each student reads only their own; anon cannot call it, and a student not invited gets nothing', async () => {
    const beto = await asUser(db, BETO, (tx) => counts(tx, [DECK]));
    expect(beto.decks.map((d) => [d[0], d[1]])).toEqual([[DECK, 1]]);
    await expect(asUser(db, null, (tx) => counts(tx, [DECK]))).rejects.toThrow(/permission denied/);
    await db.query('update public.access_settings set open_to_domain = false');
    try {
      const outsider = await asUser(db, OUTSIDER, (tx) => counts(tx, [DECK]));
      expect(outsider.decks).toEqual([]);
    } finally {
      await db.query('update public.access_settings set open_to_domain = true');
    }
  });

  it('refuses what is too large or not a decay', async () => {
    const many = Array.from({ length: 5001 }, (_, i) => String(i + 1));
    await expect(asUser(db, ANA, (tx) => counts(tx, many))).rejects.toThrow(/too_large/);
    await expect(asUser(db, ANA, (tx) => counts(tx, [DECK], { [DECK]: 9 }))).rejects.toThrow(
      /invalid_decay/,
    );
  });
});

describe('the preferences of the home page', () => {
  it('the semester and what was closed are saved, within limits', async () => {
    await asUser(db, ANA, (tx) =>
      tx.query(
        `insert into public.study_preferences (semester, dismissed) values (2, '{first-steps,tip-search}')`,
      ),
    );
    const r = await db.query<{ semester: number; dismissed: string[] }>(
      `select semester, dismissed from public.study_preferences where user_id = $1`,
      [ANA.sub],
    );
    expect(r.rows[0]).toEqual({ semester: 2, dismissed: ['first-steps', 'tip-search'] });
    await expect(
      asUser(db, ANA, (tx) => tx.query(`update public.study_preferences set semester = 15`)),
    ).rejects.toThrow(/check/);
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(`update public.study_preferences set dismissed = '{"<script>"}'`),
      ),
    ).rejects.toThrow(/check/);
    // The owner's decision of the review: the courses added to «Tus ramos» and those taken out, by the catalog's id.
    await asUser(db, ANA, (tx) =>
      tx.query(
        `update public.study_preferences
            set added_courses = '{anatomia-2,biologia-celular}', removed_courses = '{fisica}'`,
      ),
    );
    const courses = await db.query<{ added_courses: string[]; removed_courses: string[] }>(
      `select added_courses, removed_courses from public.study_preferences where user_id = $1`,
      [ANA.sub],
    );
    expect(courses.rows[0]).toEqual({
      added_courses: ['anatomia-2', 'biologia-celular'],
      removed_courses: ['fisica'],
    });
    for (const bad of [
      `'{Anatomia}'`,
      `'{"ana tomia"}'`,
      `'{""}'`,
      `'{anatomia-2,NULL}'`,
      `'{-anatomia}'`,
      `array_fill('a'::text, array[101])`,
      `array[repeat('a', 4001)]`,
    ]) {
      for (const column of ['added_courses', 'removed_courses']) {
        await expect(
          asUser(db, ANA, (tx) =>
            tx.query(`update public.study_preferences set ${column} = ${bad}`),
          ),
          `${column} = ${bad}`,
        ).rejects.toThrow(/check/);
      }
    }
    // Review of 3.2: a null in the list does not slip through.
    await expect(
      asUser(db, ANA, (tx) =>
        tx.query(`update public.study_preferences set dismissed = '{first-steps,NULL}'`),
      ),
    ).rejects.toThrow(/check/);
  });
});
