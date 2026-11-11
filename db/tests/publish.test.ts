// Plan step 1.7, part 3 (B6): publishing the draft and undoing the last publication (20261111000000_publish.sql).
// B6's «Listo cuando»: after publishing, public = draft; after undoing, public = the original, byte for byte; 25,000
// synthetic notes changed are published in less than 30 s; a concurrent read never sees a mix; a student's progress
// (a card moved, taken out, back; a question taken out) is still right after publishing and after undoing, with
// reconcile_cards(). Also every refusal, the versions decided when publishing, and rebuild_draft() that stops.
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { CloudTarget } from '@qv/importer';
import type { MediaStore } from '@qv/importer';
import {
  AN,
  BC,
  ankiNote,
  article,
  bundleOf,
  decksOf,
  everything,
  leafOf,
  quiz,
  serviceRpc,
  withHash,
} from './import-fixtures';
import type { Parts } from './import-fixtures';
import { asUser, createDatabase } from './pglite';

let db: PGlite;
const calls: { fn: string; args: Record<string, unknown> }[] = [];
const store: MediaStore = { has: async () => true, put: async () => {} };
const published = new CloudTarget({ db: serviceRpc(() => db, calls), store });
const draft = new CloudTarget({ db: serviceRpc(() => db, calls, 'draft'), store });
const save = (target: CloudTarget, p: Parts) => {
  const { bundle, media } = bundleOf(p);
  return target.save(bundle, media);
};

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;
const service = async <T>(sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return (await tx.query<T>(sql, params)).rows;
  });

/** The tables a publication takes, and what is in them in a schema, as text (for «byte for byte»). */
async function tables() {
  return (await q<{ tbl: string }>('select tbl from public.release_tables() order by ord')).map(
    (r) => r.tbl,
  );
}
async function dump(schema: 'public' | 'draft', names?: string[]) {
  const out: Record<string, string> = {};
  for (const t of names ?? [...(await tables()), 'anki_card_changes']) {
    out[t] = (
      await q<{ r: string }>(
        `select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]')::text as r from ${schema}.${t} x`,
      )
    )[0]!.r;
  }
  return out;
}
/** Everything of public a publication and its undoing may touch, but the record of cards moved (which they add to). */
async function publicContent() {
  return {
    ...(await dump('public', await tables())),
    unpublished_note_versions: (
      await q<{ r: string }>(
        `select coalesce(jsonb_agg(to_jsonb(x) order by x.note_id), '[]')::text as r from public.unpublished_note_versions x`,
      )
    )[0]!.r,
  };
}

const fingerprint = async () =>
  (await service<{ r: string }>('select public.release_fingerprint() as r'))[0]!.r;
async function markAll() {
  const fp = await fingerprint();
  for (const mark of ['phone', 'answers']) {
    await service('select public.set_release_mark($1, $2, true, $3)', [fp, mark, 'dueño']);
  }
  return fp;
}
const REVIEW = { blocking: 0, ready: true, warnings: [] };
const publishWith = async (p: Record<string, unknown>) =>
  (
    await service<{ r: Record<string, unknown> }>('select public.publish_release($1::jsonb) as r', [
      p,
    ])
  )[0]!.r;
async function publish(extra: Record<string, unknown> = {}) {
  const fp = await markAll();
  return publishWith({
    fingerprint: fp,
    title: 'Biología celular · Certamen 2',
    schemaVersion: 1,
    checks: REVIEW,
    by: 'dueno@ug.uchile.cl',
    ...extra,
  });
}
const revert = async (id: number) =>
  (
    await service<{ r: Record<string, unknown> }>('select public.revert_release($1::jsonb) as r', [
      { id, by: 'dueno@ug.uchile.cl' },
    ])
  )[0]!.r;
const pending = () => q('select * from public.draft_pending_changes()');

/** An Anki note of the fixtures with its card in another deck. */
const inDeck = (n: ReturnType<typeof ankiNote>, deckId: string) => {
  const { hash: _hash, updatedAt, ...rest } = n;
  return { ...withHash({ ...rest, cards: rest.cards.map((c) => ({ ...c, deckId })) }), updatedAt };
};
const ASSESSMENT_DECK = (a: string) => decksOf(a).at(-2)!.id;

/** A new version of everything: an article changed and one new, an Anki note changed, one moved to another deck, one
 * taken out and one new, a question changed and one taken out. */
const changed = (): Parts => {
  const p = everything();
  p.notes[0] = article('AP-BC-C2-08', BC, 'Transcripción corregida', 1);
  p.notes.push(article('AP-BC-C2-10', BC, 'Núcleo', 3));
  p.ankiNotes = p.ankiNotes.filter((n) => n.guid !== 'bc-3');
  p.ankiNotes[0] = ankiNote('bc-1', BC, 'uno corregido');
  p.ankiNotes[1] = inDeck(ankiNote('bc-2', BC, 'dos'), ASSESSMENT_DECK(BC));
  p.ankiNotes.push(ankiNote('an-2', AN, 'cinco'));
  p.quizzes[0] = quiz('practica-bc', BC, ['¿Uno, de otra forma?']);
  return p;
};

beforeEach(async () => {
  db = await createDatabase('content');
  await save(published, everything());
  await service('select public.reset_draft()');
});

describe('publishing the draft', () => {
  it('leaves public byte for byte as the draft, and the draft as what is published', async () => {
    await save(draft, changed());
    const r = await publish();
    expect(r).toMatchObject({ id: 1, title: 'Biología celular · Certamen 2' });
    expect(r.changes).toMatchObject({
      notes: { insert: 1, update: 1, delete: 0 },
      anki_notes: { insert: 1, update: 2, delete: 1 },
      anki_cards: { insert: 1, update: 2, delete: 1 },
      quiz_questions: { insert: 0, update: 1, delete: 1 },
    });
    expect(await dump('public')).toEqual(await dump('draft'));
    expect(await pending()).toEqual([]);
    expect(await q('select * from public.draft_drift()')).toEqual([]);
    // The cards that moved or left, recorded by public's triggers for the students (never in the users' database).
    expect(
      await q(`select note_guid, deck_id from public.anki_card_changes order by note_guid`),
    ).toEqual([
      { note_guid: 'bc-2', deck_id: ASSESSMENT_DECK(BC) },
      { note_guid: 'bc-3', deck_id: null },
    ]);
    expect(
      await q(`select id, status, published_by, reverted_at from public.releases order by id`),
    ).toEqual([
      { id: 1, status: 'published', published_by: 'dueno@ug.uchile.cl', reverted_at: null },
    ]);
    // The marks were for that draft.
    expect(await q('select * from public.release_marks')).toEqual([]);
  });

  it('the version of an article goes up when publishing, once for several imports to the draft', async () => {
    await save(draft, changed());
    const twice = changed();
    twice.notes[0] = article('AP-BC-C2-08', BC, 'Transcripción corregida otra vez', 1);
    await save(draft, twice);
    // In the draft each import gave its own (provisional) version.
    expect(await q(`select version from draft.notes where id = 'AP-BC-C2-08'`)).toEqual([
      { version: 3 },
    ]);
    await publish();
    expect(
      await q(
        `select id, version, published_at is not null as p, version_at is not null as v from public.notes order by id`,
      ),
    ).toEqual([
      { id: 'AP-A1-S3-01', version: 1, p: true, v: true },
      { id: 'AP-BC-C2-08', version: 2, p: true, v: true },
      { id: 'AP-BC-C2-09', version: 1, p: true, v: true },
      { id: 'AP-BC-C2-10', version: 1, p: true, v: true },
    ]);
    // «Creado el» stays; «Actualizado el» is the publication's.
    const [dates] = await q<{ same: boolean; later: boolean }>(
      `select p.published_at = o.published_at as same, p.version_at > o.version_at as later
         from public.notes p, (select published_at, version_at from public.notes where id = 'AP-BC-C2-09') o
        where p.id = 'AP-BC-C2-08'`,
    );
    expect(dates).toEqual({ same: true, later: true });
    expect(await q(`select version from draft.notes where id = 'AP-BC-C2-08'`)).toEqual([
      { version: 2 },
    ]);
  });

  it('the version of a question goes up when its document changes, not when only its place does', async () => {
    const p = everything();
    p.quizzes[0] = quiz('practica-bc', BC, ['¿Uno?', '¿Dos, de otra forma?']);
    await save(draft, p);
    await publish();
    expect(
      await q(
        `select id, version from public.quiz_questions where quiz_id = 'practica-bc' order by id`,
      ),
    ).toEqual([
      { id: 'practica-bc-q1', version: 1 },
      { id: 'practica-bc-q2', version: 2 },
    ]);
    expect(await dump('public')).toEqual(await dump('draft'));
  });
});

describe('undoing the last publication', () => {
  it('leaves public byte for byte as it was, and the draft with what was undone', async () => {
    const before = await publicContent();
    await save(draft, changed());
    const inDraft = await dump('draft');
    const { id } = (await publish()) as { id: number };
    const undone = await revert(id);
    expect(undone).toMatchObject({ id: 1 });
    expect(await publicContent()).toEqual(before);
    // The draft keeps what was undone (to fix it and publish again, or to discard it).
    const { anki_card_changes: _a, ...draftNow } = await dump('draft');
    const { anki_card_changes: _b, ...draftThen } = inDraft;
    // (but the versions, which publishing decided and gave to the draft too)
    const versionless = (d: Record<string, string>) => ({
      ...d,
      notes: JSON.stringify(
        (JSON.parse(d.notes!) as Record<string, unknown>[]).map(
          ({ version: _v, version_at: _w, published_at: _p, ...n }) => n,
        ),
      ),
      quiz_questions: JSON.stringify(
        (JSON.parse(d.quiz_questions!) as Record<string, unknown>[]).map(
          ({ version: _v, ...n }) => n,
        ),
      ),
    });
    expect(versionless(draftNow)).toEqual(versionless(draftThen));
    expect((await pending()).length).toBeGreaterThan(0);
    // The cards come back to where they were: the record says so for the students.
    expect(
      await q(`select note_guid, deck_id from public.anki_card_changes order by note_guid`),
    ).toEqual([
      { note_guid: 'an-2', deck_id: null },
      { note_guid: 'bc-2', deck_id: leafOf(BC) },
      { note_guid: 'bc-3', deck_id: leafOf(BC) },
    ]);
    expect(await q(`select id, status, reverted_by from public.releases`)).toEqual([
      { id: 1, status: 'reverted', reverted_by: 'dueno@ug.uchile.cl' },
    ]);
    expect(await q('select count(*)::int as n from public.release_changes')).toEqual([{ n: 0 }]);
  });

  it('an undone version number is not given again', async () => {
    await save(draft, changed());
    const first = (await publish()) as { id: number };
    await revert(first.id);
    expect(await q(`select version from public.notes where id = 'AP-BC-C2-08'`)).toEqual([
      { version: 1 },
    ]);
    const second = (await publish()) as { id: number };
    expect(second.id).toBe(2);
    expect(
      await q(
        `select id, version from public.notes where id in ('AP-BC-C2-08', 'AP-BC-C2-10') order by id`,
      ),
    ).toEqual([
      { id: 'AP-BC-C2-08', version: 3 },
      { id: 'AP-BC-C2-10', version: 2 },
    ]);
    expect(
      await q(`select version from public.quiz_questions where id = 'practica-bc-q1'`),
    ).toEqual([{ version: 3 }]);
  });

  it('only the last one, once', async () => {
    await save(draft, changed());
    const first = (await publish()) as { id: number };
    const p = changed();
    p.notes[1] = article('AP-BC-C2-09', BC, 'Procesamiento corregido', 2);
    await save(draft, p);
    const second = (await publish()) as { id: number };
    await expect(revert(first.id)).rejects.toThrow(/revert_release: not_last/);
    await revert(second.id);
    await expect(revert(second.id)).rejects.toThrow(/revert_release: reverted/);
    // The one before stays published: an older one is fixed by publishing another.
    await expect(revert(first.id)).rejects.toThrow(/revert_release: not_last/);
    expect(await q(`select id, status from public.releases order by id`)).toEqual([
      { id: 1, status: 'published' },
      { id: 2, status: 'reverted' },
    ]);
    // Only the last publication keeps its «before».
    expect(await q('select count(*)::int as n from public.release_changes')).toEqual([{ n: 0 }]);
  });

  it('is refused if public changed after publishing (npm run unpublish), and names what was taken off', async () => {
    await save(draft, changed());
    const { id } = (await publish()) as { id: number };
    await service(
      `select public.unpublish_content('note', 'AP-BC-C2-10', 'Error grave', 'dueño', true)`,
    );
    const now = await publicContent();
    await expect(revert(id)).rejects.toThrow(/revert_release: public_changed/);
    const detail = await db
      .query(`select public.revert_release('{"id": 1, "by": "x"}'::jsonb)`)
      .catch((e: { detail?: string }) => e.detail);
    expect(detail).toMatch(/note AP-BC-C2-10/);
    expect(await publicContent()).toEqual(now);
    // A change by hand, too.
    await q(`update public.semesters set name = 'Otro' where number = 1`);
    await expect(revert(id)).rejects.toThrow(/revert_release: public_changed/);
  });

  it('gives back the version an article taken off had (npm run unpublish, step 1.5)', async () => {
    await service(
      `select public.unpublish_content('note', 'AP-BC-C2-09', 'Revisar', 'dueño', true)`,
    );
    const before = await publicContent();
    expect(JSON.parse(before.unpublished_note_versions!)).toHaveLength(1);
    // It comes back in the draft (out of content/unpublished.json), the same as it was.
    await save(draft, everything());
    const { id } = (await publish()) as { id: number };
    expect(await q(`select version from public.notes where id = 'AP-BC-C2-09'`)).toEqual([
      { version: 1 },
    ]);
    expect(await q('select * from public.unpublished_note_versions')).toEqual([]);
    await revert(id);
    expect(await publicContent()).toEqual(before);
  });
});

describe('what stops a publication', () => {
  it.each([
    [
      'a fingerprint of another draft',
      { fingerprint: '0'.repeat(32) },
      /publish_release: fingerprint/,
    ],
    ['a package version the Worker does not understand', { schemaVersion: 2 }, /schema_version/],
    [
      'a review list with a rule that stops it',
      { checks: { blocking: 1, ready: false } },
      /blocked/,
    ],
    ['a review list that is not done', { checks: { blocking: 0, ready: false } }, /blocked/],
    [
      'the announcement’s mark, when it applies and is not checked',
      { marks: ['announcement'] },
      /marks/,
    ],
    ['a title too long', { title: 'x'.repeat(301) }, /invalid/],
  ])('%s', async (_what, extra, error) => {
    await save(draft, changed());
    const before = { public: await publicContent(), draft: await dump('draft') };
    await expect(publish(extra)).rejects.toThrow(error);
    expect(await publicContent()).toEqual(before.public);
    expect(await dump('draft')).toEqual(before.draft);
    expect(await q('select * from public.releases')).toEqual([]);
  });

  it('the marks by hand, which are of the draft they were made for', async () => {
    await save(draft, changed());
    const fp = await fingerprint();
    await service('select public.set_release_mark($1, $2, true, $3)', [fp, 'phone', 'dueño']);
    await expect(
      publishWith({ fingerprint: fp, title: 't', schemaVersion: 1, checks: REVIEW, by: 'x' }),
    ).rejects.toThrow(/publish_release: marks/);
  });

  it('a draft that changes nothing', async () => {
    await expect(publish()).rejects.toThrow(/publish_release: empty/);
  });

  it('something of content/unpublished.json, or IMAIOS, in the draft (checked again by the database)', async () => {
    await save(draft, changed());
    await q(
      `update draft.content_meta set value = '[{"kind": "note", "id": "AP-BC-C2-10"}]' where key = 'unpublished'`,
    );
    await expect(publish()).rejects.toThrow(/publish_release: unpublished/);
    await q(`update draft.content_meta set value = '[]' where key = 'unpublished'`);
    await q(
      `update draft.anki_notes set fields = '{"Texto": "Corte de IMAIOS"}', hash = 'x' where guid = 'an-2'`,
    );
    await expect(publish()).rejects.toThrow(/publish_release: imaios/);
  });

  it('a draft that is not the shape of public (a migration not made again)', async () => {
    await save(draft, changed());
    await q('alter table public.notes add column extra text');
    await expect(publish()).rejects.toThrow(/publish_release: drift/);
  });

  it('a fingerprint that changed because what is published did', async () => {
    await save(draft, changed());
    const fp = await markAll();
    await q(`update public.semesters set name = 'Otro' where number = 2`);
    await expect(
      publishWith({ fingerprint: fp, title: 't', schemaVersion: 1, checks: REVIEW, by: 'x' }),
    ).rejects.toThrow(/publish_release: fingerprint/);
  });
});

describe('one transaction', () => {
  // PGlite has one connection: two sessions cannot read at the same time. What makes a concurrent read never see a
  // mix is that publishing is one statement (one transaction): if anything fails after writing, nothing is left.
  it('a failure after writing part of it leaves public, the draft and the records as they were', async () => {
    await save(draft, changed());
    const before = { public: await dump('public'), draft: await dump('draft') };
    // The questions are among the last tables it writes: the articles and the cards were already written.
    // (its function outside public: the draft does not copy it, so the shape of both stays the same)
    await db.exec(`create schema failing;
             create function failing.now() returns trigger language plpgsql as $$
               begin raise exception 'boom'; end $$;
             create trigger fail_now before insert or update or delete on public.quiz_questions
               for each row execute function failing.now();`);
    await expect(publish()).rejects.toThrow(/boom/);
    await db.exec('drop trigger fail_now on public.quiz_questions; drop schema failing cascade');
    expect(await dump('public')).toEqual(before.public);
    expect(await dump('draft')).toEqual(before.draft);
    expect(await q('select * from public.releases')).toEqual([]);
    expect(await q('select * from public.release_changes')).toEqual([]);
  });

  it('never takes a lock that stops a student’s read (only share row exclusive and row locks)', async () => {
    await save(draft, changed());
    const fp = await markAll();
    const locks = await db.transaction(async (tx) => {
      await tx.exec('set local role service_role');
      await tx.query('select public.publish_release($1::jsonb)', [
        { fingerprint: fp, title: 't', schemaVersion: 1, checks: REVIEW, by: 'x' },
      ]);
      await tx.exec('reset role');
      return (
        await tx.query<{ rel: string; mode: string }>(
          `select c.relnamespace::regnamespace::text || '.' || c.relname as rel, l.mode from pg_locks l
             join pg_class c on c.oid = l.relation
            where l.locktype = 'relation' and l.pid = pg_backend_pid()
              and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'`,
        )
      ).rows;
    });
    expect(locks.length).toBeGreaterThan(0);
    // AccessShare (what a read takes) conflicts only with AccessExclusive.
    expect(locks.filter((l) => l.mode === 'AccessExclusiveLock')).toEqual([]);
    expect(locks.map((l) => l.rel)).toContain('public.anki_cards');
  });
});

describe('a student’s progress', () => {
  const ANA = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
  let users: PGlite;

  const answer = (noteGuid: string, deckId: string) => {
    const now = new Date();
    return {
      noteGuid,
      ord: 0,
      deckId,
      expectedUpdatedAt: null,
      rating: 3,
      queueBefore: 'new',
      interval: -600,
      lastInterval: 0,
      durationMs: 4200,
      state: {
        phase: 'learning',
        interday: false,
        remainingSteps: 1,
        due: new Date(now.getTime() + 600_000).toISOString(),
        interval: 0,
        stability: 2.3065,
        difficulty: 2.118,
        reps: 1,
        lapses: 0,
        lastReview: now.toISOString(),
        suspended: false,
        leech: false,
      },
      bury: [],
      buriedUntil: null,
    };
  };
  const states = () =>
    asUser(
      users,
      ANA,
      async (tx) =>
        (
          await tx.query<{ note_guid: string; deck_id: string; reps: number; retired: boolean }>(
            `select note_guid, deck_id, reps, retired_at is not null as retired from public.card_states order by note_guid`,
          )
        ).rows,
    );
  const everyRow = () =>
    users
      .query<{ r: string }>(
        `select coalesce(jsonb_agg(to_jsonb(x) order by x.note_guid), '[]')::text as r from public.card_states x`,
      )
      .then((r) => r.rows[0]!.r);
  /** What the web does when the student comes in: the content's changes since their cursor, to reconcile_cards(). */
  async function comeIn() {
    const since = await asUser(users, ANA, async (tx) =>
      Number(
        (
          await tx.query<{ s: string }>(
            'select coalesce((select synced_to from public.card_sync), 0) as s',
          )
        ).rows[0]!.s,
      ),
    );
    const page = (
      await service<{ r: { changes: unknown[]; next: number } }>(
        'select public.anki_card_changes_since($1, 5000) as r',
        [since],
      )
    )[0]!.r;
    return asUser(
      users,
      ANA,
      async (tx) =>
        (
          await tx.query<{ r: { applied: boolean } }>('select public.reconcile_cards($1) as r', [
            { since, upTo: page.next, changes: page.changes },
          ])
        ).rows[0]!.r,
    );
  }

  beforeEach(async () => {
    users = await createDatabase('users');
    await users.query('update public.access_settings set open_to_domain = true');
    await users.query(`insert into auth.users (id, email) values ($1, $2)`, [ANA.sub, ANA.email]);
    for (const g of ['bc-1', 'bc-2', 'bc-3']) {
      await asUser(users, ANA, (tx) =>
        tx.query('select public.record_review($1) as r', [answer(g, leafOf(BC))]),
      );
    }
    await comeIn();
  });

  it('a card moved, one taken out and one back: right after publishing and after undoing', async () => {
    const seen = await states();
    expect(seen.map((s) => [s.note_guid, s.reps])).toEqual([
      ['bc-1', 1],
      ['bc-2', 1],
      ['bc-3', 1],
    ]);
    await save(draft, changed());
    const rowsBefore = await everyRow();
    const { id } = (await publish()) as { id: number };
    // Publishing never writes in the users' database.
    expect(await everyRow()).toEqual(rowsBefore);
    expect((await comeIn()).applied).toBe(true);
    expect(await states()).toEqual([
      { note_guid: 'bc-1', deck_id: leafOf(BC), reps: 1, retired: false },
      { note_guid: 'bc-2', deck_id: ASSESSMENT_DECK(BC), reps: 1, retired: false },
      { note_guid: 'bc-3', deck_id: leafOf(BC), reps: 1, retired: true },
    ]);
    const afterPublishing = await everyRow();
    await revert(id);
    expect(await everyRow()).toEqual(afterPublishing);
    expect((await comeIn()).applied).toBe(true);
    // Back where it went, with its progress: the card that left is back, the moved one in its deck.
    expect(await states()).toEqual(seen);
    // And published again: the same as the first time.
    await publish();
    await comeIn();
    expect((await states()).map((s) => [s.note_guid, s.deck_id, s.retired])).toEqual([
      ['bc-1', leafOf(BC), false],
      ['bc-2', ASSESSMENT_DECK(BC), false],
      ['bc-3', leafOf(BC), true],
    ]);
  });

  it('a question taken out leaves; undoing brings it back with its id, its document and its version', async () => {
    const question = () =>
      q(`select id, document, version from public.quiz_questions where id = 'practica-bc-q2'`);
    const was = await question();
    expect(was).toHaveLength(1);
    await save(draft, changed());
    const { id } = (await publish()) as { id: number };
    expect(await question()).toEqual([]);
    // The others keep their id (the round goes on without it, packages/quiz restoreRound).
    expect(
      await q(`select id from public.quiz_questions where quiz_id = 'practica-bc' order by id`),
    ).toEqual([{ id: 'practica-bc-q1' }]);
    await revert(id);
    expect(await question()).toEqual(was);
  });
});

describe('the draft is not lost without a word', () => {
  it('rebuild_draft() (the end of every migration) stops if the draft has changes that are not published', async () => {
    await save(draft, changed());
    await expect(q('select public.rebuild_draft()')).rejects.toThrow(
      /the draft has changes that are not published \(.*anki_notes.*\)/,
    );
    // A migration that means to lose them says so first.
    await db.transaction(async (tx) => {
      await tx.exec(`set local qv.discard_draft = 'on'`);
      await tx.query('select public.rebuild_draft()');
    });
    expect(await pending()).toEqual([]);
    expect(await q('select * from public.draft_drift()')).toEqual([]);
    // And after publishing there is nothing to lose.
    await save(draft, changed());
    await publish();
    await q('select public.rebuild_draft()');
    expect(await dump('public')).toEqual(await dump('draft'));
  });

  it('only the versions the draft gives itself at each import are not changes', async () => {
    await save(draft, changed());
    await publish();
    await q(`update draft.notes set version = 9, version_at = now()`);
    await q(`update draft.quiz_questions set version = 7`);
    expect(await pending()).toEqual([]);
  });
});

describe('who reaches publishing', () => {
  it('only service_role; the records and the tools are not in the draft', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const sql of [
        `select public.publish_release('{}'::jsonb)`,
        `select public.revert_release('{}'::jsonb)`,
        'select public.release_log(10)',
        'select * from public.draft_pending_changes()',
        'select * from public.releases',
        'select * from public.release_changes',
        'select * from public.release_versions',
      ]) {
        await expect(
          db.transaction(async (tx) => {
            await tx.exec(`set local role ${role}`);
            await tx.query(sql);
          }),
          `${role}: ${sql}`,
        ).rejects.toThrow(/permission denied/);
      }
    }
    await expect(service('select * from public.release_changes')).rejects.toThrow(
      /permission denied/,
    );
    expect(await service('select public.release_log(10) as r')).toEqual([{ r: { releases: [] } }]);
    expect(
      await q(
        `select relname from pg_class where relnamespace = 'draft'::regnamespace
            and relname in ('releases', 'release_changes', 'release_versions')
         union all
         select proname from pg_proc where pronamespace = 'draft'::regnamespace and proname like '%release%'`,
      ),
    ).toEqual([]);
    expect(await q('select * from public.draft_drift()')).toEqual([]);
  });

  it('the log: newest first, and only the last one can be undone', async () => {
    await save(draft, changed());
    await publish();
    const p = changed();
    p.notes[1] = article('AP-BC-C2-09', BC, 'Procesamiento corregido', 2);
    await save(draft, p);
    await publish({ title: 'Otra' });
    const log = (
      await service<{ r: { releases: Record<string, unknown>[] } }>(
        'select public.release_log(10) as r',
      )
    )[0]!.r.releases;
    expect(log.map((r) => [r.id, r.title, r.status, r.canRevert])).toEqual([
      [2, 'Otra', 'published', true],
      [1, 'Biología celular · Certamen 2', 'published', false],
    ]);
    expect(log[0]!.changes).toMatchObject({ notes: { update: 1 } });
  });
});

describe('Revisión de cero (1.7, parte 3)', () => {
  it('undoing after a migration that changed the published tables is refused: its «before» would leave the new column empty', async () => {
    await save(draft, changed());
    const { id } = (await publish()) as { id: number };
    // A migration after publishing: a column, filled for every note, and the draft made again (the end of it).
    await db.exec(`alter table public.anki_notes add column reading text;
      update public.anki_notes set reading = 'lleno';
      select public.rebuild_draft();`);
    const now = await publicContent();
    // Before, it was undone, and the notes the publication had changed came back with reading = null.
    await expect(revert(id)).rejects.toThrow(/revert_release: migrated/);
    expect(await publicContent()).toEqual(now);
    expect(
      await q(`select count(*)::int as n from public.anki_notes where reading is null`),
    ).toEqual([{ n: 0 }]);
    expect(await q(`select status from public.releases`)).toEqual([{ status: 'published' }]);
  });

  it('a draft that differs only in how it was imported (content_meta) is no change, and a migration does not stop for it', async () => {
    await q(
      `update draft.content_meta set value = '[{"kind": "note", "id": "AP-BC-C2-99"}]' where key = 'unpublished'`,
    );
    // The panel calls it equal to what is published (isEmptyRelease: nothing of the site changes), and so does the base.
    expect(await pending()).toEqual([]);
    await expect(publish()).rejects.toThrow(/publish_release: empty/);
    await q('select public.rebuild_draft()');
    // With a real change, it is published with the rest.
    await save(draft, changed());
    await q(
      `update draft.content_meta set value = '[{"kind": "note", "id": "AP-BC-C2-99"}]' where key = 'unpublished'`,
    );
    await publish();
    expect(await dump('public', ['content_meta'])).toEqual(await dump('draft', ['content_meta']));
    expect(await q(`select value from public.content_meta where key = 'unpublished'`)).toEqual([
      { value: [{ kind: 'note', id: 'AP-BC-C2-99' }] },
    ]);
  });

  it('a slug that goes from a piece that leaves to one that comes in is refused with its key, and goes in two steps', async () => {
    const p = everything();
    const old = p.notes[0]!;
    // The importer cannot do it in one import (save_notes before prune_content); in two, the draft has it.
    p.notes.splice(0, 1);
    await save(draft, p);
    p.notes.unshift({ ...article('AP-BC-C2-08P', BC, 'Transcripción', 1), slug: old.slug });
    await save(draft, p);
    const before = { public: await publicContent(), draft: await dump('draft') };
    const error = await publish().then(
      () => null,
      (e: { message: string; detail?: string; code?: string }) => e,
    );
    // Before, a «duplicate key» that the Worker turned into a 500 without a word.
    expect(error?.message).toMatch(/^publish_release: unique$/);
    expect(error?.code).toBe('P0422');
    expect(error?.detail).toMatch(/notes \(notes_slug_key\): Key \(slug\)=\(clase-ap-bc-c2-08\)/);
    expect(await publicContent()).toEqual(before.public);
    expect(await dump('draft')).toEqual(before.draft);
    expect(await q('select * from public.releases')).toEqual([]);
    // The two steps: first without the one that comes in, then with it.
    await service(`select public.discard_draft_assessment($1)`, [BC]);
    const first = everything();
    first.notes.splice(0, 1);
    await save(draft, first);
    await publish();
    await save(draft, p);
    await publish();
    expect(await q(`select id from public.notes where slug = $1`, [old.slug])).toEqual([
      { id: 'AP-BC-C2-08P' },
    ]);
    expect(await dump('public')).toEqual(await dump('draft'));
  });

  it('a content table whose key is an identity: published with its values, its sequence after them, undone byte for byte', async () => {
    // Before, «cannot insert a non-DEFAULT value into column "id"», and public's sequence behind its rows.
    await db.exec(`create table public.glossary (id bigint generated always as identity primary key, term text);
      revoke all on public.glossary from anon, authenticated;
      select public.rebuild_draft();
      insert into public.glossary (term) values ('uno');
      select public.reset_draft();
      insert into draft.glossary (term) values ('dos'), ('tres');`);
    const before = await publicContent();
    const { id } = (await publish()) as { id: number };
    expect(await dump('public')).toEqual(await dump('draft'));
    // The next import after reset_draft() (which gives the draft public's sequence) does not collide.
    await service('select public.reset_draft()');
    expect(await q(`insert into draft.glossary (term) values ('cuatro') returning id`)).toEqual([
      { id: 4 },
    ]);
    await q(`delete from draft.glossary where id = 4`);
    await revert(id);
    expect(await publicContent()).toEqual(before);
  });

  it('a table the draft copies that publishing cannot take (no primary key) stops its migration, not the owner later', async () => {
    await db.exec('begin');
    await db.exec(`create table public.glossary (term text);
      revoke all on public.glossary from anon, authenticated;`);
    // Before, the migration went through and every publication (and undoing) failed afterwards.
    await expect(q('select public.rebuild_draft()')).rejects.toThrow(
      /release_tables: public.glossary has no primary key/,
    );
    await db.exec('rollback');
    // A column publishing cannot compare (json has no equality), also in a table that was there.
    await db.exec('begin');
    await db.exec(`alter table public.notes add column extra json;`);
    await expect(q('select public.rebuild_draft()')).rejects.toThrow(
      /operator does not exist: json = json/,
    );
    await db.exec('rollback');
    expect(await q('select * from public.draft_drift()')).toEqual([]);
  });

  it('a migration that fills data in public does the same in the draft; otherwise it stops (and qv.discard_draft is not the way)', async () => {
    // With everything published: only filling public leaves the draft different, and it stops.
    await db.exec('begin');
    await db.exec(`update public.courses set emoji = '🔬' where id = 'biologia-celular'`);
    await expect(q('select public.rebuild_draft()')).rejects.toThrow(/not published \(courses/);
    await db.exec('rollback');
    // The same in both schemas: it goes through, and the draft is still what is published.
    await db.exec(`update public.courses set emoji = '🔬' where id = 'biologia-celular';
      update draft.courses set emoji = '🔬' where id = 'biologia-celular';
      select public.rebuild_draft();`);
    expect(await pending()).toEqual([]);
    // And with something unpublished in the draft it still stops (what qv.discard_draft would have lost).
    await save(draft, changed());
    await db.exec('begin');
    await db.exec(`update public.courses set emoji = '🧬' where id = 'biologia-celular';
      update draft.courses set emoji = '🧬' where id = 'biologia-celular';`);
    // (anki_browse_indexes, step 3.3, is the first table in the list: the browser's index of the draft changed too)
    await expect(q('select public.rebuild_draft()')).rejects.toThrow(
      /not published \(anki_browse_indexes.*anki_cards/,
    );
    await db.exec('rollback');
  });

  it('a deck under a new parent while the old one leaves, and a card to another assessment: published and undone', async () => {
    const [course, assessmentDeck] = [decksOf(BC).at(-3)!.id, ASSESSMENT_DECK(BC)];
    await db.exec(`insert into draft.anki_decks (id, name, description, parent, course_id, assessment_id, preset,
                                                 position, semester)
        select '5000000000000000020', name || ' (nuevo)', '', '${course}', course_id, assessment_id, preset, 1, semester
          from draft.anki_decks where id = '${assessmentDeck}';
      update draft.anki_decks set parent = '5000000000000000020' where id = '${leafOf(BC)}';
      delete from draft.anki_decks where id = '${assessmentDeck}';
      update draft.anki_cards set deck_id = '${leafOf(AN)}' where note_guid = 'bc-1';`);
    const before = await publicContent();
    const { id, changes } = (await publish()) as {
      id: number;
      changes: Record<string, Record<string, number>>;
    };
    expect(changes.anki_decks).toEqual({ insert: 1, update: 1, delete: 1 });
    expect(await dump('public')).toEqual(await dump('draft'));
    expect(
      await q(`select note_guid, deck_id from public.anki_card_changes order by note_guid`),
    ).toEqual([{ note_guid: 'bc-1', deck_id: leafOf(AN) }]);
    await revert(id);
    expect(await publicContent()).toEqual(before);
    expect(
      await q(`select note_guid, deck_id from public.anki_card_changes order by note_guid`),
    ).toEqual([{ note_guid: 'bc-1', deck_id: leafOf(BC) }]);
  });

  it('two articles that swap their web codes: refused with the key, nothing written', async () => {
    await db.exec(`update draft.notes set code = 'QV-TEMP-1' where id = 'AP-BC-C2-08';
                   update draft.notes set code = 'QV-BC-C2-08' where id = 'AP-BC-C2-09';
                   update draft.notes set code = 'QV-BC-C2-09' where id = 'AP-BC-C2-08';`);
    const before = await publicContent();
    const error = await publish().then(
      () => null,
      (e: { message: string; detail?: string }) => e,
    );
    expect(error?.message).toBe('publish_release: unique');
    expect(error?.detail).toMatch(/notes \(notes_code\)/);
    expect(await publicContent()).toEqual(before);
  });

  it('what publishing writes: the content tables, and nothing else', async () => {
    // Publishing deletes from public whatever the draft does not have. A table added here has to be content (the
    // importer writes it in the draft); a record that something else writes in public (a log, the announcements)
    // goes in draft_exclusions in its migration, or the next publication empties it.
    expect(await tables()).toEqual([
      'anki_note_types',
      'anki_notes',
      'anki_presets',
      'content_meta',
      'semesters',
      'courses',
      'assessments',
      'anki_browse_indexes',
      'anki_decks',
      'anki_cards',
      'notes',
      'note_sections',
      'quizzes',
      'quiz_questions',
    ]);
  });
});

describe('a big publication', () => {
  // B6: 25,000 synthetic notes changed (each with two cards, ~3.5 KB as the real ones), in less than 30 s. PGlite runs
  // Postgres in WebAssembly, in one process: Supabase Micro will be measured in part 4 (docs/configuracion.md).
  it('publishes and undoes 25,000 changed notes in less than 30 s each', async () => {
    const N = 25_000;
    const deck = leafOf(AN);
    const text = (i: number, s: string) =>
      `${s} ${i} ${'Texto de la tarjeta de prueba. '.repeat(40)}`;
    await q(
      `insert into public.anki_notes (guid, note_type_id, fields, tags, code, version, hash, updated_at)
       select 'syn-' || i, '1607392321', jsonb_build_object('Texto', $1 || i || $2), '{}',
              'T-A1-S3-09-' || i, 1, md5('v1-' || i), now()
         from generate_series(1, $3::int) i`,
      ['Original ', ` ${'Texto de la tarjeta de prueba. '.repeat(40)}`, N],
    );
    await q(
      `insert into public.anki_cards (note_guid, ord, deck_id, front_html, back_html, sort_field)
       select 'syn-' || i, o, $1, '<p>' || $2 || i || '</p>', '<p>' || $3 || i || '</p>', 'syn ' || i
         from generate_series(1, $4::int) i, generate_series(0, 1) o`,
      [deck, text(0, 'Frente'), text(0, 'Reverso'), N],
    );
    await service('select public.reset_draft()');
    await q(
      `update draft.anki_notes set fields = jsonb_build_object('Texto', 'Corregido ' || guid), hash = md5('v2-' || guid)
        where guid like 'syn-%'`,
    );
    await q(
      `update draft.anki_cards set front_html = '<p>Corregido ' || note_guid || '</p>' where note_guid like 'syn-%'`,
    );
    const before = await dump('public', ['anki_notes', 'anki_cards']);

    let started = performance.now();
    const r = (await publish()) as { id: number; changes: Record<string, { update: number }> };
    const publishing = performance.now() - started;
    expect(r.changes.anki_notes!.update).toBe(N);
    expect(r.changes.anki_cards!.update).toBe(2 * N);
    expect(await pending()).toEqual([]);

    started = performance.now();
    await revert(r.id);
    const undoing = performance.now() - started;
    expect(await dump('public', ['anki_notes', 'anki_cards'])).toEqual(before);
    console.log(
      `Publicar ${N} notas cambiadas (${2 * N} tarjetas) en PGlite: ${(publishing / 1000).toFixed(1)} s; deshacer: ${(undoing / 1000).toFixed(1)} s.`,
    );
    expect(publishing).toBeLessThan(30_000);
    expect(undoing).toBeLessThan(30_000);
  }, 240_000);
});
