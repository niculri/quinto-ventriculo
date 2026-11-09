import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { OWNER_EMAIL, asUser, createDatabase } from './pglite';

/**
 * Step 2.9: «Uso» in the administration panel (…_admin_usage.sql). Only an administrator with their session open calls
 * admin_usage(); a figure of 1 to 4 students goes as '<5' (and so does a figure made by 1 to 4 students), the lists only
 * have what 5 or more used, the activation counts the first answer within 7 days of the account, and nothing of the
 * answer names or identifies a student.
 */

type Claims = { sub: string; email: string; session_id?: string };

let n = 0;
/** A made-up invited student (or the owner) with an open session; their account was created `daysAgo` days ago. */
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

type Figure = number | '<5';
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
  min_students: number;
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
    activated: Figure | null;
    not_activated: Figure | null;
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

/** A round of a test, started (and finished, if so) now. */
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

/** Every key and every text of the answer, to look for anything of a student. */
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
    expect(r.min_students).toBe(5);
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

  it('the helpers are not callable through the API', async () => {
    for (const sql of [
      'select public.site_day(now())',
      `select public.usage_students(3)`,
      `select public.usage_figure(3, 3)`,
    ]) {
      await expect(asUser(db, student, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
  });
});

describe('fewer than 5 students', () => {
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
    // The owner's account is old and they did not study: it does not count among the active.
    owner = await person(db, { email: OWNER_EMAIL, createdAt: `now() - interval '60 days'` });
    for (let i = 0; i < 5; i++) {
      students.push(await person(db, { createdAt: `now() - interval '60 days'` }));
    }
  });

  it('4 students: their count and what they did go as «<5», and the lists leave them out', async () => {
    const today = await siteDay(db);
    for (const s of students.slice(0, 4)) {
      await studied(db, s, today, DECK);
      await round(db, s, 'test-de-prueba', true);
    }
    const r = await usage(db, owner, groups);
    for (const f of [r.totals.today, r.totals.last_7, r.totals.last_30, r.days.at(-1)!]) {
      expect(f.active_students).toBe('<5');
      expect(f.anki_answers).toBe('<5');
      expect(f.new_cards).toBe('<5');
      expect(f.rounds_started).toBe('<5');
      expect(f.rounds_finished).toBe('<5');
      // Nobody's account was created in these days: 0 is said as it is.
      expect(f.new_students).toBe(0);
    }
    expect(r.weeks.at(-1)!.active_students).toBe('<5');
    // A day nobody studied: 0.
    expect(r.days[0]!.active_students).toBe(0);
    expect(r.decks).toEqual([]);
    expect(r.quizzes).toEqual([]);
    expect(r.courses).toEqual([]);
    expect(r.assessments).toEqual([]);
  });

  it('with the 5th they are exact', async () => {
    const today = await siteDay(db);
    await studied(db, students[4]!, today, OTHER, 7, 0);
    await round(db, students[4]!, 'test-de-prueba', true);
    const r = await usage(db, owner, groups);
    expect(r.totals.today).toEqual({
      active_students: 5,
      new_students: 0,
      anki_answers: 47,
      // Only 4 students saw new cards: their sum stays hidden.
      new_cards: '<5',
      rounds_started: 5,
      rounds_finished: 5,
    });
    // The unit 900 has 4 students (hidden); the course and the assessment, 5 different ones across both decks.
    expect(r.decks).toEqual([]);
    expect(r.courses).toEqual([
      {
        course_id: 'ramo',
        students: 5,
        anki_answers: 47,
        new_cards: '<5',
        rounds_started: 5,
        rounds_finished: 5,
      },
    ]);
    expect(r.assessments.map((a) => [a.assessment_id, a.course_id, a.students])).toEqual([
      ['ramo/certamen-1', 'ramo', 5],
    ]);
    expect(r.quizzes).toEqual([
      { quiz_id: 'test-de-prueba', students: 5, rounds_started: 5, rounds_finished: 5 },
    ]);
  });

  it('a deck used by 5 students goes in the list of its unit', async () => {
    await studied(db, students[4]!, await siteDay(db, 1), DECK, 5, 5);
    const r = await usage(db, owner, groups);
    expect(r.decks).toEqual([{ deck_id: '900', students: 5, answers: 45, new_cards: 17 }]);
    // Yesterday only one studied: hidden; the last 7 days have the 5.
    expect(r.days.at(-2)!.anki_answers).toBe('<5');
    expect(r.totals.last_7.active_students).toBe(5);
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

  it('the invited who signed in and those who never did', async () => {
    let r = await usage(db, owner);
    // The owner and the 5 students have an account; the friend of the seeds never signed in.
    expect(r.invited).toEqual({ signed_in: 6, never: '<5' });
    for (let i = 0; i < 4; i++) {
      await db.query(
        `insert into public.invited_emails (email, list) values ($1, 'Curso de prueba')`,
        [`nunca.${i}@ug.uchile.cl`],
      );
    }
    r = await usage(db, owner);
    expect(r.invited).toEqual({ signed_in: 6, never: 5 });
  });
});

describe('activation (EXP-C8)', () => {
  let db: PGlite;
  let owner: Claims;
  beforeAll(async () => {
    db = await createDatabase('users');
    owner = await person(db, { email: OWNER_EMAIL });
  });

  /** A first answer of Anki (review_log; the trigger adds it to study_days) at `at`. */
  const answered = (who: Claims, at: string) =>
    db.query(
      `insert into public.review_log (user_id, action, note_guid, ord, deck_id, reviewed_at, rating, queue_before,
         phase_before, phase_after)
       values ($1, 'answer', 'g1', 0, '1001', ${at}, 3, 'new', 'new', 'learning')`,
      [who.sub],
    );
  /** A first answer of a test at `at`. */
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
    // Activated: the first answer one minute before the 7 days, or exactly at them (Anki or a test).
    for (let i = 0; i < 5; i++) {
      const s = await person(db, { createdAt: created });
      const at =
        i === 0
          ? `${created} + interval '7 days'`
          : `${created} + interval '7 days' - interval '1 minute'`;
      if (i % 2) await answeredTest(s, at);
      else await answered(s, at);
    }
    // Not activated: one minute after the 7 days, or never.
    for (let i = 0; i < 5; i++) {
      const s = await person(db, { createdAt: created });
      if (i < 3) await answered(s, `${created} + interval '7 days' + interval '1 minute'`);
      else if (i === 3) await answeredTest(s, `${created} + interval '8 days'`);
    }
    // Not eligible: their account has not had 7 days (one minute short), although they answered at once.
    for (let i = 0; i < 3; i++) {
      const s = await person(db, {
        createdAt: `now() - interval '7 days' + interval '1 minute'`,
      });
      await answered(s, `now() - interval '6 days'`);
    }
    // Exactly 7 days: eligible, and it never answered.
    await person(db, { createdAt: `now() - interval '7 days' - interval '1 second'` });

    const r = await usage(db, owner);
    expect(r.activation).toEqual({
      eligible: 11,
      activated: 5,
      not_activated: 6,
      percent: 45,
    });
  });

  it('a part of 1 to 4 students hides both parts and the percent (one would give the other by subtraction)', async () => {
    const fresh = await createDatabase('users');
    const admin = await person(fresh, { email: OWNER_EMAIL });
    const created = `timestamptz '${new Date(Date.now() - 10 * 86_400_000).toISOString()}'`;
    const firstAnswer = (who: Claims) =>
      fresh.query(
        `insert into public.review_log (user_id, action, note_guid, ord, deck_id, reviewed_at, rating, queue_before,
           phase_before, phase_after)
         values ($1, 'answer', 'g1', 0, '1001', ${created} + interval '1 day', 3, 'new', 'new', 'learning')`,
        [who.sub],
      );
    const accounts: Claims[] = [];
    for (let i = 0; i < 6; i++) accounts.push(await person(fresh, { createdAt: created }));
    const r = await usage(fresh, admin);
    expect(r.activation).toEqual({ eligible: 6, activated: 0, not_activated: 6, percent: 0 });
    // 1 activated and 6 not: «7 − 6» would say the 1.
    await firstAnswer(await person(fresh, { createdAt: created }));
    expect((await usage(fresh, admin)).activation).toEqual({
      eligible: 7,
      activated: null,
      not_activated: null,
      percent: null,
    });
    // 5 activated and 2 not: «7 − 5» would say the 2.
    for (const a of accounts.slice(0, 4)) await firstAnswer(a);
    expect((await usage(fresh, admin)).activation).toEqual({
      eligible: 7,
      activated: null,
      not_activated: null,
      percent: null,
    });
    // 5 and 5: both exact, and the percent.
    for (let i = 0; i < 3; i++) await person(fresh, { createdAt: created });
    expect((await usage(fresh, admin)).activation).toEqual({
      eligible: 10,
      activated: 5,
      not_activated: 5,
      percent: 50,
    });
  });
});
