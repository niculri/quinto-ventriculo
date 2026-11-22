// The in-memory error reports repository against the users database: the same reports, resolutions and blocks on both,
// the SQL through the Supabase adapter. The demo's only person is an administrator who also reports.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { createDatabase, OWNER_EMAIL } from '@qv/db/testing';
import { fakeSupabase, signIn } from '@qv/db/postgrest';
import type { Person } from '@qv/db/postgrest';
import { REPORT_LIMITS } from '@qv/schema';
import { MyReport, ReportQueue } from '@qv/schema/user';
import { beforeEach, describe, expect, it } from 'vitest';
import { DATABASE_TIMEOUT, onBoth } from '../../../../../test/contract';
import { localReportsRepository } from '../memory';
import type { NewReport } from '../model';
import type { ReportsRepository } from '../port';
import { supabaseReportsRepository } from '../supabase';

type PGlite = Awaited<ReturnType<typeof createDatabase>>;
let db: PGlite;
let owner: Person;

beforeEach(async () => {
  db = await createDatabase('users');
  owner = await signIn(db, OWNER_EMAIL, { invited: false });
}, DATABASE_TIMEOUT);

function pair(who: Person, admin: boolean) {
  const rest = fakeSupabase(db, () => who);
  return {
    sql: supabaseReportsRepository(createClient<Database>(rest.url, rest.key, rest.options)),
    memory: localReportsRepository({ admin, email: who.email }),
    who,
  };
}

/** The reporter is the person in the database and the demo's one in memory: only whether they are blocked counts. */
const blockedOnly = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(blockedOnly)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v).map(([k, x]) =>
            k === 'reporter' && x
              ? [k, { blocked: (x as { blocked: boolean }).blocked }]
              : [k, blockedOnly(x)],
          ),
        )
      : v;

const card = (over: Partial<NewReport> = {}): NewReport => ({
  kind: 'card',
  id: 'gUiD:1',
  code: ' T-XX-01-001 ',
  version: 2,
  location: {
    deckId: '12',
    path: '/semesters/1/anki',
    title: 'Mazo',
    section: 'no va en una tarjeta',
  },
  category: 'fact',
  comment: '  Dice otra cosa\n',
  ...over,
});
const note = (exact: string, over: Partial<NewReport> = {}): NewReport => ({
  kind: 'note',
  id: 'nota-1',
  code: '',
  version: null,
  location: { section: 's1', quote: { exact, prefix: 'p'.repeat(150), suffix: 's'.repeat(150) } },
  category: 'text',
  comment: 'Falta una palabra',
  ...over,
});

describe('sending and reading', () => {
  it('what is kept of a report and its place: known keys, lengths, the quote with its spaces as one', async () => {
    const { sql, memory } = pair(owner, true);
    const got = await onBoth(
      sql,
      memory,
      [
        (r) => r.send(card()),
        (r) => r.send(card({ code: null, location: { title: 'Otro', deckId: '9'.repeat(30) } })),
        (r) => r.send(note(`  una   frase\nlarga ${'x'.repeat(600)} `)),
        (r) => r.send(note('', { location: { title: 'Sin lugar' } })),
        (r) =>
          r.send({
            kind: 'quiz_question',
            id: 'test/pregunta-3',
            code: null,
            version: null,
            location: { quizId: 'test', sectionId: 'a', number: 3, deckId: '1' },
            category: 'answer_key',
            comment: 'La clave está mal',
          }),
        (r) => r.mine(),
        (r) => r.queue(),
      ],
      blockedOnly,
    );
    expect(got.memory).toEqual(got.sql);
  });

  it(`the place of a note: the same words are the same place; at most ${REPORT_LIMITS.openPerPlace} open in it`, async () => {
    const { sql, memory } = pair(owner, true);
    const steps: ((r: ReportsRepository) => Promise<unknown>)[] = [];
    for (let i = 0; i <= REPORT_LIMITS.openPerPlace; i++) {
      steps.push((r) => r.send(note(i % 2 ? 'una  frase' : ' una frase ')));
    }
    // Another section is another place; a quote longer than 500 is the same place as its first 500 characters.
    steps.push((r) =>
      r.send(note('una frase', { location: { section: 's2', quote: { exact: 'una frase' } } })),
    );
    steps.push((r) => r.send(note(`${'y'.repeat(500)}a`)));
    steps.push((r) => r.send(note(`${'y'.repeat(500)}b`)));
    const got = await onBoth(sql, memory, steps, blockedOnly);
    expect(got.memory).toEqual(got.sql);
  });

  it(`at most ${REPORT_LIMITS.perDay} a day`, async () => {
    const { sql, memory } = pair(owner, true);
    const steps = Array.from(
      { length: REPORT_LIMITS.perDay + 1 },
      (_, i) => (r: ReportsRepository) => r.send(card({ id: `g${i}:0` })),
    );
    const got = await onBoth(sql, memory, steps);
    expect(got.memory).toEqual(got.sql);
    expect(got.sql).toContainEqual({ error: expect.stringContaining('máximo por día') as unknown });
  });
});

describe('resolving and blocking', () => {
  it('resolve closes what is open of the content; reopen; nothing open; the note', async () => {
    const { sql, memory } = pair(owner, true);
    const got = await onBoth(
      sql,
      memory,
      [
        (r) => r.send(card()),
        (r) => r.send(card({ location: { deckId: '13' } })),
        (r) =>
          r.resolve({
            kind: 'card',
            targetId: 'gUiD:1',
            status: 'fixed',
            note: '  Corregida ',
            fixedVersion: 3,
          }),
        (r) =>
          r.resolve({
            kind: 'card',
            targetId: 'gUiD:1',
            status: 'fixed',
            note: null,
            fixedVersion: 3,
          }),
        (r) => r.send(card()),
        (r) =>
          r.resolve({
            kind: 'card',
            targetId: 'gUiD:1',
            status: 'wont_fix',
            note: 'n'.repeat(501),
            fixedVersion: null,
          }),
        (r) =>
          r.resolve({
            kind: 'card',
            targetId: 'gUiD:1',
            status: 'not_an_error',
            note: '   ',
            fixedVersion: 4,
          }),
        async (r) => {
          const q = await r.queue();
          await r.reopen(q.resolved.at(-1)!.resolution!.id);
          return r.queue();
        },
        (r) => r.reopen('00000000-0000-4000-8000-000000000000'),
        (r) => r.mine(),
      ],
      blockedOnly,
    );
    expect(got.memory).toEqual(got.sql);
  });

  it('an administrator is never blocked; a student does not use the panel', async () => {
    const student = await signIn(db, 'alumna@ug.uchile.cl');
    for (const { sql, memory, who } of [pair(owner, true), pair(student, false)]) {
      const got = await onBoth(
        sql,
        memory,
        [
          (r) => r.setBlocked(who.sub, true),
          (r) => r.send(card()),
          (r) => r.setBlocked(who.sub, false),
          (r) => r.queue(),
          (r) =>
            r.resolve({
              kind: 'card',
              targetId: 'gUiD:1',
              status: 'fixed',
              note: null,
              fixedVersion: null,
            }),
        ],
        blockedOnly,
      );
      expect(got.memory).toEqual(got.sql);
      for (const side of [got.raw.sql, got.raw.memory]) {
        if (side[3]) expect(ReportQueue.parse(side[3])).toBeTruthy();
      }
    }
    const mine = await onBoth(pair(owner, true).sql, pair(owner, true).memory, [(r) => r.mine()]);
    expect(MyReport.array().parse(mine.raw.sql[0])).toBeTruthy();
  });
});
