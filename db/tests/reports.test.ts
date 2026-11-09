import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { REPORT_LIMITS } from '@qv/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { OWNER_EMAIL, applyMigration, asUser, createDatabase } from './pglite';

/**
 * Step 2.6: one model of reports (…_content_reports.sql). A student reports a card, a quote of an article or a
 * question of a test only through report_content(), within the limits; they read only theirs; the administrator sees
 * them grouped by content, resolves them all at once and blocks; a closed report loses its author after 12 months; and
 * card_reports is copied without losing a row (and what the web of before still writes there, too).
 */

type User = { sub: string; email: string };
type Claims = User & { session_id?: string };

const MIGRATION = '20261117000000_content_reports.sql';
const AFTER_DEPLOY = join(
  import.meta.dirname,
  '..',
  'users',
  'supabase',
  'after-deploy',
  '20261118000000_drop_card_reports.sql',
);

let n = 0;
/** A made-up invited student (or the owner), with an open session. */
async function person(db: PGlite, email?: string): Promise<Claims> {
  n += 1;
  const sub = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const mail = email ?? `alumno.${n}@ug.uchile.cl`;
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [sub, mail]);
  if (!email) {
    await db.query(
      `insert into public.invited_emails (email, list) values ($1, 'Curso de prueba')`,
      [mail],
    );
  }
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.sessions (user_id) values ($1) returning id`,
    [sub],
  );
  return { sub, email: mail, session_id: rows[0]!.id };
}

const call = <T = Record<string, unknown>>(
  db: PGlite,
  claims: Claims | null,
  sql: string,
  args: unknown[] = [],
) => asUser(db, claims, async (tx) => (await tx.query<{ r: T }>(sql, args)).rows[0]!.r);

const report = (db: PGlite, c: Claims | null, p: Record<string, unknown>) =>
  call<{ id: string }>(db, c, 'select public.report_content($1::jsonb) as r', [JSON.stringify(p)]);

const card = (comment = 'La respuesta dice 70S y es 80S.', id = 'g1:0') => ({
  kind: 'card',
  id,
  code: 'T-XX-C1-01-001',
  version: 2,
  category: 'fact',
  comment,
  location: { deckId: '1001', path: '/anki/browse?q=x', title: 'Tarjeta' },
});
const question = (q: string, comment = 'La clave está mal') => ({
  kind: 'quiz_question',
  id: `test-de-prueba/${q}`,
  category: 'answer_key',
  comment,
  location: { quizId: 'test-de-prueba', sectionId: 's1', number: 4, title: 'Test de prueba' },
});
const quote = (exact: string, comment = 'Falta un dato') => ({
  kind: 'note',
  id: 'AP-XX-C1-01',
  code: 'QV-XX-C1-01',
  version: 3,
  category: 'fact',
  comment,
  location: {
    path: '/semesters/1/courses/ramo/notes/apunte',
    title: 'Apunte de prueba',
    section: 'la-celula',
    sectionTitle: '1. La célula',
    quote: { exact, prefix: 'antes ', suffix: ' después' },
    extra: 'no se guarda',
  },
});

const queue = (db: PGlite, c: Claims | null) =>
  call<{
    open: {
      kind: string;
      target_id: string;
      reporters: number;
      reports: {
        id: string;
        comment: string;
        reporter: Record<string, unknown> | null;
      }[];
    }[];
    resolved: { target_id: string; resolution: { id: string; status: string } }[];
    blocked: { id: string }[];
    limits: { per_day: number; open_per_place: number };
  }>(db, c, 'select public.admin_report_queue() as r');
const resolve = (db: PGlite, c: Claims | null, p: Record<string, unknown>) =>
  call<{ resolution_id: string; resolved: number }>(
    db,
    c,
    'select public.admin_resolve_reports($1::jsonb) as r',
    [JSON.stringify(p)],
  );
const mine = (db: PGlite, c: Claims | null) =>
  call<
    {
      id: string;
      target_id: string;
      comment: string;
      resolution: { status: string; note: string | null; fixed_version: number | null } | null;
    }[]
  >(db, c, 'select public.my_reports() as r');

describe('reporting', () => {
  let db: PGlite;
  let owner: Claims;
  beforeAll(async () => {
    db = await createDatabase('users');
    owner = await person(db, OWNER_EMAIL);
  });

  it('the limits are the ones of REPORT_LIMITS (one place in the code for each number)', async () => {
    const r = await db.query<{ l: { per_day: number; open_per_place: number } }>(
      'select public.report_limits() as l',
    );
    expect(r.rows[0]!.l).toEqual({
      per_day: REPORT_LIMITS.perDay,
      open_per_place: REPORT_LIMITS.openPerPlace,
    });
    expect(REPORT_LIMITS).toEqual({ perDay: 50, openPerPlace: 5 });
  });

  it('a student reports a card, an article and a question, and sees only theirs', async () => {
    const ana = await person(db);
    const luis = await person(db);
    await report(db, ana, card());
    await report(db, ana, quote('El núcleo tiene dos membranas'));
    await report(db, ana, question('p1'));
    await report(db, luis, card('Otro error'));
    const rows = await asUser(db, ana, (tx) =>
      tx.query<{ target_kind: string }>(
        'select target_kind from public.content_reports order by 1',
      ),
    );
    expect(rows.rows.map((r) => r.target_kind)).toEqual(['card', 'note', 'quiz_question']);
    const list = await mine(db, ana);
    expect(list).toHaveLength(3);
    expect(list.every((r) => r.resolution === null)).toBe(true);
    expect(JSON.stringify(list)).not.toContain('Otro error');
  });

  it('keeps only the known keys of the place, cuts a long quote and computes the place itself', async () => {
    const ana = await person(db);
    await report(db, ana, quote('x'.repeat(800)));
    const r = await db.query<{ location: Record<string, unknown>; anchor_key: string }>(
      `select location, anchor_key from public.content_reports where user_id = $1`,
      [ana.sub],
    );
    const row = r.rows[0]!;
    expect(Object.keys(row.location).sort()).toEqual([
      'path',
      'quote',
      'section',
      'sectionTitle',
      'title',
    ]);
    expect((row.location.quote as { exact: string }).exact).toHaveLength(500);
    expect(row.anchor_key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('nobody writes or changes a report by hand, and an account that is not invited cannot report', async () => {
    const ana = await person(db);
    await expect(
      asUser(db, ana, (tx) =>
        tx.query(
          `insert into public.content_reports (target_kind, target_id, category, comment)
           values ('card', 'g:0', 'fact', 'x')`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await report(db, ana, card());
    const changed = await asUser(db, ana, (tx) =>
      tx.query(`update public.content_reports set comment = 'otra cosa' where user_id = $1`, [
        ana.sub,
      ]),
    ).catch((e: Error) => e);
    expect(String(changed)).toMatch(/permission denied/);
    const outsider: Claims = {
      sub: '00000000-0000-4000-8000-0000000009a9',
      email: 'no.invitado@ug.uchile.cl',
    };
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [
      outsider.sub,
      outsider.email,
    ]);
    await expect(report(db, outsider, card())).rejects.toThrow(/not_allowed/);
    await expect(report(db, null, card())).rejects.toThrow(/permission denied/);
  });

  it('refuses what does not have the shape of a report', async () => {
    const ana = await person(db);
    await expect(report(db, ana, { ...card(), comment: '   ' })).rejects.toThrow(/comment/);
    await expect(report(db, ana, { ...card(), category: 'answer_key' })).rejects.toThrow(
      /category/,
    );
    await expect(report(db, ana, { ...card(), id: 'sin-ord' })).rejects.toThrow(/guid:ord/);
    await expect(report(db, ana, { ...card(), kind: 'site' })).rejects.toThrow(/kind/);
    await expect(
      report(db, ana, { ...card(), location: { path: 'https://otro.sitio/x' } }),
    ).rejects.toThrow(/path/);
    await expect(report(db, ana, { ...card(), version: 2.5 })).rejects.toThrow(/version/);
  });

  it(`up to ${REPORT_LIMITS.openPerPlace} open per person in the same place, with a clear refusal after`, async () => {
    const ana = await person(db);
    for (let i = 0; i < REPORT_LIMITS.openPerPlace; i++) {
      await report(db, ana, card(`Error ${i + 1}`, 'g9:0'));
    }
    await expect(report(db, ana, card('Uno más', 'g9:0'))).rejects.toThrow(/report_place_limit/);
    // Another card, another quote of the same article: other places.
    await report(db, ana, card('En la otra cara', 'g9:1'));
    for (let i = 0; i < REPORT_LIMITS.openPerPlace; i++) {
      await report(db, ana, quote('Primera cita'));
    }
    await expect(report(db, ana, quote('Primera cita'))).rejects.toThrow(/report_place_limit/);
    await report(db, ana, quote('Segunda cita'));
    // Somebody else can report that same card.
    await report(db, await person(db), card('Yo también', 'g9:0'));
    // Once resolved, the place is free again.
    await resolve(db, owner, {
      kind: 'card',
      target_id: 'g9:0',
      status: 'fixed',
      fixed_version: 3,
    });
    await report(db, ana, card('Sigue mal', 'g9:0'));
  });

  it('a test with many errors is reported question by question: 30 questions of one test in a day', async () => {
    const ana = await person(db);
    for (let i = 1; i <= 30; i++) await report(db, ana, question(`p${i}`));
    expect(await mine(db, ana)).toHaveLength(30);
  });

  it('a card whose guid has «:» (Anki’s alphabet has it) is reported as any other', async () => {
    // Revisión de cero (2.6): about one real note in eleven has «:» in its guid, and «^[^:…]» refused them.
    const ana = await person(db);
    await report(db, ana, card('Con dos puntos', 'a:b`{c:2'));
    expect((await mine(db, ana)).map((r) => r.target_id)).toEqual(['a:b`{c:2']);
    await expect(report(db, ana, card('Sin ord', 'a:b:'))).rejects.toThrow(/guid:ord/);
    await expect(report(db, ana, card('Con espacio', 'a b:0'))).rejects.toThrow(/guid:ord/);
  });

  it('the path is one of the site: nothing a browser would read as another site', async () => {
    // Revisión de cero (2.6): «/» + backslash or a tab passed, and the panel's link took to «//otro.sitio».
    const ana = await person(db);
    const at = (path: string) => report(db, ana, { ...card(), id: 'p1:0', location: { path } });
    for (const path of [
      '//otro.sitio/x',
      `/${String.fromCharCode(92)}otro.sitio/x`,
      '/\t/otro.sitio/x',
      '/\n/otro.sitio',
      '/x y',
      'otro.sitio',
    ]) {
      await expect(at(path), JSON.stringify(path)).rejects.toThrow(/path/);
    }
    await at('/anki/browse?q=%22T-XX-C1-01-001%22&note=a%3Ab&ord=0');
    await at('/semesters/1/courses/ramo/notes/apunte');
  });

  it('a quote with other spaces is the same place, and is kept with single spaces', async () => {
    const ana = await person(db);
    for (let i = 0; i < REPORT_LIMITS.openPerPlace; i++) {
      await report(db, ana, quote(i % 2 ? '  La   misma\n cita ' : 'La misma cita'));
    }
    await expect(report(db, ana, quote('La misma  cita'))).rejects.toThrow(/report_place_limit/);
    const r = await db.query<{ exact: string }>(
      `select distinct location #>> '{quote,exact}' as exact from public.content_reports where user_id = $1`,
      [ana.sub],
    );
    expect(r.rows).toEqual([{ exact: 'La misma cita' }]);
    // Only spaces: the article as a whole, without a quote.
    await report(db, ana, quote('   '));
    const whole = await db.query<{ anchor_key: string; location: Record<string, unknown> }>(
      `select anchor_key, location from public.content_reports
        where user_id = $1 and not location ? 'quote'`,
      [ana.sub],
    );
    expect(whole.rows).toHaveLength(1);
    // The section is still there, so it is a place of its own (not the whole article).
    expect(whole.rows[0]!.anchor_key).toMatch(/^[0-9a-f]{32}$/);
  });

  it(`at most ${REPORT_LIMITS.perDay} a day per person, with a clear refusal after`, async () => {
    const ana = await person(db);
    for (let i = 1; i <= REPORT_LIMITS.perDay; i++) await report(db, ana, question(`q${i}`));
    await expect(report(db, ana, question('una-mas'))).rejects.toThrow(/report_daily_limit/);
    // The next day (24 hours later), again.
    await db.query(
      `update public.content_reports set created_at = created_at - interval '25 hours' where user_id = $1`,
      [ana.sub],
    );
    await report(db, ana, question('al-otro-dia'));
  });
});

describe('the panel', () => {
  let db: PGlite;
  let owner: Claims;
  beforeAll(async () => {
    db = await createDatabase('users');
    owner = await person(db, OWNER_EMAIL);
  });

  it('only an administrator with the session open uses it', async () => {
    const ana = await person(db);
    await expect(queue(db, ana)).rejects.toThrow(/admin_only/);
    await expect(
      resolve(db, ana, { kind: 'card', target_id: 'g1:0', status: 'fixed' }),
    ).rejects.toThrow(/admin_only/);
    await expect(queue(db, { ...owner, session_id: undefined })).rejects.toThrow(/session_closed/);
    await expect(queue(db, null)).rejects.toThrow(/permission denied/);
    await expect(
      call(db, ana, 'select public.admin_reopen_reports($1::jsonb) as r', [
        JSON.stringify({ resolution_id: '00000000-0000-4000-8000-000000000001' }),
      ]),
    ).rejects.toThrow(/admin_only/);
    // The rules of a new report are only for the functions.
    await expect(
      call(db, ana, `select public.check_new_report($1, 'card', 'g:0', '') as r`, [ana.sub]),
    ).rejects.toThrow(/permission denied/);
  });

  it('three students in one card are one row; resolving closes the three, and each one sees it', async () => {
    const students = [await person(db), await person(db), await person(db)];
    for (const [i, s] of students.entries()) await report(db, s, card(`Error visto por ${i + 1}`));
    const other = await person(db);
    await report(db, other, question('p1'));
    const q = await queue(db, owner);
    const group = q.open.find((g) => g.target_id === 'g1:0')!;
    expect(q.open).toHaveLength(2);
    expect(group.reporters).toBe(3);
    expect(group.reports).toHaveLength(3);
    // With more people, first.
    expect(q.open[0]!.target_id).toBe('g1:0');
    expect(q.limits).toEqual({ per_day: 50, open_per_place: 5 });

    const r = await resolve(db, owner, {
      kind: 'card',
      target_id: 'g1:0',
      status: 'fixed',
      fixed_version: 3,
      note: 'Corregido el dato.',
    });
    expect(r.resolved).toBe(3);
    const after = await queue(db, owner);
    expect(after.open.map((g) => g.target_id)).toEqual(['test-de-prueba/p1']);
    expect(after.resolved.map((g) => [g.target_id, g.resolution.status])).toEqual([
      ['g1:0', 'fixed'],
    ]);
    for (const s of students) {
      const [mineRow] = await mine(db, s);
      expect(mineRow!.resolution).toEqual(
        expect.objectContaining({ status: 'fixed', fixed_version: 3, note: 'Corregido el dato.' }),
      );
      // Nobody sees who else reported it.
      expect((await mine(db, s)).map((x) => x.comment)).toEqual([mineRow!.comment]);
    }
    expect((await mine(db, other))[0]!.resolution).toBeNull();
    // Nothing open: nothing to resolve.
    await expect(
      resolve(db, owner, { kind: 'card', target_id: 'g1:0', status: 'not_an_error' }),
    ).rejects.toThrow(/nothing_open/);
  });

  it('«no es un error» with its reason, and reopening', async () => {
    const ana = await person(db);
    await report(db, ana, quote('El ribosoma tiene membrana'));
    const r = await resolve(db, owner, {
      kind: 'note',
      target_id: 'AP-XX-C1-01',
      status: 'not_an_error',
      note: 'La cita es de un libro y está bien.',
    });
    expect((await mine(db, ana))[0]!.resolution).toEqual(
      expect.objectContaining({
        status: 'not_an_error',
        note: 'La cita es de un libro y está bien.',
      }),
    );
    await call(db, owner, 'select public.admin_reopen_reports($1::jsonb) as r', [
      JSON.stringify({ resolution_id: r.resolution_id }),
    ]);
    expect((await mine(db, ana))[0]!.resolution).toBeNull();
  });

  it('the precision of each reporter only orders (who was right more often goes first); it never leaves the database', async () => {
    const right = await person(db);
    const wrong = await person(db);
    await report(db, right, card('Bien visto', 'h1:0'));
    await resolve(db, owner, { kind: 'card', target_id: 'h1:0', status: 'fixed' });
    await report(db, wrong, card('No era', 'h2:0'));
    await resolve(db, owner, { kind: 'card', target_id: 'h2:0', status: 'not_an_error' });
    await report(db, wrong, card('Primero', 'h3:0'));
    await report(db, right, card('Segundo', 'h3:0'));
    const q = await queue(db, owner);
    const g = q.open.find((x) => x.target_id === 'h3:0')!;
    expect(g.reports.map((x) => x.comment)).toEqual(['Segundo', 'Primero']);
    // Revisión de cero (2.6): it went to the panel, next to the name. Only who, never how often they were right.
    for (const r of q.open.flatMap((x) => x.reports)) {
      if (r.reporter)
        expect(Object.keys(r.reporter).sort()).toEqual(['blocked', 'email', 'id', 'name']);
    }
    expect(JSON.stringify(q)).not.toMatch(/precision|"resolved":\s*[0-9]/);
  });

  it('a blocked person cannot report any more; an administrator is never blocked', async () => {
    const ana = await person(db);
    await report(db, ana, card('Antes del bloqueo', 'b1:0'));
    const block = (blocked: boolean, user = ana.sub) =>
      call<{ changed: boolean }>(
        db,
        owner,
        'select public.admin_set_report_block($1::jsonb) as r',
        [JSON.stringify({ user_id: user, blocked })],
      );
    expect((await block(true)).changed).toBe(true);
    expect((await block(true)).changed).toBe(false);
    await expect(report(db, ana, card('Después', 'b2:0'))).rejects.toThrow(/report_blocked/);
    expect((await queue(db, owner)).blocked.map((b) => b.id)).toEqual([ana.sub]);
    // What they wrote stays.
    expect(await mine(db, ana)).toHaveLength(1);
    await expect(block(true, owner.sub)).rejects.toThrow(/admin_stays/);
    await expect(
      call(db, ana, 'select public.admin_set_report_block($1::jsonb) as r', [
        JSON.stringify({ user_id: ana.sub, blocked: false }),
      ]),
    ).rejects.toThrow(/admin_only/);
    await block(false);
    await report(db, ana, card('Ya puedo', 'b2:0'));
  });

  it('a blocked person downloads their block; deleting the account leaves the reports without an author', async () => {
    const ana = await person(db);
    await report(db, ana, card('Antes de irme', 'd1:0'));
    await call(db, owner, 'select public.admin_set_report_block($1::jsonb) as r', [
      JSON.stringify({ user_id: ana.sub, blocked: true }),
    ]);
    const data = await call<{ tables: Record<string, unknown[]> }>(
      db,
      ana,
      'select public.export_my_data() as r',
    );
    expect(data.tables['report_blocks']).toHaveLength(1);
    expect(data.tables['content_reports']).toHaveLength(1);
    // As purge_deleted_accounts() does (step 2.3).
    await db.query(`delete from auth.users where id = $1`, [ana.sub]);
    const left = await db.query<{ user_id: string | null; blocks: number }>(
      `select r.user_id, (select count(*)::int from public.report_blocks b where b.user_id = $1) as blocks
         from public.content_reports r where r.target_id = 'd1:0'`,
      [ana.sub],
    );
    expect(left.rows).toEqual([{ user_id: null, blocks: 0 }]);
    const g = (await queue(db, owner)).open.find((x) => x.target_id === 'd1:0')!;
    expect(g.reports.map((r) => r.reporter)).toEqual([null]);
  });

  it('twelve months after closing, a report loses its author; the job is only for postgres', async () => {
    const ana = await person(db);
    await report(db, ana, card('Viejo', 'a1:0'));
    await report(db, ana, card('Reciente', 'a2:0'));
    await report(db, ana, card('Abierto hace mucho', 'a3:0'));
    const old = await resolve(db, owner, { kind: 'card', target_id: 'a1:0', status: 'fixed' });
    await resolve(db, owner, { kind: 'card', target_id: 'a2:0', status: 'fixed' });
    await db.query(
      `update public.report_resolutions set resolved_at = now() - interval '13 months' where id = $1`,
      [old.resolution_id],
    );
    await db.query(
      `update public.content_reports set created_at = now() - interval '14 months'
        where user_id = $1 and target_id = 'a3:0'`,
      [ana.sub],
    );
    await expect(
      asUser(db, ana, (tx) => tx.query('select public.anonymize_old_reports()')),
    ).rejects.toThrow(/permission denied/);
    const r = await db.query<{ r: { anonymized: number } }>(
      'select public.anonymize_old_reports() as r',
    );
    expect(r.rows[0]!.r.anonymized).toBe(1);
    const rows = await db.query<{ comment: string; user_id: string | null }>(
      `select comment, user_id from public.content_reports where target_id in ('a1:0', 'a2:0', 'a3:0')
        order by comment`,
    );
    expect(rows.rows).toEqual([
      { comment: 'Abierto hace mucho', user_id: ana.sub },
      { comment: 'Reciente', user_id: ana.sub },
      { comment: 'Viejo', user_id: null },
    ]);
  });
});

describe('the copy of card_reports', () => {
  it('the table of before (card_reports, until the second migration) has the same rules', async () => {
    // Revisión de cero (2.6): its «insert own» policy is still there, and what came that way skipped the block and the
    // places.
    // Built as the copy's test does: it keeps working once the second migration is in migrations/.
    const db = await createDatabase('users', [], MIGRATION);
    await applyMigration(db, 'users', MIGRATION);
    const owner = await person(db, OWNER_EMAIL);
    const ana = await person(db);
    const old = (u: Claims, comment: string, guid = 'v1') =>
      asUser(db, u, (tx) =>
        tx.query(`insert into public.card_reports (note_guid, ord, comment) values ($1, 0, $2)`, [
          guid,
          comment,
        ]),
      );
    for (let i = 0; i < REPORT_LIMITS.openPerPlace; i++) await old(ana, `Viejo ${i}`);
    await expect(old(ana, 'Uno más')).rejects.toThrow(/report_place_limit/);
    // The new way counts them too: the same card is the same place.
    await expect(report(db, ana, card('Por la nueva', 'v1:0'))).rejects.toThrow(
      /report_place_limit/,
    );
    await call(db, owner, 'select public.admin_set_report_block($1::jsonb) as r', [
      JSON.stringify({ user_id: ana.sub, blocked: true }),
    ]);
    await expect(old(ana, 'Bloqueada', 'v2')).rejects.toThrow(/report_blocked/);
    // Nothing of what was refused was written, in either table.
    const n = await db.query<{ old: number; copies: number }>(
      `select (select count(*)::int from public.card_reports where user_id = $1) as old,
              (select count(*)::int from public.content_reports where user_id = $1) as copies`,
      [ana.sub],
    );
    expect(n.rows).toEqual([
      { old: REPORT_LIMITS.openPerPlace, copies: REPORT_LIMITS.openPerPlace },
    ]);
  });

  it('copies every row without losing one, and what the web of before writes after it', async () => {
    const db = await createDatabase('users', [], MIGRATION);
    const ana = await person(db);
    const luis = await person(db);
    const insert = (u: Claims, comment: string, guid = 'g1', ord = 0) =>
      asUser(db, u, (tx) =>
        tx.query<{ id: string }>(
          `insert into public.card_reports (note_guid, ord, deck_id, card_code, card_version, comment)
           values ($1, $2, '1001', 'T-XX-C1-01-001', 2, $3) returning id`,
          [guid, ord, comment],
        ),
      );
    // Two open of the same person in the same card (the limit of places did not exist), one resolved, one without
    // an author (a deleted account) and one without a deck nor a code.
    await insert(ana, 'Primero');
    await insert(ana, 'Segundo');
    const resolved = (await insert(luis, 'Resuelto', 'g2', 1)).rows[0]!.id;
    await db.query(
      `update public.card_reports set status = 'resolved', resolved_at = '2026-11-05T12:00:00Z' where id = $1`,
      [resolved],
    );
    // A guid with «:» (Anki's alphabet has it).
    const orphan = (await insert(luis, 'Sin autor', 'g:3')).rows[0]!.id;
    await db.query(`update public.card_reports set user_id = null where id = $1`, [orphan]);
    await asUser(db, ana, (tx) =>
      tx.query(
        `insert into public.card_reports (note_guid, ord, comment) values ('g4', 0, 'Pelado')`,
      ),
    );

    await applyMigration(db, 'users', MIGRATION);

    const compare = async () => {
      const old = await db.query<Record<string, unknown>>(
        `select id, user_id, note_guid || ':' || ord as target_id, card_code, card_version,
                deck_id, comment, created_at, status, resolved_at
           from public.card_reports order by id`,
      );
      const copied = await db.query<Record<string, unknown>>(
        `select c.id, c.user_id, c.target_id, c.target_code as card_code, c.target_version as card_version,
                c.location ->> 'deckId' as deck_id, c.comment, c.created_at,
                case when c.resolution_id is null then 'open' else 'resolved' end as status,
                x.resolved_at, c.target_kind, c.category, x.status as decided
           from public.content_reports c
           left join public.report_resolutions x on x.id = c.resolution_id
          order by c.id`,
      );
      expect(copied.rows).toHaveLength(old.rows.length);
      copied.rows.forEach((c, i) => {
        const o = old.rows[i]!;
        expect({ ...c, target_kind: undefined, category: undefined, decided: undefined }).toEqual({
          ...o,
          target_kind: undefined,
          category: undefined,
          decided: undefined,
        });
        expect(c.target_kind).toBe('card');
        expect(c.category).toBe('other');
        expect(c.decided).toBe(o.status === 'resolved' ? 'fixed' : null);
      });
      return old.rows.length;
    };
    expect(await compare()).toBe(5);
    // The query of docs/configuracion.md («Publicar el paso 2.6», point 2), as the owner runs it in production.
    const check = await db.query<{ total: number; missing: number; different: number }>(
      `select count(*)::int as total,
              count(*) filter (where c.id is null)::int as missing,
              count(*) filter (where c.id is not null and (
                c.user_id is distinct from r.user_id
                or c.target_kind <> 'card'
                or c.target_id <> r.note_guid || ':' || r.ord
                or c.target_code is distinct from r.card_code
                or c.target_version is distinct from r.card_version
                or (c.location ->> 'deckId') is distinct from r.deck_id
                or c.comment <> r.comment
                or c.created_at <> r.created_at
                or (c.resolution_id is not null) <> (r.status = 'resolved')
                or (r.status = 'resolved' and (x.status <> 'fixed'
                    or x.resolved_at <> coalesce(r.resolved_at, r.created_at)))))::int as different
         from public.card_reports r
         left join public.content_reports c on c.id = r.id
         left join public.report_resolutions x on x.id = c.resolution_id`,
    );
    expect(check.rows).toEqual([{ total: 5, missing: 0, different: 0 }]);

    // The web of before keeps writing card_reports until the new one is deployed: copied as it comes.
    const late = (await insert(luis, 'Después de migrar', 'g5')).rows[0]!.id;
    await db.query(
      `update public.card_reports set status = 'resolved', resolved_at = now() where id = $1`,
      [late],
    );
    expect(await compare()).toBe(6);
    await db.query(
      `update public.card_reports set status = 'open', resolved_at = null where id = $1`,
      [late],
    );
    expect(await compare()).toBe(6);
    // The copy counts in the limits of the new model as any report.
    expect(await mine(db, ana)).toHaveLength(3);

    // The second migration (after deploying the web): card_reports goes, the reports stay, the download works.
    await db.exec(readFileSync(AFTER_DEPLOY, 'utf8'));
    const gone = await db.query(`select to_regclass('public.card_reports') as t`);
    expect(gone.rows).toEqual([{ t: null }]);
    expect((await db.query('select count(*)::int as n from public.content_reports')).rows).toEqual([
      { n: 6 },
    ]);
    const exported = await call<{ tables: Record<string, unknown[]> }>(
      db,
      ana,
      'select public.export_my_data() as r',
    );
    expect(exported.tables['content_reports']).toHaveLength(3);
    expect(Object.hasOwn(exported.tables, 'card_reports')).toBe(false);
    // Reporting, «Mis reportes» and the panel go on without it.
    await report(db, ana, card('Después de la segunda', 'z:0'));
    expect(await mine(db, ana)).toHaveLength(4);
    const owner = await person(db, OWNER_EMAIL);
    expect((await queue(db, owner)).open.map((g) => g.target_id)).toContain('z:0');
  });
});
