// «Uso» in the administration panel: admin_usage(), only for an administrator with an open session, and nothing of
// its answer names or identifies a student.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { OWNER_EMAIL, asUser, createDatabase } from '../pglite';

// Every figure is exact from 0 up (also with 1 to 4 students), the lists have whatever 1 student or more used, and the
// activation counts the first answer within 7 days of the account.

type Claims = { sub: string; email: string; session_id?: string };

let n = 0;
async function person(
  db: PGlite,
  op: { email?: string; createdAt?: string } = {},
): Promise<Claims> {
  n += 1;
  const sub = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const mail = op.email ?? `alumno.${n}@ug.uchile.cl`;
  await db.query(`insert into auth.users (id, email, last_sign_in_at) values ($1, $2, now())`, [
    sub,
    mail,
  ]);
  if (!op.email) {
    await db.query(
      `insert into public.invited_emails (email, list) values ($1, 'Curso de prueba')`,
      [mail],
    );
  }
  if (op.createdAt) {
    await db.query(`update public.profiles set created_at = ${op.createdAt} where id = $1`, [sub]);
  }
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.sessions (user_id) values ($1) returning id`,
    [sub],
  );
  return { sub, email: mail, session_id: rows[0]!.id };
}

type Figure = number;
interface Figures {
  active_students: Figure;
  new_students: Figure;
  anki_answers: Figure;
  new_cards: Figure;
  rounds_started: Figure;
  rounds_finished: Figure;
}
interface Usage {
  today: string;
  totals: { today: Figures; last_7: Figures; last_30: Figures };
  days: (Figures & { day: string })[];
  weeks: (Figures & { week: string })[];
  decks: { deck_id: string; students: number; answers: number; new_cards: Figure }[];
  quizzes: {
    quiz_id: string;
    students: number;
    rounds_started: Figure;
    rounds_finished: Figure;
  }[];
  courses: { course_id: string; students: number; anki_answers: Figure }[];
  assessments: { assessment_id: string; course_id: string; students: number }[];
  invited: { signed_in: Figure; never: Figure };
  activation: {
    eligible: Figure;
    activated: Figure;
    not_activated: Figure;
    percent: number | null;
  };
}

const usage = (db: PGlite, c: Claims | null, p: unknown = {}) =>
  asUser(
    db,
    c,
    async (tx) =>
      (
        await tx.query<{ r: Usage }>('select public.admin_usage($1::jsonb) as r', [
          JSON.stringify(p),
        ])
      ).rows[0]!.r,
  );

/** The site's day (Santiago, from 4:00), `back` days ago. */
const siteDay = async (db: PGlite, back = 0) =>
  (
    await db.query<{ d: string }>(
      `select to_char(public.site_day(now()) - $1::integer, 'YYYY-MM-DD') as d`,
      [back],
    )
  ).rows[0]!.d;

/** A day of Anki of a student: what study_days keeps (the trigger of review_log writes it in the site). */
const studied = (db: PGlite, who: Claims, day: string, deck: string, answers = 10, newSeen = 3) =>
  db.query(
    `insert into public.study_days (user_id, day, deck_id, answers, new_seen) values ($1, $2, $3, $4, $5)`,
    [who.sub, day, deck, answers, newSeen],
  );

async function round(db: PGlite, who: Claims, quiz: string, finished = false) {
  const id = crypto.randomUUID();
  await db.query(
    `insert into public.quiz_rounds (id, user_id, quiz_id, section_id, origin, question_count, shuffled,
       shuffle_options, answered, correct, status, started_at, finished_at)
     values ($1, $2, $3, 's1', 'cover', 10, false, false, 1, 1, $4, now(), $5)`,
    [
      id,
      who.sub,
      quiz,
      finished ? 'finished' : 'active',
      finished ? new Date().toISOString() : null,
    ],
  );
  return id;
}

function walk(v: unknown, keys: string[] = [], texts: string[] = []) {
  if (Array.isArray(v)) v.forEach((x) => walk(x, keys, texts));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      keys.push(k);
      walk(x, keys, texts);
    }
  } else if (typeof v === 'string') texts.push(v);
  return { keys, texts };
}

describe('who can call it', () => {
  let db: PGlite;
  let owner: Claims;
  let student: Claims;
  beforeAll(async () => {
    db = await createDatabase('users');
    owner = await person(db, { email: OWNER_EMAIL });
    student = await person(db);
  });

  it('an administrator gets the figures', async () => {
    const r = await usage(db, owner);
    expect(r).not.toHaveProperty('min_students');
    expect(r.days).toHaveLength(30);
    expect(r.weeks).toHaveLength(12);
    expect(r.days.at(-1)!.day).toBe(await siteDay(db));
  });

  it('a student gets admin_only, and without a session it cannot even be called', async () => {
    await expect(usage(db, student)).rejects.toThrow(/admin_only/);
    await expect(usage(db, null)).rejects.toThrow(/permission denied/);
  });

  it('an administrator whose session was closed gets session_closed', async () => {
    await expect(usage(db, { sub: owner.sub, email: owner.email })).rejects.toThrow(
      /session_closed/,
    );
  });

  it('a groups map without its shape is refused', async () => {
    await expect(usage(db, owner, { decks: [] })).rejects.toThrow(/objects/);
    await expect(usage(db, owner, { decks: { abc: ['1', null, null] } })).rejects.toThrow(/unit/);
    await expect(usage(db, owner, { decks: { '1': ['2'] } })).rejects.toThrow(/unit/);
    await expect(usage(db, owner, { quizzes: { 'Mal Id': [null, null] } })).rejects.toThrow(/unit/);
    await expect(usage(db, owner, [])).rejects.toThrow(/expected/);
  });

  it('the helpers are not callable through the API, and the threshold ones are gone', async () => {
    await expect(
      asUser(db, student, (tx) => tx.query('select public.site_day(now())')),
    ).rejects.toThrow(/permission denied/);
    const { rows } = await db.query(
      `select 1 from pg_proc where proname in ('usage_students', 'usage_figure')`,
    );
    expect(rows).toEqual([]);
  });
});

describe('exact figures from 0 up', () => {
  let db: PGlite;
  let owner: Claims;
  const students: Claims[] = [];
  const DECK = '1001';
  const OTHER = '1002';
  const groups = {
    decks: {
      [DECK]: ['900', 'ramo/certamen-1', 'ramo'],
      [OTHER]: ['901', 'ramo/certamen-1', 'ramo'],
    },
    quizzes: { 'test-de-prueba': ['ramo/certamen-1', 'ramo'] },
  };
  beforeAll(async () => {
    db = await createDatabase('users');
    owner = await person(db, { email: OWNER_EMAIL, createdAt: `now() - interval '60 days'` });
    for (let i = 0; i < 5; i++) {
      students.push(await person(db, { createdAt: `now() - interval '60 days'` }));
    }
  });

  it('nobody: zeros, and empty lists', async () => {
    const r = await usage(db, owner, groups);
    expect(r.totals.today).toEqual({
      active_students: 0,
      new_students: 0,
      anki_answers: 0,
      new_cards: 0,
      rounds_started: 0,
      rounds_finished: 0,
    });
    expect([r.decks, r.quizzes, r.courses, r.assessments]).toEqual([[], [], [], []]);
  });

  it('1 student: the count and what they did are exact, and the lists have them', async () => {
    const today = await siteDay(db);
    await studied(db, students[0]!, today, DECK);
    await round(db, students[0]!, 'test-de-prueba', true);
    const r = await usage(db, owner, groups);
    for (const f of [r.totals.today, r.totals.last_7, r.totals.last_30, r.days.at(-1)!]) {
      expect(f).toMatchObject({
        active_students: 1,
        anki_answers: 10,
        new_cards: 3,
        rounds_started: 1,
        rounds_finished: 1,
        new_students: 0,
      });
    }
    expect(r.weeks.at(-1)!.active_students).toBe(1);
    expect(r.days[0]!.active_students).toBe(0);
    expect(r.decks).toEqual([{ deck_id: '900', students: 1, answers: 10, new_cards: 3 }]);
    expect(r.quizzes).toEqual([
      { quiz_id: 'test-de-prueba', students: 1, rounds_started: 1, rounds_finished: 1 },
    ]);
    expect(r.courses.map((c) => [c.course_id, c.students, c.anki_answers])).toEqual([
      ['ramo', 1, 10],
    ]);
    expect(r.assessments.map((a) => [a.assessment_id, a.course_id, a.students])).toEqual([
      ['ramo/certamen-1', 'ramo', 1],
    ]);
  });

  it('2, 3 and 4 students are counted one by one', async () => {
    const today = await siteDay(db);
    for (const [i, s] of students.slice(1, 4).entries()) {
      await studied(db, s, today, DECK);
      await round(db, s, 'test-de-prueba', i === 0);
      const r = await usage(db, owner, groups);
      expect(r.totals.today.active_students).toBe(i + 2);
      expect(r.totals.today.anki_answers).toBe(10 * (i + 2));
      expect(r.totals.today.rounds_started).toBe(i + 2);
      expect(r.totals.today.rounds_finished).toBe(2);
      expect(r.decks[0]!.students).toBe(i + 2);
    }
  });

  it('a deck that only one student opened is in the list too, after the most used', async () => {
    const today = await siteDay(db);
    await studied(db, students[4]!, today, OTHER, 7, 0);
    await round(db, students[4]!, 'test-de-prueba', true);
    const r = await usage(db, owner, groups);
    expect(r.totals.today).toEqual({
      active_students: 5,
      new_students: 0,
      anki_answers: 47,
      new_cards: 12,
      rounds_started: 5,
      rounds_finished: 3,
    });
    expect(r.decks).toEqual([
      { deck_id: '900', students: 4, answers: 40, new_cards: 12 },
      { deck_id: '901', students: 1, answers: 7, new_cards: 0 },
    ]);
    expect(r.courses).toEqual([
      {
        course_id: 'ramo',
        students: 5,
        anki_answers: 47,
        new_cards: 12,
        rounds_started: 5,
        rounds_finished: 3,
      },
    ]);
  });

  it('the answer has no id, email or name of anybody', async () => {
    await db.query(`update public.profiles set name = 'Ana Prueba' where id = $1`, [
      students[0]!.sub,
    ]);
    const r = await usage(db, owner, groups);
    const { keys, texts } = walk(r);
    for (const k of keys) expect(k).not.toMatch(/user|email|name|sub\b/);
    const theirs = [owner, ...students].flatMap((s) => [s.sub, s.email]).concat('Ana Prueba');
    for (const t of texts) {
      for (const x of theirs) expect(t).not.toContain(x);
      expect(t).not.toContain('@');
    }
  });

  it('the invited who signed in and those who never did, exact', async () => {
    const before = (await usage(db, owner)).invited;
    expect(before.signed_in).toBe(6);
    await db.query(
      `insert into public.invited_emails (email, list) values ('nunca.0@ug.uchile.cl', 'Curso de prueba')`,
    );
    expect((await usage(db, owner)).invited).toEqual({ signed_in: 6, never: before.never + 1 });
  });
});

describe('activation: the accounts that answered within their first 7 days', () => {
  let db: PGlite;
  let owner: Claims;
  beforeAll(async () => {
    db = await createDatabase('users');
    owner = await person(db, { email: OWNER_EMAIL });
  });

  const answered = (who: Claims, at: string) =>
    db.query(
      `insert into public.review_log (user_id, action, note_guid, ord, deck_id, reviewed_at, rating, queue_before,
         phase_before, phase_after)
       values ($1, 'answer', 'g1', 0, '1001', ${at}, 3, 'new', 'new', 'learning')`,
      [who.sub],
    );
  async function answeredTest(who: Claims, at: string) {
    const id = crypto.randomUUID();
    await db.query(
      `insert into public.quiz_rounds (id, user_id, quiz_id, section_id, origin, question_count, shuffled,
         shuffle_options, started_at)
       values ($1, $2, 'test-de-prueba', 's1', 'cover', 5, false, false, ${at})`,
      [id, who.sub],
    );
    await db.query(
      `insert into public.quiz_answers (user_id, round_id, quiz_id, section_id, question_id, position, correct,
         answered_at)
       values ($1, $2, 'test-de-prueba', 's1', 'p1', 0, true, ${at})`,
      [who.sub, id],
    );
  }

  it('counts the accounts of 7 days or more that answered within 7 days, at the edges', async () => {
    // A fixed moment (now() moves between the statements).
    const created = `timestamptz '${new Date(Date.now() - 20 * 86_400_000).toISOString()}'`;
    for (let i = 0; i < 5; i++) {
      const s = await person(db, { createdAt: created });
      const at =
        i === 0
          ? `${created} + interval '7 days'`
          : `${created} + interval '7 days' - interval '1 minute'`;
      if (i % 2) await answeredTest(s, at);
      else await answered(s, at);
    }
    for (let i = 0; i < 5; i++) {
      const s = await person(db, { createdAt: created });
      if (i < 3) await answered(s, `${created} + interval '7 days' + interval '1 minute'`);
      else if (i === 3) await answeredTest(s, `${created} + interval '8 days'`);
    }
    for (let i = 0; i < 3; i++) {
      const s = await person(db, {
        createdAt: `now() - interval '7 days' + interval '1 minute'`,
      });
      await answered(s, `now() - interval '6 days'`);
    }
    await person(db, { createdAt: `now() - interval '7 days' - interval '1 second'` });

    const r = await usage(db, owner);
    expect(r.activation).toEqual({
      eligible: 11,
      activated: 5,
      not_activated: 6,
      percent: 45,
    });
  });

  it('with 1 to 4 students in a part, both parts and the percent are exact', async () => {
    const fresh = await createDatabase('users');
    const admin = await person(fresh, { email: OWNER_EMAIL });
    expect((await usage(fresh, admin)).activation).toEqual({
      eligible: 0,
      activated: 0,
      not_activated: 0,
      percent: null,
    });
    const created = `timestamptz '${new Date(Date.now() - 10 * 86_400_000).toISOString()}'`;
    await fresh.query(
      `insert into public.review_log (user_id, action, note_guid, ord, deck_id, reviewed_at, rating, queue_before,
         phase_before, phase_after)
       values ($1, 'answer', 'g1', 0, '1001', ${created} + interval '1 day', 3, 'new', 'new', 'learning')`,
      [(await person(fresh, { createdAt: created })).sub],
    );
    for (let i = 0; i < 2; i++) await person(fresh, { createdAt: created });
    expect((await usage(fresh, admin)).activation).toEqual({
      eligible: 3,
      activated: 1,
      not_activated: 2,
      percent: 33,
    });
  });
});
