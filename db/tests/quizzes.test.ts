import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { QuizDetail, QuizSectionDetail } from '@qv/schema';
import { asUser, createDatabase } from './pglite';

// ───────────────────────────── content database ─────────────────────────────

describe('practice tests in the content database', () => {
  let db: PGlite;
  const asService = <T>(fn: (tx: Pick<PGlite, 'query'>) => Promise<T>) =>
    db.transaction(async (tx) => {
      await tx.exec('set local role service_role');
      return fn(tx);
    });

  const question = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
    id,
    kind: 'choice',
    prompt: text,
    options: ['a', 'b'],
    correct: 1,
    figures: [],
    figureBeside: false,
    fixedOrder: false,
    ...extra,
  });
  const colors = (c: string) =>
    Object.fromEntries(
      ['ac', 'ac-b', 'ac2', 'ac2-b', 'on-ac', 'g1', 'g2', 'g3'].map((k) => [k, c]),
    );
  const theme = { light: colors('#1F6F75'), dark: colors('#6CC3C8') };
  const quiz = (hash: string, title = 'Práctica') => ({
    id: 'practica-biocel',
    slug: 'practica',
    courseId: 'biologia-celular',
    assessmentId: 'biologia-celular/certamen-2',
    title,
    position: 1,
    questionCount: 4,
    sectionCount: 2,
    kicker: 'Certamen 2',
    heading: 'Practica',
    footer: '',
    theme,
    sections: [
      {
        id: 'pautas',
        name: 'Pautas',
        label: 'Pauta original',
        description: 'Las 3 preguntas',
        groupsTitle: 'Qué temas practicar',
        questionCount: 3,
        hasChoices: true,
        groups: [
          {
            id: '01',
            name: 'Uno',
            topic: 'Tema',
            questions: [question('D-p01-03', '¿Uno?'), question('D-p02-04', '¿Dos?')],
          },
          {
            id: '02',
            name: 'Dos',
            questions: [
              question('A-p04-36', '¿Tres?', {
                figures: [
                  {
                    kind: 'image',
                    media: 'tests/0123456789abcdef0123456789abcdef.webp',
                    width: 10,
                    height: 10,
                    alt: 'x',
                  },
                ],
              }),
            ],
          },
        ],
      },
      {
        id: 'nuevas',
        name: 'Nuevas',
        description: '1 pregunta',
        groupsTitle: 'Qué clases',
        questionCount: 1,
        hasChoices: false,
        groups: [
          {
            id: '01',
            name: 'Uno',
            questions: [
              {
                id: 'N01-01',
                kind: 'short',
                prompt: '¿Cuatro?',
                answer: 'Sí',
                figures: [],
                figureBeside: false,
              },
            ],
          },
        ],
      },
    ],
    hash,
  });

  beforeAll(async () => {
    db = await createDatabase('content');
    await db.exec(`
      insert into semesters values (2, '2° Semestre');
      insert into courses values ('biologia-celular', 2, 'Biología celular', '🧬', 1);
      insert into assessments values ('biologia-celular/certamen-2', 'biologia-celular', 'Certamen 2', 2);
    `);
  });

  const save = (q: unknown) =>
    asService(
      async (tx) =>
        (await tx.query<{ r: boolean }>('select public.save_quiz($1) as r', [q])).rows[0]!.r,
    );

  it('saves a test with its questions in order, once per hash', async () => {
    expect(await save(quiz('h1'))).toBe(true);
    expect(await save(quiz('h1', 'Otro título'))).toBe(false);
    const rows = await asService(
      async (tx) =>
        (
          await tx.query<{ id: string; section_id: string; group_id: string; position: number }>(
            'select id, section_id, group_id, position from public.quiz_questions order by position',
          )
        ).rows,
    );
    expect(rows).toEqual([
      { id: 'D-p01-03', section_id: 'pautas', group_id: '01', position: 0 },
      { id: 'D-p02-04', section_id: 'pautas', group_id: '01', position: 1 },
      { id: 'A-p04-36', section_id: 'pautas', group_id: '02', position: 2 },
      { id: 'N01-01', section_id: 'nuevas', group_id: '01', position: 3 },
    ]);
  });

  it('the test in the API’s shape, without its questions', async () => {
    const r = await asService(
      async (tx) =>
        (await tx.query<{ r: unknown }>('select public.quiz_detail($1) as r', ['practica-biocel']))
          .rows[0]!.r,
    );
    const detail = QuizDetail.parse(r);
    expect(detail).toMatchObject({
      id: 'practica-biocel',
      title: 'Práctica',
      questionCount: 4,
      sectionCount: 2,
    });
    expect(detail.sections.map((s) => s.groups.map((g) => [g.id, g.questionCount]))).toEqual([
      [
        ['01', 2],
        ['02', 1],
      ],
      [['01', 1]],
    ]);
    expect(JSON.stringify(r)).not.toContain('¿Uno?');
    const none = await asService(
      async (tx) =>
        (await tx.query<{ r: unknown }>('select public.quiz_detail($1) as r', ['nope'])).rows[0]!.r,
    );
    expect(none).toBeNull();
  });

  it('a section in the API’s shape: its groups with their questions, in order', async () => {
    const get = (slug: string, section: string) =>
      asService(
        async (tx) =>
          (
            await tx.query<{ r: unknown }>('select public.quiz_section($1, $2) as r', [
              slug,
              section,
            ])
          ).rows[0]?.r ?? null,
      );
    const s = QuizSectionDetail.parse(await get('practica-biocel', 'pautas'));
    expect(s.quizId).toBe('practica-biocel');
    expect(s.groups.map((g) => [g.id, g.name, g.topic, g.questions.map((q) => q.id)])).toEqual([
      ['01', 'Uno', 'Tema', ['D-p01-03', 'D-p02-04']],
      ['02', 'Dos', undefined, ['A-p04-36']],
    ]);
    const n = QuizSectionDetail.parse(await get('practica-biocel', 'nuevas'));
    expect(n.groups[0]!.questions[0]).toMatchObject({ kind: 'short', answer: 'Sí' });
    expect(await get('practica-biocel', 'nope')).toBeNull();
    expect(await get('nope', 'pautas')).toBeNull();
  });

  it('a slug is unique in its assessment, not on the whole site', async () => {
    await asService((tx) =>
      tx.query(
        `insert into public.assessments values ('biologia-celular/certamen-3', 'biologia-celular', 'Certamen 3', 3)`,
      ),
    );
    const other = { ...quiz('h9'), id: 'practica-c3', assessmentId: 'biologia-celular/certamen-3' };
    expect(await save(other)).toBe(true);
    await expect(save({ ...quiz('h9'), id: 'practica-otra' })).rejects.toThrow(/duplicate key/);
    await asService((tx) =>
      tx.query('select public.prune_quizzes($1)', [JSON.stringify(['practica-biocel'])]),
    );
  });

  it('a new version rewrites the questions; their ids stay', async () => {
    const v2 = quiz('h2');
    v2.sections[0]!.groups[0]!.questions[0]!.prompt = '¿Uno, corregida?';
    v2.sections[0]!.groups[0]!.questions.reverse();
    expect(await save(v2)).toBe(true);
    const rows = await asService(
      async (tx) =>
        (
          await tx.query<{ id: string; prompt: string }>(
            "select id, document ->> 'prompt' as prompt from public.quiz_questions where section_id = 'pautas' order by position",
          )
        ).rows,
    );
    expect(rows).toEqual([
      { id: 'D-p02-04', prompt: '¿Dos?' },
      { id: 'D-p01-03', prompt: '¿Uno, corregida?' },
      { id: 'A-p04-36', prompt: '¿Tres?' },
    ]);
  });

  it('a test that leaves the manifest goes, with its questions', async () => {
    const removed = await asService(
      async (tx) =>
        (
          await tx.query<{ r: number }>('select public.prune_quizzes($1) as r', [
            JSON.stringify(['practica-biocel']),
          ])
        ).rows[0]!.r,
    );
    expect(removed).toBe(0);
    // Without the list (null, an object): refused, nothing goes.
    for (const keep of [null, '{}']) {
      await expect(
        asService((tx) => tx.query('select public.prune_quizzes($1)', [keep])),
      ).rejects.toThrow(/keep needs the array/);
    }
    const gone = await asService(
      async (tx) =>
        (await tx.query<{ r: number }>('select public.prune_quizzes($1) as r', ['[]'])).rows[0]!.r,
    );
    expect(gone).toBe(1);
    const left = await asService(
      async (tx) => (await tx.query('select * from public.quiz_questions')).rows,
    );
    expect(left).toEqual([]);
  });

  it('nobody but the service reads or writes them', async () => {
    await save(quiz('h3'));
    for (const claims of [
      null,
      { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' },
    ]) {
      await expect(
        asUser(db, claims, (tx) => tx.query('select * from public.quizzes')),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(db, claims, (tx) => tx.query('select * from public.quiz_questions')),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(db, claims, (tx) =>
          tx.query("select public.quiz_section('practica-biocel', 'pautas')"),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(db, claims, (tx) => tx.query("select public.quiz_detail('practica-biocel')")),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(db, claims, (tx) => tx.query('select public.save_quiz($1)', [quiz('h4')])),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(db, claims, (tx) => tx.query("select public.prune_quizzes('[]')")),
      ).rejects.toThrow(/permission denied/);
    }
  });
});

// ───────────────────────────── users database ─────────────────────────────

describe('each user’s rounds in the users database', () => {
  let db: PGlite;
  const ANA = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
  const BETO = { sub: '00000000-0000-4000-8000-00000000000b', email: 'beto@ug.uchile.cl' };
  const INTRUDER = { sub: '00000000-0000-4000-8000-00000000000c', email: 'colado@gmail.com' };
  const R1 = '11111111-1111-4111-8111-111111111111';
  const R2 = '22222222-2222-4222-8222-222222222222';

  beforeAll(async () => {
    db = await createDatabase('users');
    await db.query('update public.access_settings set open_to_domain = true');
    for (const u of [ANA, BETO, INTRUDER]) {
      await db.query(`insert into auth.users (id, email) values ($1, $2)`, [u.sub, u.email]);
    }
  });

  const round = (id: string, extra: Record<string, unknown> = {}) => ({
    version: 1,
    id,
    queue: ['D-p01-03', 'D-p02-04', 'A-p04-36'],
    index: 0,
    top: 0,
    shuffled: false,
    shuffleOptions: false,
    orders: [null, null, null],
    answers: [],
    screen: 'question',
    finished: false,
    startedAt: '2026-11-01T12:00:00.000Z',
    ...extra,
  });
  const info = (id: string, finished = false, origin = 'cover') => ({
    id,
    origin,
    questionCount: 3,
    shuffled: false,
    shuffleOptions: false,
    startedAt: '2026-11-01T12:00:00.000Z',
    finished,
  });
  const step = (who: typeof ANA, p: Record<string, unknown>) =>
    asUser(db, who, (tx) =>
      tx.query('select public.save_quiz_progress($1)', [
        { quizId: 'practica-biocel', sectionId: 'pautas', ...p },
      ]),
    );
  const rows = <T>(who: typeof ANA | null, sql: string) =>
    asUser(db, who, async (tx) => (await tx.query<T>(sql)).rows);

  it('starting, answering and finishing a round', async () => {
    await step(ANA, {
      preferences: { groups: ['01'], shuffle: false, shuffleOptions: true },
      round: round(R1),
      roundInfo: info(R1),
    });
    await step(ANA, {
      round: round(R1, {
        answers: [{ position: 0, questionId: 'D-p01-03', chosen: 1, correct: true }],
      }),
      roundInfo: info(R1),
      answer: {
        roundId: R1,
        questionId: 'D-p01-03',
        position: 0,
        chosen: 1,
        correct: true,
        answeredAt: '2026-11-01T12:00:05Z',
      },
    });
    // The same answer again (a retry, another tab): saved once.
    await step(ANA, {
      round: round(R1),
      roundInfo: info(R1),
      answer: { roundId: R1, questionId: 'D-p01-03', position: 0, chosen: 0, correct: false },
    });
    await step(ANA, {
      round: round(R1, { index: 1, top: 1 }),
      roundInfo: info(R1),
      answer: { roundId: R1, questionId: 'D-p02-04', position: 1, chosen: 0, correct: false },
    });
    await step(ANA, {
      round: round(R1, { screen: 'results', finished: true }),
      roundInfo: info(R1, true),
    });

    const [r] = await rows<{
      status: string;
      answered: number;
      correct: number;
      finished: boolean;
    }>(
      ANA,
      'select status, answered, correct, finished_at is not null as finished from public.quiz_rounds',
    );
    expect(r).toEqual({ status: 'finished', answered: 2, correct: 1, finished: true });
    const answers = await rows(
      ANA,
      'select question_id, position, chosen, correct from public.quiz_answers order by position',
    );
    expect(answers).toEqual([
      { question_id: 'D-p01-03', position: 0, chosen: 1, correct: true },
      { question_id: 'D-p02-04', position: 1, chosen: 0, correct: false },
    ]);
    const [progress] = await rows<{ preferences: unknown; screen: string }>(
      ANA,
      "select preferences, round ->> 'screen' as screen from public.quiz_progress",
    );
    // A step without preferences keeps the saved ones.
    expect(progress).toEqual({
      preferences: { groups: ['01'], shuffle: false, shuffleOptions: true },
      screen: 'results',
    });
  });

  it('a round replaced or discarded before finishing is abandoned; a finished one stays finished', async () => {
    await step(ANA, { round: round(R2), roundInfo: info(R2, false, 'repeat_wrong') });
    const R3 = '33333333-3333-4333-8333-333333333333';
    await step(ANA, { round: round(R3), roundInfo: info(R3, false, 'restart') });
    await step(ANA, { round: null });
    const all = await rows(
      ANA,
      'select id, origin, status from public.quiz_rounds order by started_at, origin',
    );
    expect(all).toEqual(
      expect.arrayContaining([
        { id: R1, origin: 'cover', status: 'finished' },
        { id: R2, origin: 'repeat_wrong', status: 'abandoned' },
        { id: R3, origin: 'restart', status: 'abandoned' },
      ]),
    );
    const [p] = await rows<{ round: unknown }>(ANA, 'select round from public.quiz_progress');
    expect(p!.round).toBeNull();
  });

  it('each user sees and changes only their own', async () => {
    await step(BETO, { round: round(R1), roundInfo: info(R1) });
    expect(await rows(BETO, 'select status from public.quiz_rounds')).toEqual([
      { status: 'active' },
    ]);
    expect(await rows(BETO, 'select * from public.quiz_answers')).toEqual([]);
    expect(
      await rows<{ n: number }>(ANA, 'select count(*)::int as n from public.quiz_rounds'),
    ).toEqual([{ n: 3 }]);
    // Beto deletes everything he can: Ana's stays.
    await asUser(db, BETO, (tx) => tx.query('delete from public.quiz_rounds'));
    await asUser(db, BETO, (tx) => tx.query('delete from public.quiz_progress'));
    expect(
      await rows<{ n: number }>(ANA, 'select count(*)::int as n from public.quiz_rounds'),
    ).toEqual([{ n: 3 }]);
    expect(
      await rows<{ n: number }>(ANA, 'select count(*)::int as n from public.quiz_answers'),
    ).toEqual([{ n: 2 }]);
    // Nor can he write rows in her name.
    await expect(
      asUser(db, BETO, (tx) =>
        tx.query(
          `insert into public.quiz_progress (user_id, quiz_id, section_id) values ($1, 'x', 'y')`,
          [ANA.sub],
        ),
      ),
      // Since plan step 1.2 the tests are written only through save_quiz_progress().
    ).rejects.toThrow(/permission denied/);
  });

  it('nothing for an account outside @ug.uchile.cl, nor without signing in', async () => {
    await expect(step(INTRUDER, { round: round(R1), roundInfo: info(R1) })).rejects.toThrow(
      /not_allowed/,
    );
    expect(await rows(INTRUDER, 'select * from public.quiz_progress')).toEqual([]);
    await expect(
      asUser(db, null, (tx) => tx.query('select * from public.quiz_rounds')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, null, (tx) =>
        tx.query('select public.save_quiz_progress($1)', [
          { quizId: 'a', sectionId: 'b', round: null },
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('checks what is saved', async () => {
    await expect(step(ANA, { quizId: 'Con Espacios', round: null })).rejects.toThrow(
      /check constraint/,
    );
    await expect(
      step(ANA, {
        round: round(R1),
        roundInfo: info(R1),
        answer: { roundId: R1, questionId: 'x y', position: 2, chosen: 0, correct: true },
      }),
    ).rejects.toThrow(/check constraint/);
    await expect(
      step(ANA, {
        round: round(R1),
        roundInfo: info(R1),
        answer: { roundId: R1, questionId: 'A-1', position: 2, chosen: 9, correct: true },
      }),
    ).rejects.toThrow(/check constraint/);
    // An answer of a round that is not in the history.
    await expect(
      step(ANA, {
        round: null,
        answer: {
          roundId: '44444444-4444-4444-8444-444444444444',
          questionId: 'A-1',
          position: 0,
          chosen: 0,
          correct: true,
        },
      }),
    ).rejects.toThrow(/foreign key/);
  });

  it('deleting the account deletes its rounds', async () => {
    await db.query('delete from auth.users where id = $1', [ANA.sub]);
    const n = await db.query<{ n: number }>(
      'select (select count(*) from public.quiz_rounds)::int + (select count(*) from public.quiz_answers)::int + (select count(*) from public.quiz_progress)::int as n',
    );
    expect(n.rows[0]!.n).toBe(0);
  });
});
