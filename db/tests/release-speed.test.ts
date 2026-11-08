// Plan step 1.7, part 5 (20261113000000_publish_speed.sql): publishing, undoing and the panel, fast enough for
// Supabase, where PostgREST cuts each call at 8 s. PGlite cannot reproduce Supabase's times (another machine, another
// disk, 2 MB of work_mem there), so this proves what the speed comes from: how many times each function reads the big
// tables whole, which grows with all the content of the site and not with what changes (counted with
// pg_stat_get_xact_numscans, the sequential scans of the current transaction). Before this migration, publishing a
// small change read public.anki_cards 11 times and draft.anki_cards 9; undoing, 2. Also: the digests that replace the
// sorted fingerprints, and the last publication made before the migration, which can still be undone.
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
  quiz,
  serviceRpc,
  withHash,
} from './import-fixtures';
import type { Parts } from './import-fixtures';
import { applyMigration, createDatabase } from './pglite';

const MIGRATION = '20261113000000_publish_speed.sql';
const BIG = ['anki_cards', 'anki_notes'];

let db: PGlite;
const store: MediaStore = { has: async () => true, put: async () => {} };
const published = new CloudTarget({ db: serviceRpc(() => db, []), store });
const draft = new CloudTarget({ db: serviceRpc(() => db, [], 'draft'), store });
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

/** A small change: one article and one Anki note corrected. */
const small = (): Parts => {
  const p = everything();
  p.notes[0] = article('AP-BC-C2-08', BC, 'Transcripción corregida', 1);
  p.ankiNotes[0] = ankiNote('bc-1', BC, 'uno corregido');
  return p;
};

async function markAll() {
  const fp = (await service<{ r: string }>('select public.release_fingerprint() as r'))[0]!.r;
  for (const mark of ['phone', 'answers']) {
    await service('select public.set_release_mark($1, $2, true, $3)', [fp, mark, 'dueño']);
  }
  return fp;
}
const publishCall = (fp: string) =>
  `select public.publish_release(jsonb_build_object('fingerprint', '${fp}', 'title', 'Prueba', 'schemaVersion', 1,
     'checks', '{"blocking": 0, "ready": true}'::jsonb, 'by', 'dueño')) as r`;
const revertCall = (id: number) =>
  `select public.revert_release(jsonb_build_object('id', ${id}, 'by', 'dueño')) as r`;

/** Every table a publication takes, as text, for «byte for byte». */
async function publicContent() {
  const out: Record<string, string> = {};
  for (const { tbl } of await q<{ tbl: string }>(
    'select tbl from public.release_tables() order by ord',
  )) {
    out[tbl] = (
      await q<{ r: string }>(
        `select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]')::text as r from public.${tbl} x`,
      )
    )[0]!.r;
  }
  return out;
}

/** How many times `sql` reads each big table whole (sequential scans), in its own transaction, as service_role. */
async function scansOf(sql: string) {
  const counts = `select n.nspname || '.' || c.relname as t, pg_stat_get_xact_numscans(c.oid) as n
                    from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname in ('public', 'draft') and c.relname = any ($1) order by 1`;
  return db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    // (the counters of the transaction start where the last one left them: what counts is the difference)
    const before = (await tx.query<{ t: string; n: string }>(counts, [BIG])).rows;
    const r = (await tx.query<{ r: Record<string, unknown> }>(sql)).rows[0]!.r;
    const after = (await tx.query<{ t: string; n: string }>(counts, [BIG])).rows;
    const scans = Object.fromEntries(
      after.map((a, i) => [a.t, Number(a.n) - Number(before[i]!.n)]),
    );
    return { r, scans };
  });
}

/** A site with some volume (2,000 notes, 4,000 cards), its statistics and the draft equal to it. */
async function withVolume() {
  await save(published, everything());
  await db.exec(`
    insert into public.anki_notes (guid, note_type_id, fields, tags, code, version, hash, updated_at)
    select 'syn-' || i, n.note_type_id, jsonb_build_object('Frente', 'Pregunta ' || i), '{}', 'T-SYN-' || i, 1,
           md5('v1-' || i), now()
      from generate_series(1, 2000) i, (select note_type_id from public.anki_notes limit 1) n;
    insert into public.anki_cards (note_guid, ord, deck_id, front_html, back_html, sort_field)
    select 'syn-' || i, o, c.deck_id, '<p>Frente ' || i || '</p>', '<p>Reverso ' || i || '</p>', 'syn ' || i
      from generate_series(1, 2000) i, generate_series(0, 1) o, (select deck_id from public.anki_cards limit 1) c`);
  await q('analyze');
  await service('select public.reset_draft()');
}

describe('how many times publishing and undoing read the big tables whole', () => {
  beforeEach(async () => {
    db = await createDatabase('content');
    await withVolume();
  });

  it('a small publication reads each big table of each schema at most 4 times, and undoing it, once', async () => {
    await save(draft, small());
    const fp = await markAll();
    const pub = await scansOf(publishCall(fp));
    expect(
      (pub.r as { changes: Record<string, { update: number }> }).changes.anki_notes!.update,
    ).toBe(1);
    // The digest of each schema (one pass) and the insert, update and delete of each table (one pass each). Before
    // part 5: 11 and 9 (the sorted fingerprints, «is it empty», public before and after, «is the draft public»).
    for (const t of BIG) {
      expect(pub.scans[`public.${t}`], `public.${t}`).toBeLessThanOrEqual(4);
      expect(pub.scans[`draft.${t}`], `draft.${t}`).toBeLessThanOrEqual(5);
    }
    const rev = await scansOf(revertCall((pub.r as { id: number }).id));
    // Public checked once against what the publication left; what it puts back, by the rows it touched.
    for (const t of BIG) {
      expect(rev.scans[`public.${t}`], `public.${t}`).toBeLessThanOrEqual(1);
      expect(rev.scans[`draft.${t}`], `draft.${t}`).toBe(0);
    }
  });

  it('the panel’s summary reads each big table of each schema at most 3 times', async () => {
    await save(draft, small());
    const s = await scansOf('select public.release_summary() as r');
    expect(s.r).toHaveProperty('fingerprint');
    for (const t of BIG) {
      expect(s.scans[`public.${t}`], `public.${t}`).toBeLessThanOrEqual(3);
      expect(s.scans[`draft.${t}`], `draft.${t}`).toBeLessThanOrEqual(3);
    }
  });
});

describe('the digests', () => {
  beforeEach(async () => {
    db = await createDatabase('content');
    await save(published, everything());
    await service('select public.reset_draft()');
  });

  it('do not depend on the order of the rows, and come back with the rows', async () => {
    const d = async () =>
      (await q<{ d: unknown }>(`select public.release_digests('draft') as d`))[0]!.d;
    const a = await d();
    expect(a).toEqual(
      await q<{ d: unknown }>(`select public.release_digests('public') as d`).then((r) => r[0]!.d),
    );
    // The same rows written again in another order (another physical order, the same multiset).
    await db.exec(`create temporary table t as select * from draft.anki_cards;
             delete from draft.anki_cards where true;
             insert into draft.anki_cards select * from t order by note_guid desc, ord desc;`);
    expect(await d()).toEqual(a);
    await q(`update draft.anki_cards set front_html = front_html || ' ' where note_guid = 'bc-1'`);
    const b = await d();
    expect(b).not.toEqual(a);
    expect((b as Record<string, unknown>).anki_notes).toEqual(
      (a as Record<string, unknown>).anki_notes,
    );
    await q(
      `update draft.anki_cards set front_html = left(front_html, -1) where note_guid = 'bc-1'`,
    );
    expect(await d()).toEqual(a);
  });

  it('release_fingerprint() is the one publishing checks (a mark made for it lets publish)', async () => {
    await save(draft, small());
    const fp = await markAll();
    const r = (await service<{ r: { id: number } }>(publishCall(fp)))[0]!.r;
    expect(r.id).toBe(1);
    const [row] = await q<{ fingerprint: string; ok: boolean }>(
      `select r.fingerprint, r.public_fingerprint = public.release_schema_fingerprint('public')
              and r.public_digests = public.release_digests('public') as ok
         from public.releases r where r.id = 1`,
    );
    expect(row).toEqual({ fingerprint: fp, ok: true });
  });
});

describe('a publication made before this migration', () => {
  beforeEach(async () => {
    db = await createDatabase('content', [], MIGRATION);
    await save(published, everything());
    await service('select public.reset_draft()');
    await save(draft, small());
  });

  async function publishBefore() {
    const fp = await markAll();
    return (await service<{ r: { id: number } }>(publishCall(fp)))[0]!.r.id;
  }

  it('can still be undone, byte for byte, if public is as it left it', async () => {
    const before = await publicContent();
    const id = await publishBefore();
    expect(await publicContent()).not.toEqual(before);
    await applyMigration(db, 'content', MIGRATION);
    const [r] = await q<{ digests: boolean }>(
      'select before_digests is not null and public_digests is not null as digests from public.releases where id = $1',
      [id],
    );
    expect(r!.digests).toBe(true);
    await service(revertCall(id));
    expect(await publicContent()).toEqual(before);
  });

  it('if public changed after it, the migration leaves it without digests and undoing is refused as before', async () => {
    const id = await publishBefore();
    await q(`update public.anki_notes set fields = fields || '{"Reverso": "8"}', hash = hash || '+'
              where guid = 'an-1'`);
    await q(`update draft.anki_notes set fields = fields || '{"Reverso": "8"}', hash = hash || '+'
              where guid = 'an-1'`);
    await applyMigration(db, 'content', MIGRATION);
    const [r] = await q<{ digests: boolean }>(
      'select public_digests is not null as digests from public.releases where id = $1',
      [id],
    );
    expect(r!.digests).toBe(false);
    await expect(service(revertCall(id))).rejects.toThrow(/revert_release: public_changed/);
  });
});

// ─────────────────────────────── Revisión de cero (1.7, parte 5) ───────────────────────────────

/** A new version of everything (as in publish.test.ts): an article changed and one new, an Anki note changed, one
 * moved to another deck, one taken out and one new, a question changed and one taken out. */
const changed = (): Parts => {
  const p = everything();
  const inDeck = (n: ReturnType<typeof ankiNote>, deckId: string) => {
    const { hash: _hash, updatedAt, ...rest } = n;
    return {
      ...withHash({ ...rest, cards: rest.cards.map((c) => ({ ...c, deckId })) }),
      updatedAt,
    };
  };
  p.notes[0] = article('AP-BC-C2-08', BC, 'Transcripción corregida', 1);
  p.notes.push(article('AP-BC-C2-10', BC, 'Núcleo', 3));
  p.ankiNotes = p.ankiNotes.filter((n) => n.guid !== 'bc-3');
  p.ankiNotes[0] = ankiNote('bc-1', BC, 'uno corregido');
  p.ankiNotes[1] = inDeck(ankiNote('bc-2', BC, 'dos'), decksOf(BC).at(-2)!.id);
  p.ankiNotes.push(ankiNote('an-2', AN, 'cinco'));
  p.quizzes[0] = quiz('practica-bc', BC, ['¿Uno, de otra forma?']);
  return p;
};
const publishNow = async () => {
  const fp = await markAll();
  return (await service<{ r: { id: number } }>(publishCall(fp)))[0]!.r;
};
/** A trigger of public whose function is outside public (the draft does not copy it, and the shape stays the same). */
const trigger = (sql: string) =>
  db.exec(`create schema if not exists probe;
           create or replace function probe.skip() returns trigger language plpgsql as $$ begin return null; end $$;
           create or replace function probe.again() returns trigger language plpgsql as $$
             begin insert into public.quiz_questions select (old).*; return null; end $$;
           ${sql}`);

describe('Revisión de cero (1.7, parte 5)', () => {
  beforeEach(async () => {
    db = await createDatabase('content');
    await save(published, everything());
    await service('select public.reset_draft()');
  });

  // Before, «the draft is what is published» was looked at only in the rows publishing wrote: a row a trigger did not
  // let in (or out) was not written, so nobody looked at it, and public was left different from the draft.
  it('a row of public that publishing could not write in, or take out, refuses the publication (nothing written)', async () => {
    await save(draft, changed());
    const before = await publicContent();
    await trigger(`create trigger probe_in before insert on public.anki_cards for each row
                     when (new.note_guid = 'an-2') execute function probe.skip();`);
    await expect(publishNow()).rejects.toThrow(
      /after publishing, the draft is not what is published: anki_cards/,
    );
    await db.exec('drop trigger probe_in on public.anki_cards');
    await trigger(`create trigger probe_out before delete on public.quiz_questions for each row
                     execute function probe.skip();`);
    await expect(publishNow()).rejects.toThrow(
      /after publishing, the draft is not what is published: quiz_questions/,
    );
    await db.exec('drop trigger probe_out on public.quiz_questions');
    // A row taken out that comes back (it is in release_changes as deleted): the digest after reads it too.
    await trigger(`create trigger probe_back after delete on public.quiz_questions for each row
                     execute function probe.again();`);
    await expect(publishNow()).rejects.toThrow(
      /after publishing, the draft is not what is published: quiz_questions/,
    );
    await db.exec('drop trigger probe_back on public.quiz_questions');
    expect(await publicContent()).toEqual(before);
    expect(await q('select * from public.releases')).toEqual([]);
    // Without them, the same draft is published.
    expect((await publishNow()).id).toBe(1);
  });

  // Before, undoing looked at what it put back (the rows updated and deleted by the publication), not at the rows the
  // publication had added: one that stayed was not seen.
  it('undoing that could not take out a row the publication added is refused (public as the publication left it)', async () => {
    await save(draft, changed());
    const { id } = await publishNow();
    const after = await publicContent();
    await trigger(`create trigger probe_stay before delete on public.notes for each row
                     when (old.id = 'AP-BC-C2-10') execute function probe.skip();`);
    await expect(service(revertCall(id))).rejects.toThrow(
      /after undoing, public is not what it was before the publication/,
    );
    await db.exec('drop trigger probe_stay on public.notes');
    expect(await publicContent()).toEqual(after);
    await service(revertCall(id));
  });

  // The row checks of publishing and undoing look only at the rows they write: a trigger or a foreign key action of a
  // published table that writes other rows would leave public different from the draft (or from before) without
  // anybody seeing it. These are the ones there are; a new one has to be checked against those row checks first.
  it('the triggers and foreign key actions of the tables a publication writes are the known ones', async () => {
    const triggers = await q<{ t: string }>(
      `select c.relname || '.' || g.tgname || ' ' || p.proname as t
         from public.release_tables() x
         join pg_class c on c.oid = format('public.%I', x.tbl)::regclass
         join pg_trigger g on g.tgrelid = c.oid and not g.tgisinternal
         join pg_proc p on p.oid = g.tgfoid
        order by 1`,
    );
    expect(triggers.map((r) => r.t)).toEqual([
      'anki_cards.anki_card_added anki_card_changed',
      'anki_cards.anki_card_moved anki_card_changed',
      'anki_cards.anki_card_removed anki_card_changed',
      'notes.notes_restore_version restore_note_version',
    ]);
    // On delete only «no action» or «cascade» (publishing deletes the children first, undoing restores them first),
    // on update only «no action», and always to the primary key of the parent.
    const keys = await q<{ fk: string; del: string; upd: string; to_pk: boolean }>(
      `select c.conrelid::regclass::text || ' → ' || c.confrelid::regclass::text as fk, c.confdeltype as del,
              c.confupdtype as upd,
              exists (select from pg_constraint k where k.conrelid = c.confrelid and k.contype = 'p'
                         and k.conkey = c.confkey) as to_pk
         from pg_constraint c
        where c.contype = 'f' and c.conrelid in (select format('public.%I', x.tbl)::regclass
                                                   from public.release_tables() x)
        order by 1`,
    );
    expect(keys.filter((k) => !['a', 'c'].includes(k.del) || k.upd !== 'a' || !k.to_pk)).toEqual(
      [],
    );
  });
});

describe('Revisión de cero (1.7, parte 5): the migration on a database like production', () => {
  /** Everything of public a publication or its undoing may touch, with the records, as text. */
  async function everythingOf(schema: 'public' | 'draft') {
    const names = (
      await q<{ tbl: string }>('select tbl from public.release_tables() order by ord')
    ).map((r) => r.tbl);
    if (schema === 'public') {
      names.push(
        'unpublished_note_versions',
        'anki_card_changes',
        'release_versions',
        'release_changes',
      );
    }
    const out: Record<string, string> = {};
    for (const t of names) {
      out[t] = (
        await q<{ r: string }>(
          `select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]')::text as r from ${schema}.${t} x`,
        )
      )[0]!.r;
    }
    return out;
  }
  const releases = () =>
    q<Record<string, unknown>>(
      `select id, status, title, schema_version, fingerprint, before_fingerprint, public_fingerprint, shape, checks,
              changes, published_by, published_at, reverted_by, reverted_at
         from public.releases order by id`,
    );
  const summary = async () => {
    const { fingerprint: _fp, ...rest } = (
      await service<{ r: Record<string, unknown> }>('select public.release_summary() as r')
    )[0]!.r;
    return rest;
  };
  const log = async () =>
    (await service<{ r: unknown }>('select public.release_log(50) as r'))[0]!.r;

  // Production on 7-11-2026: release 1 published and undone, the same change published again as release 2 (with its
  // release_changes), and the draft equal to what is published.
  it('keeps the records, the panel and the content as they were, and release 2 can be undone byte for byte', async () => {
    db = await createDatabase('content', [], MIGRATION);
    await save(published, everything());
    await service('select public.reset_draft()');
    const original = await everythingOf('public');
    await save(draft, small());
    const first = await publishNow();
    await service(revertCall(first.id));
    const second = await publishNow();
    expect(second.id).toBe(2);
    const before = {
      public: await everythingOf('public'),
      draft: await everythingOf('draft'),
      releases: await releases(),
      summary: await summary(),
      log: await log(),
    };

    await applyMigration(db, 'content', MIGRATION);
    expect(await q('select * from public.draft_drift()')).toEqual([]);
    expect(await q('select * from public.draft_pending_changes()')).toEqual([]);
    expect(await everythingOf('public')).toEqual(before.public);
    expect(await everythingOf('draft')).toEqual(before.draft);
    expect(await summary()).toEqual(before.summary);
    expect(await log()).toEqual(before.log);
    // Release 1 (undone) is as it was; release 2 got its digests and its fingerprints in the new format.
    const after = await releases();
    expect(after[0]).toEqual(before.releases[0]);
    const { before_fingerprint: _b, public_fingerprint: _p, ...rest2 } = after[1]!;
    const { before_fingerprint: _bb, public_fingerprint: _pp, ...was2 } = before.releases[1]!;
    expect(rest2).toEqual(was2);
    expect(
      await q(`select public_fingerprint = public.release_schema_fingerprint('public') as now,
                      public_digests = public.release_digests('public') as digests,
                      before_digests is not null as before
                 from public.releases where id = 2`),
    ).toEqual([{ now: true, digests: true, before: true }]);

    await service(revertCall(2));
    const {
      release_changes: _rc,
      anki_card_changes: _ac,
      release_versions: _rv,
      ...back
    } = await everythingOf('public');
    const {
      release_changes: _orc,
      anki_card_changes: _oac,
      release_versions: _orv,
      ...was
    } = original;
    expect(back).toEqual(was);
    // And the next one is published and undone as always.
    const third = await publishNow();
    expect(third.id).toBe(3);
    // (its article goes to version 4: the 2 and the 3 were given by publications that were undone)
    expect(await q(`select version from public.notes where id = 'AP-BC-C2-08'`)).toEqual([
      { version: 4 },
    ]);
    await service(revertCall(3));
    const {
      release_changes: _x,
      anki_card_changes: _y,
      release_versions: _z,
      ...again
    } = await everythingOf('public');
    expect(again).toEqual(was);
  });

  it('the panel says the same, page by page, with and without the migration (but the fingerprint)', async () => {
    const panel = async () => ({
      summary: await summary(),
      pages: await service<{ r: unknown }>(
        `select public.release_items($1, 'card') as r union all select public.release_items($1, 'article')
         union all select public.release_items($1, 'question') union all select public.release_items($2, 'card')
         union all select public.release_texts() union all select public.release_media()`,
        [BC, AN],
      ),
    });
    const of = async (until?: string) => {
      db = await createDatabase('content', [], until);
      await save(published, everything());
      await service('select public.reset_draft()');
      await save(draft, changed());
      return panel();
    };
    const old = await of(MIGRATION);
    const now = await of();
    expect(now.summary).toEqual(old.summary);
    expect(now.pages).toEqual(old.pages);
    expect((now.summary.assessments as unknown[]).length).toBeGreaterThan(0);
  });
});
