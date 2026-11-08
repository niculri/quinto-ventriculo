// Plan step 1.7, part 1 (B1 + B2): the draft (20261109000000_draft.sql + `npm run import -- --target draft`).
// The drift test (draft and public have to be the same structure, and every migration from that one on makes the
// draft again), the real CloudTarget writing in the draft through `draft.<fn>` as supabase-js `schema('draft').rpc`
// does, reset_draft(), discarding one assessment, npm run unpublish on both, and the privileges.
import { readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CloudTarget, draftReviewUrl, unpublish } from '@qv/importer';
import type { Manifest, MediaRemover, MediaStore, SaveScope } from '@qv/importer';
import {
  AN,
  BC,
  ankiNote,
  article,
  bundleOf,
  everything,
  leafOf,
  only,
  quiz,
  serviceRpc,
} from './import-fixtures';
import type { Parts } from './import-fixtures';
import { applyMigration, asUser, createDatabase } from './pglite';

const MIGRATION = '20261109000000_draft.sql';
const MIGRATIONS = join(import.meta.dirname, '..', 'content', 'supabase', 'migrations');

let db: PGlite;
const calls: { fn: string; args: Record<string, unknown> }[] = [];
const stored = new Map<string, Buffer>();
const store: MediaStore & MediaRemover = {
  async has(key) {
    return stored.has(key);
  },
  async put(key, body) {
    stored.set(key, body);
  },
  async delete(key) {
    stored.delete(key);
  },
};
const publicRpc = serviceRpc(() => db, calls);
const draftRpc = serviceRpc(() => db, calls, 'draft');
const published = new CloudTarget({ db: publicRpc, store });
const draft = new CloudTarget({ db: draftRpc, store });

const save = (target: CloudTarget, p: Parts, scope?: SaveScope) => {
  const { bundle, media } = bundleOf(p);
  calls.length = 0;
  return target.save(bundle, media, scope);
};
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;
const service = async <T>(sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return (await tx.query<T>(sql, params)).rows;
  });

/** Every row of every table of a schema (and its sequences), as text: for «byte for byte». */
async function dump(schema: string) {
  const out: Record<string, string> = {};
  const relations = await q<{ name: string; kind: string }>(
    `select c.relname as name, c.relkind::text as kind from pg_class c
      where c.relnamespace = $1::regnamespace and c.relkind in ('r', 'S') order by 1`,
    [schema],
  );
  for (const { name, kind } of relations) {
    out[`${kind} ${name}`] =
      kind === 'S'
        ? JSON.stringify(await q(`select last_value, is_called from ${schema}."${name}"`))
        : (
            await q<{ r: string }>(
              `select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]')::text as r
                 from ${schema}."${name}" x`,
            )
          )[0]!.r;
  }
  return out;
}

/** The copied tables of a schema and what every read of the API and of the importer gives there. */
async function reads(schema: 'public' | 'draft') {
  const tables = (
    await q<{ name: string }>(
      `select name from public.draft_mirror() where kind = 'table' order by name`,
    )
  ).map((r) => r.name);
  const out: Record<string, unknown> = {};
  for (const t of tables) {
    out[t] = (
      await q<{ r: string }>(
        `select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]')::text as r
           from ${schema}.${t} x`,
      )
    )[0]!.r;
  }
  const one = async (sql: string, params: unknown[] = []) =>
    JSON.stringify(await service(sql.replaceAll('@.', `${schema}.`), params));
  out.search = await one(`select * from @.search_notes('transcripción', 50)`);
  out.quiz = await one(`select @.quiz_detail('practica-bc') as r`);
  out.section = await one(`select @.quiz_section('practica-bc', 'all') as r`);
  out.tree = await one(`select * from @.anki_deck_tree()`);
  out.summaries = await one(`select * from @.anki_deck_summaries() order by id`);
  out.deck = await one(`select @.anki_deck_detail($1) as r`, [leafOf(BC)]);
  out.oldDeck = await one(`select @.anki_deck($1) as r`, [leafOf(AN)]);
  out.browse = await one(`select @.anki_browse_notes() as r`);
  out.card = await one(`select @.anki_card('bc-1', 0) as r`);
  out.state = await one(`select @.import_state(null, null) as r`);
  out.changes = await one(`select @.anki_card_changes_since(0, 5000) as r`);
  return out;
}

/** What an assessment has in a schema: its row, articles, tests, decks and Anki notes (with their cards). */
async function ofAssessment(schema: 'public' | 'draft', a: string) {
  const rows = (sql: string) =>
    q<{ r: string }>(
      `select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]')::text as r from (${sql.replaceAll(
        '@.',
        `${schema}.`,
      )}) x`,
      [a],
    ).then((r) => r[0]!.r);
  return {
    assessment: await rows('select * from @.assessments where id = $1'),
    notes: await rows('select * from @.notes where assessment_id = $1'),
    sections: await rows(
      'select s.note_id, s.position, s.body from @.note_sections s join @.notes n on n.id = s.note_id where n.assessment_id = $1',
    ),
    quizzes: await rows('select * from @.quizzes where assessment_id = $1'),
    questions: await rows(
      'select qq.* from @.quiz_questions qq join @.quizzes z on z.id = qq.quiz_id where z.assessment_id = $1',
    ),
    decks: await rows('select * from @.anki_decks where assessment_id = $1'),
    ankiNotes: await rows(
      `select n.* from @.anki_notes n where exists (select from @.anki_cards c join @.anki_decks d on d.id = c.deck_id
         where c.note_guid = n.guid and d.assessment_id = $1)`,
    ),
    cards: await rows(
      'select c.* from @.anki_cards c join @.anki_decks d on d.id = c.deck_id where d.assessment_id = $1',
    ),
  };
}

/** A new version of everything: changes in both assessments (an article changed and one new, an Anki note changed,
 * one new and one taken out, a test changed). */
const changed = (): Parts => {
  const p = everything();
  p.notes[0] = article('AP-BC-C2-08', BC, 'Transcripción corregida', 1);
  p.notes.push(article('AP-BC-C2-10', BC, 'Núcleo', 3));
  p.notes[2] = article('AP-A1-S3-01', AN, 'Columna vertebral', 1);
  p.ankiNotes = p.ankiNotes.filter((n) => n.guid !== 'bc-3');
  p.ankiNotes[0] = ankiNote('bc-1', BC, 'uno corregido');
  p.ankiNotes.push(ankiNote('an-2', AN, 'cinco'));
  p.quizzes[1] = quiz('practica-an', AN, ['¿Tres?', '¿Cuatro?']);
  return p;
};

describe('the drift test', () => {
  beforeEach(async () => {
    db = await createDatabase('content');
  });

  it('draft and public are the same after every migration (draft_drift gives nothing)', async () => {
    expect(await q('select * from public.draft_drift()')).toEqual([]);
    // Everything of the content is there: 14 tables (12 of content, the card changes and, from step 1.7 part 2,
    // content_meta) and every function.
    const mirror = await q<{ kind: string; n: number }>(
      `select kind, count(*)::int as n from public.draft_mirror() group by kind order by kind`,
    );
    const inDraft = await q<{ tables: number; functions: number; triggers: number }>(
      `select (select count(*)::int from pg_class where relnamespace = 'draft'::regnamespace and relkind = 'r') as tables,
              (select count(*)::int from pg_proc where pronamespace = 'draft'::regnamespace) as functions,
              (select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid
                where c.relnamespace = 'draft'::regnamespace and not t.tgisinternal) as triggers`,
    );
    expect(Object.fromEntries(mirror.map((m) => [m.kind, m.n]))).toMatchObject({
      table: 14,
      sequence: 1,
      function: inDraft[0]!.functions,
    });
    expect(inDraft[0]).toMatchObject({ tables: 14, triggers: 3 });
    // What is not content stays only in public.
    const missing = await q<{ name: string }>(
      `select c.relname as name from pg_class c where c.relnamespace = 'draft'::regnamespace
          and c.relname in ('unpublish_log', 'unpublished_note_versions', 'draft_exclusions')
       union all
       select p.proname from pg_proc p where p.pronamespace = 'draft'::regnamespace
          and p.proname in ('unpublish_content', 'restore_note_version', 'reset_draft', 'rebuild_draft')`,
    );
    expect(missing).toEqual([]);
  });

  it.each([
    [
      'a column added to public',
      'alter table public.notes add column extra text',
      { object: 'column', name: 'notes.extra', problem: 'missing in draft' },
    ],
    [
      'a column of the draft with another type',
      'alter table draft.anki_cards alter column sort_field type varchar(500)',
      { object: 'column', name: 'anki_cards.sort_field' },
    ],
    [
      'a default changed in public',
      `alter table public.anki_decks alter column description set default 'x'`,
      { object: 'column', name: 'anki_decks.description' },
    ],
    [
      'a constraint missing in the draft',
      'alter table draft.quizzes drop constraint quizzes_assessment_id_slug_key',
      { object: 'constraint', name: 'quizzes.quizzes_assessment_id_slug_key' },
    ],
    [
      'a check constraint changed in public',
      `alter table public.semesters drop constraint semesters_number_check,
         add constraint semesters_number_check check (number between 1 and 20)`,
      { object: 'constraint', name: 'semesters.semesters_number_check' },
    ],
    [
      'an index missing in the draft',
      'drop index draft.notes_assessment',
      { object: 'index', name: 'notes.notes_assessment', problem: 'missing in draft' },
    ],
    [
      'a function changed in public',
      `create or replace function public.anki_plain_text(html text) returns text language sql immutable
         set search_path = '' as $$ select lower(html) $$`,
      { object: 'function', name: 'anki_plain_text(html text)' },
    ],
    [
      'a new overload in public',
      `create function public.anki_card(note_guid text) returns jsonb language sql stable set search_path = ''
         as $$ select public.anki_card(note_guid, 0) $$`,
      { object: 'function', name: 'anki_card(note_guid text)', problem: 'missing in draft' },
    ],
    [
      'a new table in public',
      'create table public.glossary (term text primary key)',
      { object: 'table', name: 'glossary', problem: 'missing in draft' },
    ],
    [
      'a trigger turned off in the draft',
      'alter table draft.anki_cards disable trigger anki_card_added',
      { object: 'trigger', name: 'anki_cards.anki_card_added' },
    ],
    [
      'row level security off in the draft',
      'alter table draft.notes disable row level security',
      { object: 'table', name: 'notes' },
    ],
    [
      'a privilege of service_role that the draft lacks',
      'revoke select on draft.notes from service_role',
      { object: 'privilege', name: 'service_role on table notes' },
    ],
    [
      'a copy that still points to public',
      `create or replace function draft.anki_plain_text(html text) returns text language sql immutable
         set search_path = '' as $$ select html from public.notes limit 0 $$`,
      { object: 'guard', problem: 'points to public: public.notes' },
    ],
    [
      'anon with a privilege on the draft',
      'grant usage on schema draft to anon',
      { object: 'guard', name: 'anon on schema draft' },
    ],
    [
      'a tool of the draft that is not excluded',
      `create function public.publish_something() returns void language sql set search_path = ''
         as $$ select from draft.notes $$`,
      { object: 'guard', name: 'publish_something()' },
    ],
    // Revisión de cero (1.7, parte 1): kinds of difference the list above did not try.
    [
      'a sequence changed in the draft',
      'alter sequence draft.anki_card_change_seq increment by 2',
      { object: 'sequence', name: 'anki_card_change_seq' },
    ],
    [
      'a NOT NULL dropped in the draft',
      'alter table draft.notes alter column title drop not null',
      { object: 'column', name: 'notes.title' },
    ],
    [
      'a policy in public',
      'create policy anyone on public.notes for select using (true)',
      { object: 'table', name: 'notes' },
    ],
    // Revisión de cero (1.7, parte 1): what the draft does not copy and drift used to miss (a view the API could read
    // with from()), and copies that reach public in ways the old guard did not see.
    [
      'a view in public that the draft does not copy',
      'create view public.notes_list as select id from public.notes',
      { object: 'guard', name: 'view notes_list' },
    ],
    [
      'a copy that points to PUBLIC in capitals',
      `create or replace function draft.anki_plain_text(html text) returns text language sql immutable
         set search_path = '' as $$ select html from PUBLIC.notes limit 0 $$`,
      { object: 'guard', problem: 'points to public: PUBLIC.notes' },
    ],
    [
      'a copy that names the schema in a string',
      `create or replace function draft.anki_plain_text(html text) returns text language plpgsql immutable
         set search_path = '' as $$ begin execute format('select 1 from %I.notes', 'public'); return html; end $$`,
      { object: 'guard', name: 'function anki_plain_text(html text)' },
    ],
    [
      'a function without search_path, copied',
      `create or replace function public.anki_plain_text(html text) returns text language sql immutable
         as $$ select html $$;
       select public.rebuild_draft();`,
      {
        object: 'guard',
        name: 'function anki_plain_text(html text)',
        problem: expect.stringMatching(/search_path/),
      },
    ],
  ])('finds %s', async (_what, sql, expected) => {
    await db.exec(sql);
    const rows = await q<{ object: string; name: string; problem: string }>(
      'select * from public.draft_drift()',
    );
    expect(rows).toContainEqual(expect.objectContaining(expected));
  });

  it('rebuild_draft() makes the draft equal again (what the end of a migration does)', async () => {
    await db.exec(`alter table public.notes add column extra text;
      create table public.glossary (term text primary key, note_id text references public.notes (id));
      create or replace function public.anki_plain_text(html text) returns text language sql immutable
        set search_path = '' as $$ select lower(html) $$;
      drop index draft.notes_assessment;`);
    expect((await q('select * from public.draft_drift()')).length).toBeGreaterThan(0);
    await q('select public.rebuild_draft()');
    expect(await q('select * from public.draft_drift()')).toEqual([]);
    expect(await q(`select draft.anki_plain_text('ABC') as r`)).toEqual([{ r: 'abc' }]);
  });

  it('a table that points to one the draft does not copy stops rebuild_draft()', async () => {
    await db.exec(
      `create table public.notes_flags (id bigint references public.unpublish_log (id))`,
    );
    await expect(q('select public.rebuild_draft()')).rejects.toThrow(
      /points to a table that the draft does not copy/,
    );
  });

  // Revisión de cero (1.7, parte 1): `drop schema draft cascade` dropped, without a word, what outside the draft
  // depended on it (a view, a function with a SQL-standard body, a foreign key of public).
  it('rebuild_draft() stops instead of dropping what outside the draft depends on it', async () => {
    for (const sql of [
      'create view public.draft_notes as select id from draft.notes',
      `create function public.draft_count() returns bigint language sql
         begin atomic select count(*) from draft.notes; end`,
      'create table public.flags (note_id text references draft.notes (id))',
    ]) {
      await db.exec('begin');
      await db.exec(sql);
      await expect(q('select public.rebuild_draft()'), sql).rejects.toThrow(
        /outside the draft depend on it/,
      );
      await db.exec('rollback');
    }
    expect(await q('select * from public.draft_drift()')).toEqual([]);
  });

  // Revisión de cero (1.7, parte 1): reset_draft() did not move the identity sequences of the draft, so the first
  // row written in the draft of a content table with an identity collided with the copied ones.
  it('reset_draft() leaves the identity sequences after the copied rows', async () => {
    await db.exec(`create table public.glossary (id bigint generated always as identity primary key, term text);
      revoke all on public.glossary from anon, authenticated;
      select public.rebuild_draft();
      insert into public.glossary (term) values ('uno'), ('dos');
      select public.reset_draft();`);
    expect(await q(`insert into draft.glossary (term) values ('tres') returning id`)).toEqual([
      { id: 3 },
    ]);
    expect(await q('select * from public.draft_drift()')).toEqual([]);
  });

  it('every migration from the draft’s on ends making the draft again', () => {
    const files = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql') && f >= MIGRATION)
      .sort();
    expect(files[0]).toBe(MIGRATION);
    for (const f of files) {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8').trimEnd();
      expect(sql.endsWith('select public.rebuild_draft();'), f).toBe(true);
      // Step 1.7, part 3: rebuild_draft() stops if the draft has changes that are not published. A migration that
      // means to lose them says so only for itself (`set local`, its own transaction), never for the whole session.
      const code = sql.replace(/--.*$/gm, '');
      for (const m of code.matchAll(
        /^\s*set\s+(?:session\s+|local\s+)?qv\.discard_draft\b.*$/gim,
      )) {
        expect(m[0].trim(), f).toBe("set local qv.discard_draft = 'on';");
      }
      expect(code, f).not.toMatch(/set_config\(\s*'qv\.discard_draft'/i);
    }
  });
});

describe('the draft with content', () => {
  beforeEach(async () => {
    db = await createDatabase('content');
    stored.clear();
    await save(published, everything());
    await service('select public.reset_draft()');
  });

  it('reset_draft() leaves every read of the draft equal to public’s', async () => {
    expect(await reads('draft')).toEqual(await reads('public'));
    await save(draft, changed());
    expect(await reads('draft')).not.toEqual(await reads('public'));
    const counts = (
      await service<{ r: Record<string, number> }>('select public.reset_draft() as r')
    )[0]!.r;
    expect(counts).toMatchObject({ notes: 3, anki_notes: 4, anki_cards: 4, quizzes: 2 });
    expect(await reads('draft')).toEqual(await reads('public'));
    expect(await q('select * from public.draft_drift()')).toEqual([]);
  });

  it('importing to the draft leaves public byte for byte as it was, and the draft with the new content', async () => {
    const before = await dump('public');
    const report = await save(draft, changed());
    expect(report).toMatchObject({
      changedNotes: ['AP-BC-C2-08', 'AP-A1-S3-01', 'AP-BC-C2-10'],
      removedCards: 1,
      // The draft records its own card changes: bc-3 left it.
      retiredCards: 1,
    });
    expect(calls.every((c) => c.fn !== 'reset_draft')).toBe(true);
    expect(await dump('public')).toEqual(before);
    // The images are uploaded as always (R2 is one: publishing does not touch them).
    expect(stored.has('notes/ap-bc-c2-10.webp')).toBe(true);
    // The draft has it all; public, nothing of it.
    expect(
      await q(
        `select id, version from draft.notes where id in ('AP-BC-C2-08', 'AP-BC-C2-10') order by id`,
      ),
    ).toEqual([
      { id: 'AP-BC-C2-08', version: 2 },
      { id: 'AP-BC-C2-10', version: 1 },
    ]);
    expect(await q(`select id from public.notes where id = 'AP-BC-C2-10'`)).toEqual([]);
    expect(await q(`select guid from draft.anki_notes where guid = 'bc-3'`)).toEqual([]);
    expect(await q(`select count(*)::int as n from public.anki_card_changes`)).toEqual([{ n: 0 }]);

    // By assessment, and again without changes: the same 4 calls as always, and public still the same.
    await save(draft, only(changed(), AN), {
      notes: true,
      decks: true,
      tests: true,
      assessments: [AN],
    });
    expect(calls.map((c) => c.fn)).toEqual([
      'import_state',
      'sync_catalog',
      'save_anki_catalog',
      'prune_content',
    ]);
    expect(await dump('public')).toEqual(before);
  });

  it('discarding one assessment brings back only that one, and a new one leaves the draft', async () => {
    await save(draft, changed());
    const otherBefore = await ofAssessment('draft', AN);
    expect(await ofAssessment('draft', BC)).not.toEqual(await ofAssessment('public', BC));
    const typesBefore = await q('select * from draft.anki_note_types order by id');

    const [discarded] = await service<{ r: Record<string, unknown> }>(
      `select public.discard_draft_assessment($1) as r`,
      [BC],
    );
    const r = discarded!.r;
    expect(r).toMatchObject({
      assessment: BC,
      published: true,
      removed: { notes: 3, quizzes: 1, ankiNotes: 2, decks: 2 },
      restored: { notes: 2, quizzes: 1, ankiNotes: 3, decks: 2 },
    });
    expect(await ofAssessment('draft', BC)).toEqual(await ofAssessment('public', BC));
    expect(await ofAssessment('draft', AN)).toEqual(otherBefore);
    expect(await q('select * from draft.anki_note_types order by id')).toEqual(typesBefore);

    // Discarding the other one too: the draft is what is published.
    await service(`select public.discard_draft_assessment($1)`, [AN]);
    const tables = await reads('draft');
    const pub = await reads('public');
    // The draft's own record of card changes keeps what happened in it (bc-3 left and came back).
    expect({ ...tables, anki_card_changes: null, changes: null, state: null }).toEqual({
      ...pub,
      anki_card_changes: null,
      changes: null,
      state: null,
    });

    // An assessment that is only in the draft leaves it.
    const extra = 'anatomia-1/certamen-2';
    const { bundle, media } = bundleOf(everything());
    bundle.assessments.push({ id: extra, courseId: 'anatomia-1', name: 'Certamen 2', position: 2 });
    bundle.notes.push({
      ...article('AP-A1-S6-01', extra, 'Hombro', 1),
    } as (typeof bundle.notes)[number]);
    media.set('notes/ap-a1-s6-01.webp', media.get('notes/ap-a1-s3-01.webp')!);
    await draft.save(bundle, media);
    expect(await q(`select id from draft.notes where assessment_id = $1`, [extra])).toHaveLength(1);
    await service(`select public.discard_draft_assessment($1)`, [extra]);
    expect(await q(`select id from draft.assessments where id = $1`, [extra])).toEqual([]);
    expect(await q(`select id from draft.notes where assessment_id = $1`, [extra])).toEqual([]);
    await expect(service(`select public.discard_draft_assessment('nada/x')`)).rejects.toThrow(
      /neither in the draft nor published/,
    );
  });

  // Revisión de cero (1.7, parte 1): discarding one assessment brought back from public every preset and note type
  // the draft did not use (also another assessment's, taken out by its import) and took out every empty deck above
  // the assessments that the draft made (also another course's).
  it('discarding one assessment leaves alone the shared pieces it does not use', async () => {
    await db.exec(`
      insert into public.anki_presets (name, config) values ('Gymkana', '{}');
      insert into public.anki_note_types (id, name, kind, occlusion, fields, templates, css, sort_field)
        select '999', 'Otra', kind, occlusion, fields, templates, css, sort_field
          from public.anki_note_types limit 1;`);
    await save(draft, changed());
    // A deck above the assessments that another import left empty in the draft.
    await db.exec(`insert into draft.anki_decks
        (id, name, description, parent, semester, course_id, assessment_id, preset, position)
      values ('5000000000000000010', '() Medicina UCH::1° Semestre::🧠 Otro', '', '1000000000000000010', 1, null,
              null, 'Default', 0);`);
    const shared = async () => ({
      presets: await q('select * from draft.anki_presets order by name'),
      types: await q('select id from draft.anki_note_types order by id'),
      other: await q(`select id from draft.anki_decks where id = '5000000000000000010'`),
    });
    const before = await shared();
    await service(`select public.discard_draft_assessment($1)`, [BC]);
    expect(await shared()).toEqual(before);
    expect(await ofAssessment('draft', BC)).toEqual(await ofAssessment('public', BC));
  });

  // Revisión de cero (1.7, parte 1): the assessment's row came back column by column from a fixed list, so a column a
  // later migration adds stayed as the draft had it.
  it('discarding one assessment brings back every column of its row, also one added later', async () => {
    await db.exec(`alter table public.assessments add column note text not null default '';
      select public.rebuild_draft();`);
    await db.exec(
      `update draft.assessments set name = 'Otro nombre', note = 'del borrador' where id = '${BC}'`,
    );
    await service(`select public.discard_draft_assessment($1)`, [BC]);
    expect(await q(`select * from draft.assessments where id = $1`, [BC])).toEqual(
      await q(`select * from public.assessments where id = $1`, [BC]),
    );
  });

  // Revisión de cero (1.7, parte 1): the card triggers of both schemas took the same advisory lock. An import to the
  // draft that had written a card (and waited for that lock) and `npm run unpublish` of a deck (which held it and then
  // deleted that same card of the draft) waited for each other: a deadlock, and Postgres could abort the unpublish.
  // Each schema numbers its own changes, so each takes its own lock.
  it('the card triggers of the draft take their own lock, not public’s', async () => {
    const locks = (sql: string) =>
      db.transaction(async (tx) => {
        await tx.exec(sql);
        return (
          await tx.query<{ schema: string | null }>(
            `select case l.key when hashtextextended('public.anki_card_changes', 0) then 'public'
                               when hashtextextended('draft.anki_card_changes', 0) then 'draft' end as schema
               from (select (classid::bigint << 32) | objid::bigint as key
                       from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()) l`,
          )
        ).rows.map((r) => r.schema);
      });
    expect(await locks(`delete from draft.anki_cards where note_guid = 'bc-1'`)).toEqual(['draft']);
    expect(await locks(`delete from public.anki_cards where note_guid = 'bc-1'`)).toEqual([
      'public',
    ]);
  });

  it('npm run unpublish takes the piece out of the draft too, also one that is only in the draft', async () => {
    await save(draft, changed());
    const folder = await mkdtemp(join(tmpdir(), 'qv-draft-'));
    try {
      const listFile = join(folder, 'unpublished.json');
      await writeFile(listFile, '{\n  "items": []\n}\n');
      const p = changed();
      const manifest = {
        notes: [BC, AN].map((assessmentId) => ({
          assessmentId,
          notes: p.notes
            .filter((n) => n.assessmentId === assessmentId)
            .map((n) => ({ id: n.id, code: n.code, slug: n.slug })),
        })),
        tests: [],
      } as unknown as Pick<Manifest, 'notes' | 'tests'>;
      const run = (kind: 'note' | 'deck', id: string) =>
        unpublish({
          db: publicRpc,
          store,
          listFile,
          manifest,
          kind,
          id,
          reason: 'Error grave',
          by: 'dueño',
          confirm: async () => true,
        });

      // Published: the record's trigger takes it out of the draft in the same call.
      const before = await reads('public');
      const one = await run('note', 'QV-BC-C2-09');
      expect(one).toMatchObject({ applied: true, draft: null, calls: { db: 2 } });
      expect(await q(`select id from draft.notes where id = 'AP-BC-C2-09'`)).toEqual([]);
      expect(await q(`select id from public.notes where id = 'AP-BC-C2-09'`)).toEqual([]);

      // Only in the draft: one more call.
      const two = await run('note', 'AP-BC-C2-10');
      expect(two).toMatchObject({
        applied: true,
        result: { found: false },
        draft: { found: true, removed: 1 },
        calls: { db: 3 },
      });
      expect(await q(`select id from draft.notes where id = 'AP-BC-C2-10'`)).toEqual([]);

      // A deck: out of both, with its notes and cards.
      await run('deck', leafOf(AN));
      for (const s of ['public', 'draft']) {
        expect(
          await q(`select count(*)::int as n from ${s}.anki_cards where deck_id = $1`, [
            leafOf(AN),
          ]),
        ).toEqual([{ n: 0 }]);
        expect(await q(`select guid from ${s}.anki_notes where guid like 'an-%'`)).toEqual([]);
      }
      // Nothing else of public changed but what was taken off.
      const after = await reads('public');
      expect(after.quiz).toEqual(before.quiz);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('only service_role reaches the draft, with the privileges it has on public; nobody else', async () => {
    const ana = { sub: '00000000-0000-4000-8000-00000000000a', email: 'ana@ug.uchile.cl' };
    for (const who of [ana, null]) {
      for (const sql of [
        'select * from draft.notes',
        'select draft.import_state(null, null)',
        `select draft.save_notes('[]'::jsonb)`,
        'select public.reset_draft()',
        `select public.discard_draft_assessment('x')`,
        `select public.unpublish_draft('note', 'x')`,
        'select public.rebuild_draft()',
        'select * from public.draft_drift()',
      ]) {
        await expect(
          asUser(db, who, (tx) => tx.query(sql)),
          sql,
        ).rejects.toThrow(/permission denied/);
      }
    }
    // service_role: the draft's reads and the importer's writes, as in public; not making it again nor its record.
    expect(await service('select count(*)::int as n from draft.notes')).toEqual([{ n: 3 }]);
    expect(await service(`select draft.save_notes('[]'::jsonb) as r`)).toEqual([{ r: [] }]);
    for (const sql of [
      'select public.rebuild_draft()',
      'select * from public.draft_drift()',
      'select * from draft.anki_card_changes',
      'select * from public.draft_exclusions',
    ]) {
      await expect(service(sql), sql).rejects.toThrow(/permission denied/);
    }
    const tools = await q<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(
      `select proname, prosecdef, proconfig from pg_proc
        where pronamespace = 'public'::regnamespace
          and proname in ('rebuild_draft', 'reset_draft', 'discard_draft_assessment', 'unpublish_draft')
        order by 1`,
    );
    expect(tools).toHaveLength(4);
    for (const t of tools) {
      expect(t.prosecdef).toBe(true);
      expect(t.proconfig).toContain('search_path=""');
    }
  });

  it('the review link of the import report', () => {
    expect(draftReviewUrl({})).toBe('https://www.quintoventriculo.cl/settings/admin/releases');
    expect(draftReviewUrl({ QV_SITE_URL: 'http://localhost:5173/' })).toBe(
      'http://localhost:5173/settings/admin/releases',
    );
  });
});

describe('the migration on a database with content', () => {
  it('makes the draft equal to what is published, with no drift', async () => {
    db = await createDatabase('content', [], MIGRATION);
    await save(published, everything());
    await save(published, changed());
    await applyMigration(db, 'content', MIGRATION);
    expect(await q('select * from public.draft_drift()')).toEqual([]);
    expect(await reads('draft')).toEqual(await reads('public'));
  });

  // Revisión de cero (1.7, parte 1): as upgrade-1.3.test.ts does, production as it is (with something already taken
  // off the site): the migration changes nothing of what is published, and what was taken off does not reach the draft.
  it('changes nothing of what is published, nor of what was taken off', async () => {
    db = await createDatabase('content', [], MIGRATION);
    await save(published, everything());
    await save(published, changed());
    await service(
      `select public.unpublish_content('note', 'AP-BC-C2-09', 'Error grave', 'dueño', true)`,
    );
    const functions = () =>
      q<{ name: string; def: string }>(
        `select p.oid::regprocedure::text as name, pg_get_functiondef(p.oid) as def from pg_proc p
          where p.pronamespace = 'public'::regnamespace order by 1`,
      );
    const before = { rows: await dump('public'), functions: await functions() };
    await applyMigration(db, 'content', MIGRATION);
    const { 'r draft_exclusions': _new, ...rows } = await dump('public');
    expect(rows).toEqual(before.rows);
    // Every function of before stays as it was, but the card trigger's lock, which now names its schema.
    const lock = (f: { name: string; def: string }) =>
      f.name === 'anki_card_changed()'
        ? { ...f, def: f.def.replace("'public.anki_card_changes'", "'anki_card_changes'") }
        : f;
    const old = new Set(before.functions.map((f) => f.name));
    expect((await functions()).filter((f) => old.has(f.name)).map(lock)).toEqual(before.functions);
    expect(await q(`select id from draft.notes where id = 'AP-BC-C2-09'`)).toEqual([]);
    expect(await q('select * from public.draft_drift()')).toEqual([]);
  });
});

afterEach(() => {
  calls.length = 0;
});
