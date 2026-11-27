// «Tarjetas» in the administration panel: the nightly summary of every student's answers per card and
// admin_card_quality(), only for an administrator, with Wilson's intervals and nothing of fewer than 5 students.
import type { PGlite } from '@electric-sql/pglite';
import { AdminCardQualityRow, CARD_QUALITY_LIMITS } from '@qv/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { OWNER_EMAIL, asUser, closeAfterEachTest, createDatabase } from '../pglite';

closeAfterEachTest();

type Claims = { sub: string; email: string; session_id?: string };

const DECK = '1700000000001';
const OTHER_DECK = '1700000000002';

interface Rate {
  n: number;
  again: number;
  low: number;
  high: number;
}
interface Card {
  note_guid: string;
  ord: number;
  deck_id: string;
  version: number | null;
  students: number;
  first: Rate | null;
  reviews: Rate | null;
  expected: { n: number; again: number; expected: number } | null;
  median_ms: number | null;
  suspended: number;
  buried: number;
  flagged: number;
  leeches: number;
  open_reports: number;
  reasons: string[];
}
interface Quality {
  refreshed_at: string | null;
  min_students: number;
  measured: number;
  few: number;
  hardest: Card[];
  suspicious: Card[];
}

let db: PGlite;
let owner: Claims;
let n = 0;

async function person(op: { email?: string; session?: boolean } = {}): Promise<Claims> {
  n += 1;
  const sub = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const email = op.email ?? `alumno.${n}@ug.uchile.cl`;
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [sub, email]);
  if (!op.email) {
    await db.query(
      `insert into public.invited_emails (email, list) values ($1, 'Curso de prueba')`,
      [email],
    );
  }
  if (op.session === false) return { sub, email };
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.sessions (user_id) values ($1) returning id`,
    [sub],
  );
  return { sub, email, session_id: rows[0]!.id };
}

const students = (count: number) => Promise.all(Array.from({ length: count }, () => person()));

interface Answer {
  guid: string;
  ord?: number;
  deck?: string;
  rating: 1 | 2 | 3 | 4;
  queue?: 'new' | 'learn' | 'day_learn' | 'review';
  lastInterval?: number;
  version?: number | null;
  r?: number | null;
  ms?: number;
  daysAgo?: number;
}

async function answer(who: Claims, a: Answer) {
  await db.query(
    `insert into public.review_log (user_id, action, note_guid, ord, deck_id, reviewed_at, rating, queue_before,
       phase_before, phase_after, last_interval, duration_ms, r_before, card_version)
     values ($1, 'answer', $2, $3, $4, now() - make_interval(days => $5), $6, $7, 'new', 'review', $8, $9, $10, $11)`,
    [
      who.sub,
      a.guid,
      a.ord ?? 0,
      a.deck ?? DECK,
      a.daysAgo ?? 0,
      a.rating,
      a.queue ?? 'review',
      a.lastInterval ?? null,
      a.ms ?? 8000,
      a.r ?? null,
      a.version === undefined ? 1 : a.version,
    ],
  );
}

async function action(who: Claims, kind: string, guid: string, deck = DECK) {
  await db.query(
    `insert into public.review_log (user_id, action, note_guid, ord, deck_id, phase_before, phase_after)
     values ($1, $2, $3, 0, $4, 'new', 'new')`,
    [who.sub, kind, guid, deck],
  );
}

async function state(
  who: Claims,
  guid: string,
  s: { suspended?: boolean; flag?: number; leech?: boolean; retired?: boolean },
) {
  await db.query(
    `insert into public.card_states (user_id, note_guid, ord, deck_id, suspended, flag, leech, retired_at)
     values ($1, $2, 0, $3, $4, $5, $6, $7)`,
    [
      who.sub,
      guid,
      DECK,
      s.suspended ?? false,
      s.flag ?? 0,
      s.leech ?? false,
      s.retired ? new Date().toISOString() : null,
    ],
  );
}

const refresh = () =>
  db.query<{ r: { cards: number; log_rows: number } }>('select public.refresh_card_quality() as r');

const quality = (c: Claims | null, p: unknown = { decks: [DECK] }) =>
  asUser(
    db,
    c,
    async (tx) =>
      (
        await tx.query<{ r: Quality }>('select public.admin_card_quality($1::jsonb) as r', [
          JSON.stringify(p),
        ])
      ).rows[0]!.r,
  );

const card = (q: Quality, guid: string) =>
  [...q.hardest, ...q.suspicious].find((c) => c.note_guid === guid);

beforeEach(async () => {
  db = await createDatabase('users');
  owner = await person({ email: OWNER_EMAIL });
});

describe('the limits and the interval', () => {
  it('the limits are the ones of CARD_QUALITY_LIMITS', async () => {
    const { rows } = await db.query<{ l: unknown }>('select public.card_quality_limits() as l');
    expect(rows[0]!.l).toEqual({
      min_students: CARD_QUALITY_LIMITS.minStudents,
      min_calibrated: CARD_QUALITY_LIMITS.minCalibrated,
      fast_ms: CARD_QUALITY_LIMITS.fastMs,
      hidden_share: CARD_QUALITY_LIMITS.hiddenShare,
      max_list: CARD_QUALITY_LIMITS.maxList,
    });
  });

  it('Wilson’s interval at 95 %, also at 0 and n of n, and none without tries', async () => {
    const { rows } = await db.query<{
      k: number;
      n: number;
      low: number | null;
      high: number | null;
    }>(
      `select k, n, round(public.wilson_low(k, n)::numeric, 4)::float8 as low,
              round(public.wilson_high(k, n)::numeric, 4)::float8 as high
         from (values (5, 10), (0, 10), (10, 10), (1, 5), (30, 200), (0, 0)) v(k, n)`,
    );
    expect(rows).toEqual([
      { k: 5, n: 10, low: 0.2366, high: 0.7634 },
      { k: 0, n: 10, low: 0, high: 0.2775 },
      { k: 10, n: 10, low: 0.7225, high: 1 },
      { k: 1, n: 5, low: 0.0362, high: 0.6245 },
      { k: 30, n: 200, low: 0.1071, high: 0.2061 },
      { k: 0, n: 0, low: null, high: null },
    ]);
  });
});

describe('who can read it', () => {
  it('a student, a closed session and anon cannot; nobody reads the tables through the API', async () => {
    const [ana] = await students(1);
    await expect(quality(ana!)).rejects.toThrow(/admin_only/);
    const closed = await person({ session: false });
    await db.query(`insert into public.admin_emails (email) values ($1)`, [closed.email]);
    await expect(quality(closed)).rejects.toThrow(/session_closed/);
    await expect(quality(null)).rejects.toThrow(/permission denied/);
    for (const table of ['card_quality', 'card_quality_refresh']) {
      await expect(
        asUser(db, ana!, (tx) => tx.query(`select * from public.${table}`)),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(db, null, (tx) => tx.query(`select * from public.${table}`)),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('only the database’s owner rebuilds it: neither a student, an administrator nor service_role', async () => {
    for (const role of ['authenticated', 'anon', 'service_role']) {
      await expect(
        db.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          await tx.query('select public.refresh_card_quality()');
        }),
      ).rejects.toThrow(/permission denied/);
    }
    const helpers = await db.query<{ fn: string; anon: boolean; signed_in: boolean }>(
      `select p.oid::regprocedure::text as fn, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as signed_in
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.proname in ('card_quality_limits', 'wilson_low', 'wilson_high', 'card_quality_row',
                            'admin_card_quality', 'refresh_card_quality')
        order by 1`,
    );
    expect(helpers.rows.filter((h) => h.anon)).toEqual([]);
    expect(helpers.rows.filter((h) => h.signed_in).map((h) => h.fn)).toEqual([
      'admin_card_quality(jsonb)',
    ]);
  });

  it('refuses a `p` without its shape', async () => {
    for (const p of [
      null,
      [],
      {},
      { decks: 'x' },
      { decks: [1] },
      { decks: ['abc'] },
      { decks: Array.from({ length: 5001 }, () => DECK) },
      { decks: [DECK], limit: 0 },
      { decks: [DECK], limit: 201 },
      { decks: [DECK], limit: '5' },
    ]) {
      await expect(quality(owner, p)).rejects.toThrow(/invalid_scope/);
    }
    await expect(quality(owner, { decks: [], limit: 200 })).resolves.toMatchObject({
      measured: 0,
      hardest: [],
    });
  });
});

describe('the figures', () => {
  it('with nothing studied: no cards, and when it was made', async () => {
    await refresh();
    const q = await quality(owner);
    expect(q).toMatchObject({ min_students: 5, measured: 0, few: 0, hardest: [], suspicious: [] });
    expect(Date.parse(q.refreshed_at!)).toBeGreaterThan(Date.now() - 60_000);
  });

  it('a card of 4 students only counts as few; with a fifth its figures come', async () => {
    const people = await students(5);
    for (const p of people.slice(0, 4)) {
      await answer(p, { guid: 'g1', rating: 1, queue: 'new' });
      await answer(p, { guid: 'g1', rating: 1 });
    }
    await refresh();
    let q = await quality(owner);
    expect(q).toMatchObject({ measured: 0, few: 1, hardest: [], suspicious: [] });
    await answer(people[4]!, { guid: 'g1', rating: 3, queue: 'new' });
    await answer(people[4]!, { guid: 'g1', rating: 3 });
    await refresh();
    q = await quality(owner);
    expect(q).toMatchObject({ measured: 1, few: 0 });
    expect(q.hardest.map((c) => c.note_guid)).toEqual(['g1']);
  });

  it('the first view (one per student) and the reviews (each one) apart, with their intervals', async () => {
    const people = await students(6);
    for (const [i, p] of people.entries()) {
      // 2 of 6 fail their first view; the reviews: 12, 3 failed.
      await answer(p, { guid: 'g1', rating: i < 2 ? 1 : 3, queue: 'new', daysAgo: 3 });
      await answer(p, { guid: 'g1', rating: i < 3 ? 1 : 3, daysAgo: 2 });
      await answer(p, { guid: 'g1', rating: 3, daysAgo: 1 });
      // Same-day learning steps are not reviews; a step that waited a day is.
      await answer(p, { guid: 'g1', rating: 1, queue: 'learn', lastInterval: -600 });
    }
    // A forgotten card seen as new again does not count a second first view.
    await answer(people[5]!, { guid: 'g1', rating: 1, queue: 'new' });
    await answer(people[0]!, { guid: 'g1', rating: 3, queue: 'day_learn', lastInterval: 1 });
    await refresh();
    const c = card(await quality(owner), 'g1')!;
    expect(c.students).toBe(6);
    expect(c.first).toEqual({ n: 6, again: 2, low: 0.0968, high: 0.7 });
    expect(c.reviews).toEqual({ n: 13, again: 3, low: 0.0818, high: 0.5026 });
    expect(c.version).toBe(1);
  });

  it('a rate shows only with 5 students behind it, even when the card has more', async () => {
    const people = await students(6);
    for (const p of people) await answer(p, { guid: 'g1', rating: 3, queue: 'new' });
    // Only 2 of them reviewed it yet.
    await answer(people[0]!, { guid: 'g1', rating: 1 });
    await answer(people[1]!, { guid: 'g1', rating: 1 });
    await refresh();
    const q = await quality(owner);
    expect(q.measured).toBe(1);
    // Without reviews of 5 students it is not among the hardest, and its reviews' rate does not go.
    expect(q.hardest).toEqual([]);
    expect(card(q, 'g1')).toBeUndefined();
  });

  it('the hardest go by the lower end of their failure interval', async () => {
    const people = await students(8);
    for (const p of people) {
      await answer(p, { guid: 'easy', rating: 3 });
      await answer(p, { guid: 'hard', rating: 1 });
      await answer(p, { guid: 'mid', rating: p === people[0] ? 3 : 1 });
    }
    await refresh();
    const q = await quality(owner);
    expect(q.hardest.map((c) => c.note_guid)).toEqual(['hard', 'mid', 'easy']);
    expect((await quality(owner, { decks: [DECK], limit: 1 })).hardest).toHaveLength(1);
  });

  it('fails much more than FSRS expected: suspicious; as much as it expected: not', async () => {
    const people = await students(6);
    for (const p of people) {
      for (let i = 0; i < 2; i += 1) {
        // FSRS expected 10 % of failures; they fail half of them.
        await answer(p, { guid: 'bad', rating: i === 0 ? 1 : 3, r: 0.9 });
        // FSRS expected 50 %, and they fail half.
        await answer(p, { guid: 'fine', rating: i === 0 ? 1 : 3, r: 0.5 });
      }
    }
    await refresh();
    const q = await quality(owner);
    const bad = card(q, 'bad')!;
    expect(bad.expected).toEqual({ n: 12, again: 6, expected: 0.1 });
    expect(bad.reasons).toEqual(['unexpected']);
    expect(card(q, 'fine')!.reasons).toEqual([]);
    expect(q.suspicious.map((c) => c.note_guid)).toEqual(['bad']);
  });

  it('without enough reviews with a predicted recall there is nothing to compare with', async () => {
    const people = await students(5);
    // 5 reviews with a recall, fewer than min_calibrated: no comparison even if all fail.
    for (const p of people) await answer(p, { guid: 'g1', rating: 1, r: 0.95 });
    await refresh();
    const c = card(await quality(owner), 'g1')!;
    expect(c.expected).toBeNull();
    expect(c.reasons).toEqual([]);
  });

  it('answered in under two seconds, hidden by many or a leech of many: suspicious', async () => {
    const people = await students(6);
    for (const [i, p] of people.entries()) {
      await answer(p, { guid: 'fast', rating: 3, ms: 900 + i });
      await answer(p, { guid: 'slow', rating: 3, ms: 9000 });
      await answer(p, { guid: 'hid', rating: 3 });
      if (i < 3) await state(p, 'hid', { suspended: true, flag: 2, leech: i === 0 });
      await answer(p, { guid: 'leech', rating: 1 });
      if (i < 4) await state(p, 'leech', { leech: true });
    }
    // A student who hid a card without answering it saw it too.
    const seven = await person();
    await action(seven, 'suspend_card', 'hid');
    await state(seven, 'hid', { suspended: true });
    // A card the author took out of the site does not count as hidden.
    const eight = await person();
    await answer(eight, { guid: 'hid', rating: 3 });
    await state(eight, 'hid', { suspended: true, retired: true });
    await action(people[0]!, 'bury_card', 'hid');
    await action(people[0]!, 'bury_note', 'hid');
    await refresh();
    const q = await quality(owner);
    expect(card(q, 'fast')).toMatchObject({ median_ms: 902, reasons: ['fast'] });
    expect(card(q, 'slow')).toMatchObject({ median_ms: 9000, reasons: [] });
    expect(card(q, 'hid')).toMatchObject({
      students: 8,
      suspended: 4,
      flagged: 3,
      leeches: 1,
      buried: 1,
      reasons: ['hidden'],
    });
    expect(card(q, 'leech')).toMatchObject({ leeches: 4, reasons: ['leech'] });
    // The most reasons first.
    expect(q.suspicious.map((c) => c.note_guid).sort()).toEqual(['fast', 'hid', 'leech']);
  });

  it('more students with it suspended than who saw it (rows without a log): still a share, never an error', async () => {
    const people = await students(8);
    for (const p of people.slice(0, 5)) await answer(p, { guid: 'g1', rating: 3 });
    for (const p of people) await state(p, 'g1', { suspended: true });
    await refresh();
    expect(card(await quality(owner), 'g1')).toMatchObject({
      students: 5,
      suspended: 8,
      reasons: ['hidden'],
    });
  });

  it('a card fixed starts again: only the answers of its latest version count', async () => {
    const people = await students(5);
    for (const p of people) {
      await answer(p, { guid: 'g1', rating: 1, queue: 'new', version: 1, daysAgo: 5 });
      await answer(p, { guid: 'g1', rating: 1, version: 1, daysAgo: 4 });
      await answer(p, { guid: 'g1', rating: 3, version: 2 });
    }
    await refresh();
    const c = card(await quality(owner), 'g1')!;
    expect(c).toMatchObject({ version: 2, students: 5, first: null });
    expect(c.reviews).toMatchObject({ n: 5, again: 0 });
  });

  it('a card counts where it was last answered; only the decks asked for come', async () => {
    const people = await students(5);
    for (const p of people) {
      await answer(p, { guid: 'moved', rating: 3, deck: OTHER_DECK, daysAgo: 3 });
      await answer(p, { guid: 'moved', rating: 3, deck: DECK });
      await answer(p, { guid: 'other', rating: 3, deck: OTHER_DECK });
    }
    await refresh();
    expect((await quality(owner)).hardest.map((c) => [c.note_guid, c.deck_id])).toEqual([
      ['moved', DECK],
    ]);
    expect((await quality(owner, { decks: [OTHER_DECK] })).hardest.map((c) => c.note_guid)).toEqual(
      ['other'],
    );
  });

  it('counts the open reports of the card, not the decided ones nor another card’s', async () => {
    const people = await students(5);
    for (const p of people) await answer(p, { guid: 'g:1', rating: 3 });
    for (const [i, p] of people.slice(0, 3).entries()) {
      await db.query(
        `insert into public.content_reports (user_id, target_kind, target_id, category, comment)
         values ($1, 'card', $2, 'fact', 'Algo raro')`,
        [p.sub, i === 2 ? 'g:1:1' : 'g:1:0'],
      );
    }
    const { rows } = await db.query<{ id: string }>(
      `insert into public.report_resolutions (target_kind, target_id, status) values ('card', 'g:1:0', 'wont_fix')
       returning id`,
    );
    await db.query(
      `insert into public.content_reports (user_id, target_kind, target_id, category, comment, resolution_id)
       values ($1, 'card', 'g:1:0', 'fact', 'Ya visto', $2)`,
      [people[3]!.sub, rows[0]!.id],
    );
    await refresh();
    expect(card(await quality(owner), 'g:1')!.open_reports).toBe(2);
  });

  it('the summary is rebuilt, not added to; a deleted account leaves it the night after', async () => {
    const people = await students(5);
    for (const p of people) await answer(p, { guid: 'g1', rating: 3 });
    await refresh();
    await refresh();
    expect(card(await quality(owner), 'g1')!.students).toBe(5);
    await db.query('delete from auth.users where id = $1', [people[0]!.sub]);
    expect(card(await quality(owner), 'g1')!.students).toBe(5);
    await refresh();
    expect(await quality(owner)).toMatchObject({ measured: 0, few: 1 });
  });

  it('nothing in the answer names or identifies a student', async () => {
    const people = await students(6);
    for (const p of people) {
      await answer(p, { guid: 'g1', rating: 1, queue: 'new', r: 0.9, ms: 500 });
      await answer(p, { guid: 'g1', rating: 1, r: 0.9, ms: 500 });
      await answer(p, { guid: 'g1', rating: 1, r: 0.9, ms: 500 });
      await state(p, 'g1', { suspended: true });
    }
    await refresh();
    const q = await quality(owner);
    expect(q.suspicious).toHaveLength(1);
    // The Worker reads it with the schema of @qv/schema.
    expect(AdminCardQualityRow.parse(q)).toEqual(q);
    const text = JSON.stringify(q);
    for (const p of [...people, owner]) {
      expect(text).not.toContain(p.sub);
      expect(text).not.toContain(p.email);
    }
    expect(text).not.toMatch(/user|email|session/);
  });
});
